
export default async function handler(req, res) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) {
    return res.status(500).json({ error: 'Firebase credentials missing' });
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);
  const projectId = serviceAccount.project_id;
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;

  // 1. JWT 토큰 발급
  let accessToken;
  try {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };
    const toBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signatureInput = `${toBase64Url(header)}.${toBase64Url(claim)}`;
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const jwt = `${signatureInput}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Token issue failed');
    accessToken = tokenData.access_token;
  } catch (err) {
    return res.status(500).json({ error: 'Auth failed' });
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/ai_models`;

  if (req.method === 'GET') {
    const r = await fetch(url + '?pageSize=100', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) return res.status(500).json({ error: 'Failed to fetch' });
    const data = await r.json();
    const models = (data.documents || []).map(doc => ({
      id: doc.name.split('/').pop(),
      name: doc.fields.name?.stringValue || '',
      label: doc.fields.label?.stringValue || '',
      model: doc.fields.model?.stringValue || '',
      persona: doc.fields.persona?.stringValue || ''
    }));
    return res.status(200).json(models);
  }

  if (req.method === 'POST') {
    // Delete existing models
    const getR = await fetch(url + '?pageSize=100', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (getR.ok) {
      const existing = await getR.json();
      if (existing.documents) {
        for (const doc of existing.documents) {
          await fetch(`https://firestore.googleapis.com/v1/${doc.name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
        }
      }
    }
    
    // Insert new models
    const models = req.body;
    for (let i = 0; i < models.length; i++) {
      const m = models[i];
      await fetch(url + `?documentId=ai${i+1}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: m.name },
            label: { stringValue: m.label },
            model: { stringValue: m.model },
            persona: { stringValue: m.persona }
          }
        })
      });
    }
    return res.status(200).json({ message: 'Saved successfully' });
  }

  res.status(405).end();
}
