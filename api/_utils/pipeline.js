// KBO 예측 파이프라인 단계별 액션 (cron.js 자동 실행 / admin/sync.js 수동 대시보드 공용)
import { getFirebaseAccessToken, fetchDocumentsByDate, upsertBet } from './firebase.js';
import { getKoreaDates, fetchKboSchedule, parseKboGames, parseKboScheduled } from './kbo.js';
import { DEFAULT_AI_MODELS, predictWithModel, gatherScoutingData } from './predict.js';
import { buildOddsMap, fetchOddsJson } from './odds.js';

async function upsertGameResult(accessToken, projectId, dateISO, game, existingGames) {
  const existing = existingGames.find(doc => doc.awayTeam === game.awayTeam && doc.homeTeam === game.homeTeam);
  const fields = {
    date: { stringValue: dateISO },
    homeTeam: { stringValue: game.homeTeam },
    awayTeam: { stringValue: game.awayTeam },
    homeScore: { stringValue: String(game.homeScore) },
    awayScore: { stringValue: String(game.awayScore) },
    winner: { stringValue: game.winner },
    type: { stringValue: 'result' },
    createdAt: { stringValue: new Date().toISOString() }
  };
  const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = existing
    ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games/${existing.id}?${updateMask}`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games`;
  await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return existing ? 'updated' : 'created';
}

async function loadAiModels(accessToken, projectId) {
  const aiModelsRaw = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/ai_models?pageSize=100`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }).then(r => r.ok ? r.json() : null);

  if (!aiModelsRaw?.documents?.length) return DEFAULT_AI_MODELS;

  return aiModelsRaw.documents.map(doc => {
    const id = doc.name.split('/').pop();
    const parsed = {};
    for (const [k, v] of Object.entries(doc.fields || {})) {
      if ('stringValue' in v) parsed[k] = v.stringValue;
      else if ('integerValue' in v) parsed[k] = Number(v.integerValue);
    }
    return { id, ...parsed };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// 같은 날 재실행 시 구글검색 정찰(비용/사용량 발생)을 반복하지 않도록 Firestore에 캐시
async function getScoutingData(accessToken, projectId, geminiApiKey, scheduledGames, tomorrowISO) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/scouting/${tomorrowISO}`;
  const existing = await fetch(docUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (existing.ok) {
    const doc = await existing.json();
    if (doc.fields?.ai1) {
      return { ai1: doc.fields.ai1.stringValue, ai2: doc.fields.ai2.stringValue, ai3: doc.fields.ai3.stringValue };
    }
  }

  const scoutData = await gatherScoutingData(geminiApiKey, scheduledGames, tomorrowISO);
  await fetch(docUrl, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        ai1: { stringValue: scoutData.ai1 },
        ai2: { stringValue: scoutData.ai2 },
        ai3: { stringValue: scoutData.ai3 },
        createdAt: { stringValue: new Date().toISOString() }
      }
    })
  });
  return scoutData;
}

// =====================================================
// 📅 [0단계] 일정 가져오기 (오늘 결과 저장 + 내일 예정 확인)
// =====================================================
export async function actionSchedule() {
  const D = getKoreaDates();
  const kboData = await fetchKboSchedule(D.todayMonth, D.todayYear);
  const todayResults = parseKboGames(kboData, D.todayLabel);

  let tomorrowGames = [];
  if (!D.isTomorrowMonday) {
    const tomorrowData = D.tomorrowMonth !== D.todayMonth
      ? await fetchKboSchedule(D.tomorrowMonth, D.tomorrowYear)
      : kboData;
    tomorrowGames = parseKboScheduled(tomorrowData, D.tomorrowLabel);
  }

  const { accessToken, projectId } = await getFirebaseAccessToken();
  const existingGames = await fetchDocumentsByDate(accessToken, projectId, 'games', D.todayISO);

  let savedCount = 0, updatedCount = 0;
  for (const game of todayResults) {
    const status = await upsertGameResult(accessToken, projectId, D.todayISO, game, existingGames);
    if (status === 'created') savedCount++; else updatedCount++;
  }

  return {
    success: true,
    message: 'KBO 일정 가져오기 완료',
    today: { date: D.todayISO, label: D.todayLabel, games: todayResults, count: todayResults.length, saved: savedCount, updated: updatedCount },
    tomorrow: { date: D.tomorrowISO, label: D.tomorrowLabel, games: tomorrowGames, count: tomorrowGames.length, isMonday: D.isTomorrowMonday }
  };
}

// =====================================================
// 🤖 [1~3단계] AI 개별 예측 (modelIndex: 0=반짝이, 1=별이, 2=초롱이)
// 셋 다 같은 정찰 데이터(구글검색 스탯/뉴스 + 배당률)를 나눠 받음
// =====================================================
export async function actionAi(modelIndex) {
  const idx = Number(modelIndex);
  if (isNaN(idx) || idx < 0 || idx > 2) throw new Error('Invalid modelIndex');

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) throw new Error('GEMINI_API_KEY 환경변수가 없습니다.');

  const D = getKoreaDates();
  if (D.isTomorrowMonday) {
    return { success: true, message: '내일은 월요일이라 경기가 없습니다.', matchCount: 0 };
  }

  const [tomorrowKboData, { accessToken, projectId }] = await Promise.all([
    fetchKboSchedule(D.tomorrowMonth, D.tomorrowYear),
    getFirebaseAccessToken()
  ]);

  const scheduledGames = parseKboScheduled(tomorrowKboData, D.tomorrowLabel);
  if (scheduledGames.length === 0) return { success: true, message: '내일 예정 경기가 없습니다.', matchCount: 0 };

  const aiModels = await loadAiModels(accessToken, projectId);
  const targetAi = aiModels[idx];
  if (!targetAi) throw new Error('AI Model not found');

  const scoutData = await getScoutingData(accessToken, projectId, geminiApiKey, scheduledGames, D.tomorrowISO);
  const scrapedData = scoutData[targetAi.name] || '';

  const predictions = await predictWithModel(geminiApiKey, targetAi, scrapedData, scheduledGames, [], D.tomorrowISO);

  for (const game of scheduledGames) {
    const p = predictions.find(pred => {
      const hTeam = pred.homeTeam || pred['홈팀명'] || pred['홈팀'];
      const aTeam = pred.awayTeam || pred['원정팀명'] || pred['원정팀'];
      return hTeam === game.homeTeam || aTeam === game.awayTeam;
    }) || {};

    const pick = p.predictedWinner || p['예측 승리팀명'] || p['예측승리팀'] || p['승리팀'] || game.homeTeam;
    const reason = p.reason || p['예측 근거'] || p['근거'] || '';

    const docId = `pred_${D.tomorrowISO}_${game.homeTeam}_${game.awayTeam}`.replace(/\s+/g, '_');
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/predictions/${encodeURIComponent(docId)}`;

    const fields = {
      date: { stringValue: D.tomorrowISO },
      homeTeam: { stringValue: game.homeTeam },
      awayTeam: { stringValue: game.awayTeam },
      type: { stringValue: 'prediction' },
      createdAt: { stringValue: new Date().toISOString() }
    };
    fields[targetAi.name] = { stringValue: pick };
    fields[`${targetAi.name}_reason`] = { stringValue: reason };

    const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    await fetch(`${docUrl}?${updateMask}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  }

  return { success: true, ai: targetAi.name, matchCount: scheduledGames.length };
}

// =====================================================
// 🧩 [4단계] 예측 취합(다수결) + 오늘 경기 결과 저장
// =====================================================
export async function actionMerge() {
  const D = getKoreaDates();
  const [{ accessToken, projectId }, kboData] = await Promise.all([
    getFirebaseAccessToken(),
    fetchKboSchedule(D.todayMonth, D.todayYear)
  ]);

  const todayResults = parseKboGames(kboData, D.todayLabel);
  const existingGames = await fetchDocumentsByDate(accessToken, projectId, 'games', D.todayISO);
  for (const game of todayResults) {
    await upsertGameResult(accessToken, projectId, D.todayISO, game, existingGames);
  }

  if (D.isTomorrowMonday) {
    return { success: true, merged: 0, gameResults: todayResults.length, message: '내일은 월요일이라 예측 병합 없음.' };
  }

  const tomorrowPreds = await fetchDocumentsByDate(accessToken, projectId, 'predictions', D.tomorrowISO);
  let updatedCount = 0;
  for (const pred of tomorrowPreds) {
    const votes = [pred.ai1, pred.ai2, pred.ai3].filter(Boolean);
    if (votes.length === 0) continue;

    const voteMap = {};
    votes.forEach(v => { voteMap[v] = (voteMap[v] || 0) + 1; });
    const sorted = Object.entries(voteMap).sort((a, b) => b[1] - a[1]);
    const finalPick = sorted[0][0];
    const maxVotes = sorted[0][1];
    const conf = maxVotes === 3 ? '높음' : maxVotes >= 2 ? '중간' : '낮음';
    const reason = pred.ai1_reason || pred.ai2_reason || pred.ai3_reason || '';

    const fields = {
      predictedWinner: { stringValue: finalPick },
      confidence: { stringValue: conf },
      reason: { stringValue: reason }
    };
    const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/predictions/${pred.id}?${updateMask}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    updatedCount++;
  }

  return { success: true, merged: updatedCount, gameResults: todayResults.length };
}

// =====================================================
// 💰 [5단계] 배팅 내역 생성 (단독 / 도전경기 / 만장일치)
// =====================================================
export async function actionBets() {
  const D = getKoreaDates();
  if (D.isTomorrowMonday) {
    return { success: true, createdCount: 0, message: '내일은 월요일이라 배팅 없음.' };
  }

  const { accessToken, projectId } = await getFirebaseAccessToken();

  const existingPreds = await fetchDocumentsByDate(accessToken, projectId, 'predictions', D.tomorrowISO);
  const tomorrowPreds = existingPreds.filter(p => p.predictedWinner);
  if (tomorrowPreds.length === 0) {
    throw new Error('내일 예측 데이터가 없습니다. 4단계(예측 취합)를 먼저 실행하세요.');
  }

  const oddsJson = await fetchOddsJson();
  const oddsMap = oddsJson ? buildOddsMap(oddsJson) : {};

  const existingBets = await fetchDocumentsByDate(accessToken, projectId, 'bets', D.tomorrowISO);
  const BET_AMOUNT = 100;

  const validPredictions = tomorrowPreds
    .map(pred => ({
      ...pred,
      finalOdds: oddsMap[pred.predictedWinner] || 1.80,
      isUnanimous: pred.confidence === '높음'
    }))
    .filter(pred => pred.finalOdds !== null && pred.predictedWinner !== '무승부');

  let createdCount = 0;
  if (validPredictions.length > 0) {
    for (const pred of validPredictions) {
      const result = await upsertBet(accessToken, projectId, {
        date: D.tomorrowISO, amount: BET_AMOUNT,
        odds: Math.round(pred.finalOdds * 100) / 100,
        type: 'single', status: 'pending',
        picks: JSON.stringify([{ matchup: `${pred.awayTeam} vs ${pred.homeTeam}`, pick: pred.predictedWinner }]),
        createdAt: new Date().toISOString()
      }, existingBets);
      if (result.status === 'created') createdCount++;
    }

    const challengeOdds = validPredictions.reduce((acc, p) => acc * p.finalOdds, 1);
    const challengeResult = await upsertBet(accessToken, projectId, {
      date: D.tomorrowISO, amount: BET_AMOUNT,
      odds: Math.round(challengeOdds * 100) / 100,
      type: 'allfive', status: 'pending',
      picks: JSON.stringify(validPredictions.map(p => ({ matchup: `${p.awayTeam} vs ${p.homeTeam}`, pick: p.predictedWinner }))),
      createdAt: new Date().toISOString()
    }, existingBets);
    if (challengeResult.status === 'created') createdCount++;

    const unanimousPreds = validPredictions.filter(p => p.isUnanimous);
    if (unanimousPreds.length >= 2) {
      const uniOdds = unanimousPreds.reduce((acc, p) => acc * p.finalOdds, 1);
      const uniResult = await upsertBet(accessToken, projectId, {
        date: D.tomorrowISO, amount: BET_AMOUNT,
        odds: Math.round(uniOdds * 100) / 100,
        type: 'unanimous', status: 'pending',
        picks: JSON.stringify(unanimousPreds.map(p => ({ matchup: `${p.awayTeam} vs ${p.homeTeam}`, pick: p.predictedWinner }))),
        createdAt: new Date().toISOString()
      }, existingBets);
      if (uniResult.status === 'created') createdCount++;
    }
  }

  return { success: true, createdCount };
}
