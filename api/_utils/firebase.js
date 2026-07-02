import crypto from 'crypto';

export async function getFirebaseAccessToken() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 없습니다.');
  
  const serviceAccount = JSON.parse(serviceAccountRaw);
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const toBase64Url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      
  const signatureInput = `${toBase64Url(header)}.${toBase64Url(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  if (!res.ok) throw new Error('토큰 발급 실패');
  const data = await res.json();
  return { accessToken: data.access_token, projectId: serviceAccount.project_id };
}

export function parseFirestoreDoc(doc) {
  if (!doc.fields) return { id: doc.name.split('/').pop() };
  
  const parsed = { id: doc.name.split('/').pop() };
  for (const [key, value] of Object.entries(doc.fields)) {
    if (value.stringValue !== undefined) {
      let v = value.stringValue;
      if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
        try { v = JSON.parse(v); } catch(e) {}
      }
      parsed[key] = v;
    }
    else if (value.integerValue !== undefined) parsed[key] = Number(value.integerValue);
    else if (value.booleanValue !== undefined) parsed[key] = value.booleanValue;
    else if (value.doubleValue !== undefined) parsed[key] = Number(value.doubleValue);
  }
  return parsed;
}

// 정확히 해당 날짜(date)의 데이터만 쿼리 (pageSize 제한 회피용 runQuery)
export async function fetchDocumentsByDate(accessToken, projectId, collection, dateStr) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'date' },
              op: 'EQUAL',
              value: { stringValue: dateStr }
            }
          }
        }
      })
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(item => {
    const doc = item.document;
    if (!doc) return null;
    return parseFirestoreDoc(doc);
  }).filter(Boolean);
}

// date + type(+ single이면 picks까지) 기준 중복 체크 후 베팅 생성
export async function upsertBet(accessToken, projectId, betData, existingBets) {
  const alreadyExists = existingBets.find(b => b.date === betData.date && b.type === betData.type
    && (betData.type === 'single' ? b.picks === betData.picks : true)
  );
  if (alreadyExists) return { status: 'skipped' };

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bets`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(betData) })
    }
  );
  if (!res.ok) throw new Error(`베팅 저장 실패: ${await res.text()}`);
  return { status: 'created' };
}

export function toFirestoreFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    if (value === null) fields[key] = { nullValue: null };
    else if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'number') {
      if (Number.isInteger(value)) fields[key] = { integerValue: String(value) };
      else fields[key] = { doubleValue: value };
    }
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else if (typeof value === 'object') fields[key] = { stringValue: JSON.stringify(value) };
  }
  return fields;
}
