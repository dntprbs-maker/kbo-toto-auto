// AI 3개(반짝이/별이/초롱이) 예측 로직 - cron.js / sync.js 공통
import { fetchOddsJson } from './odds.js';

export const DEFAULT_AI_MODELS = [
  { name: 'ai1', label: '반짝이', model: 'gemini-2.5-pro', persona: '당신은 KBO 스탯 전문가입니다. 아래 제공된 [스탯 데이터]를 최우선으로 분석하여 객관적인 수치와 전력 위주로만 냉정하게 승패를 예측하세요.' },
  { name: 'ai2', label: '별이',   model: 'claude-sonnet-5', persona: '당신은 이변을 찾는 비판적인 기자입니다. 아래 제공된 [최신 뉴스/여론]을 바탕으로, 정배당(강팀)이 질 수 있는 이변의 시나리오를 집중적으로 탐색하세요. 약팀이 이길 단서가 조금이라도 있다면 과감히 약팀을, 도저히 이변이 불가능하다면 강팀을 예측하세요.' },
  { name: 'ai3', label: '초롱이', model: 'gpt-4o', persona: '당신은 가치 베팅(Value Betting) 전문가입니다. 아래 제공된 [배당률 데이터]를 보고 배당률 대비 승리 확률(가성비)을 분석하세요. 정배당 팀의 배당 메리트가 낮고 역배당 팀의 가치가 높다면 과감히 역배당을 추천하고, 그렇지 않다면 안전한 픽을 하세요.' },
];

// 개별 AI 모델 호출 (GPT 계열은 OpenAI, 나머지는 Gemini)
export async function predictWithModel(geminiApiKey, aiConfig, scrapedData, scheduledGames, todayResults, tomorrowISO) {
  if (scheduledGames.length === 0) return [];

  const gamesText = scheduledGames
    .map(g => `${g.awayTeam}(원정) vs ${g.homeTeam}(홈) - ${g.gameTime}`)
    .join('\n');

  const prompt = `${aiConfig.persona}
내일(${tomorrowISO}) 예정된 KBO 경기 일정입니다:
${gamesText}

오늘 경기 결과 참고:
${(todayResults || []).map(g => `${g.awayTeam} vs ${g.homeTeam}: ${g.awayScore}:${g.homeScore}`).join('\n')}

[당신에게만 특별히 제공되는 데이터 소스]
${scrapedData}

위의 당신만의 전문 데이터를 바탕으로 각 경기의 승패를 예측해서 아래 JSON 배열 형식으로만 응답해줘. 마크다운이나 설명은 절대 쓰지 마.
[
  {
    "homeTeam": "홈팀명",
    "awayTeam": "원정팀명",
    "predictedWinner": "예측 승리팀명",
    "confidence": "높음/중간/낮음",
    "reason": "예측 근거 (당신의 페르소나에 맞는 이유를 1줄 요약)"
  }
]`;

  let responseText = '[]';

  if (aiConfig.model.startsWith('gpt')) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return [{ predictedWinner: '', confidence: '낮음', reason: 'Vercel에 OPENAI_API_KEY 환경변수가 설정되지 않아 GPT-4o 예측을 진행할 수 없습니다.' }];
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024
      })
    });
    if (!res.ok) throw new Error(`${aiConfig.model} API 실패: ${res.status} - ${(await res.text()).substring(0, 300)}`);
    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content || '[]';
  } else if (aiConfig.model.startsWith('claude')) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return [{ predictedWinner: '', confidence: '낮음', reason: 'Vercel에 ANTHROPIC_API_KEY 환경변수가 설정되지 않아 클로드 예측을 진행할 수 없습니다.' }];
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`${aiConfig.model} API 실패: ${res.status} - ${(await res.text()).substring(0, 300)}`);
    const data = await res.json();
    responseText = data.content?.[0]?.text || '[]';
  } else {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.model}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      })
    });
    if (!res.ok) throw new Error(`${aiConfig.model} API 실패: ${res.status} - ${(await res.text()).substring(0, 300)}`);
    const data = await res.json();
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  }

  let clean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) clean = match[0];
    return JSON.parse(clean);
  } catch (e) {
    console.error('JSON Parse Error:', e, 'Raw:', responseText);
    return [];
  }
}

// 🔭 정찰대: 제미나이 구글 검색으로 스탯/뉴스/배당 데이터를 한 번에 수집 (AI 3개가 나눠 씀)
export async function gatherScoutingData(geminiApiKey, scheduledGames, tomorrowISO) {
  console.log('[정찰대] 구글 검색을 통한 실시간 KBO 데이터 수집 시작...');
  const matchNames = scheduledGames.map(g => `${g.awayTeam} vs ${g.homeTeam}`).join(', ');
  const searchPrompt = `${tomorrowISO} KBO 리그 다음 경기들에 대한 실시간 정보를 구글에서 검색해서 요약해줘.\n대상 경기: ${matchNames}\n\n반드시 아래 JSON 형식으로만 응답해 (백틱이나 마크다운 없이 순수 JSON만):\n{\n  "stats": "예상 선발투수 방어율(ERA), 최근 팀 타율 등 순수 숫자/통계 기반 요약",\n  "news": "최근 3경기 팀 분위기(연승/연패), 부상 결장, 핵심 이슈 등 여론 기반 요약"\n}`;

  try {
    let oddsData = '[경고] 배당률 데이터 수집 실패';
    const oddsJson = await fetchOddsJson();
    if (oddsJson) oddsData = '실시간 KBO 배당률 데이터 (The Odds API): ' + JSON.stringify(oddsJson);

    const searchRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      }
    );
    const searchData = await searchRes.json();
    const rawText = searchData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    console.log('[정찰대] 데이터 수집 및 페르소나별 필터링 완료!');
    return {
      ai1: parsed.stats || '[경고] 스탯 데이터 수집 실패',
      ai2: parsed.news || '[경고] 뉴스 데이터 수집 실패',
      ai3: oddsData
    };
  } catch (err) {
    console.error('[정찰대 오류]', err);
    return {
      ai1: '[경고] 검색 실패. 기본 지식으로 분석하세요.',
      ai2: '[경고] 검색 실패. 기본 지식으로 분석하세요.',
      ai3: '[경고] 검색 실패. 기본 지식으로 분석하세요.'
    };
  }
}
