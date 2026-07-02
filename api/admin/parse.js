export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType = 'image/jpeg', rawText, gameDate, parseType } = req.body;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
    if (!imageBase64 && !rawText) return res.status(400).json({ error: '이미지 또는 텍스트 데이터가 필요합니다.' });

    let prompt = '';
    let responseMimeType = "application/json";
    let temperature = 0.1;
    let model = "gemini-1.5-pro";

    if (parseType === 'image') {
      prompt = "이 이미지는 KBO 야구 경기 결과 화면입니다.\n\n이미지에서 '종료'된 경기만 찾아서, 아래 JSON 배열 형식으로만 정확하게 응답해주세요.\n진행 중이거나 예정된 경기는 제외하세요.\n\n응답 예시:\n[\n  {\n    \"date\": \" + (gameDate || new Date().toISOString().split('T')[0]) + \",\n    \"awayTeam\": \"원정팀명\",\n    \"homeTeam\": \"홈팀명\",\n    \"awayScore\": 숫자,\n    \"homeScore\": 숫자,\n    \"winner\": \"승리팀명\"\n  }\n]\n\n규칙:\n- 왼쪽 팀이 원정(away), 오른쪽 팀이 홈(home)입니다.\n- winner는 점수가 높은 팀명을 그대로 적어주세요.\n- 동점일 경우 winner는 \"무승부\"로 적으세요.\n- 팀명은 한국어로 정확히 기입하세요. (예: 롯데, LG, KIA, 한화, 두산, SSG, NC, KT, 키움, 삼성)\n- JSON만 응답하고 다른 설명은 절대 쓰지 마세요.";
    } else if (parseType === 'prediction') {
      prompt = "아래는 KBO 야구 경기 승패 예측 데이터입니다.\n형식은 다양할 수 있습니다:\n- 여러 AI가 예측을 비교한 표 (반즈픽/별이/초록이 등 여러 명의 예측 + 승률 등)\n- 선발 매치업과 승률(%)이 있는 상세 예측 글\n다음 규칙으로 각 경기의 예측 정보를 JSON 배열로 정확하게 추출해주세요:\n\n1. 경기에 하나의 객체를 만드세요\n2. ai1은 '반즈픽' 또는 'Gemini Pro'의 예측, ai2는 '별이' 또는 'Gemini Flash'의 예측, ai3은 '초록이' 또는 'Gemini 2.0'의 예측을 추출하세요. 명시되어 있지 않으면 비워두세요.\n3. predictedWinner는 '승률이 높은 팀' 또는 가장 많이 예측한 팀으로 결정하세요.\n4. confidence는 승률(%)이 있으면 그대로, 없으면 승률 비율로 계산 (예: 3명 중 2명이면 \"중간\", 3명 모두면 \"높음\", 1명만이면 \"낮음\")\n5. reason은 선발 투수 정보, 예상 스코어, 승률 근거 등을 한 줄로 요약\n6. awayTeam은 \"A vs B\"에서 A(왼쪽), homeTeam은 B(오른쪽)\n\n응답 형식 (JSON만, 설명 없이):\n[\n  {\n    \"date\": \" + (gameDate || new Date().toISOString().split('T')[0]) + \",\n    \"awayTeam\": \"원정팀\",\n    \"homeTeam\": \"홈팀\",\n    \"ai1\": \"반즈픽 예측\",\n    \"ai2\": \"별이 예측\",\n    \"ai3\": \"초록이 예측\",\n    \"predictedWinner\": \"예측 승리팀\",\n    \"confidence\": \"높음 또는 중간 또는 낮음 또는 숫자%\",\n    \"reason\": \"예측 근거 한 줄 요약\"\n  }\n]";
    } else if (parseType === 'bet') {
      prompt = "아래는 사용자가 실제로 베팅한 스포츠 토토 영수증 이미지 또는 베팅 내역 텍스트입니다.\n다음 정보를 추출해서 JSON 형식으로만 응답해주세요. 부가 설명은 절대 하지 마세요.\n\n규칙:\n1. \"date\": 영수증에 표시된 베팅 일자 또는 발매 일시 (YYYY-MM-DD 형식). 없으면 \" + (gameDate || new Date().toISOString().split('T')[0]) + \" 사용.\n2. \"amount\": 베팅 금액 (숫자만, 예: 10000). 단위 제외.\n3. \"odds\": 총 배당률 (숫자만, 소수점 포함, 예: 4.2). 없으면 1.0.\n4. \"picks\": 베팅한 경기들의 배열. 각 경기는 다음을 포함:\n   - \"matchup\": \"원정팀 vs 홈팀\" 형식 (예: \"KIA vs 삼성\").\n   - \"pick\": 내가 베팅한 승리팀 이름 또는 결과 (예: \"KIA\", \"무승부\").\n5. \"type\": 경기 수가 1개면 \"single\", 5경기 모두 같은 예측(만장일치)에 걸었으면 \"unanimous\", 그 외 여러 경기면 \"allfive\"로 추정. 판단이 애매하면 \"custom\".\n6. \"status\": \"pending\"으로 고정.\n\n응답 형식 예시:\n{\n  \"date\": \"2026-06-15\",\n  \"amount\": 50000,\n  \"odds\": 3.8,\n  \"type\": \"custom\",\n  \"status\": \"pending\",\n  \"picks\": [\n    { \"matchup\": \"SSG vs LG\", \"pick\": \"LG\" },\n    { \"matchup\": \"키움 vs KT\", \"pick\": \"KT\" }\n  ]\n}";
    } else {
      return res.status(400).json({ error: 'Invalid parseType' });
    }

    const parts = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType, data: imageBase64 } });
    }
    if (rawText) {
      parts.push({ text: 다음 텍스트에서 정보를 추출해주세요:\n\n + rawText + \n\n + prompt });
    } else {
      parts.push({ text: prompt });
    }

    const response = await fetch(
      https://generativelanguage.googleapis.com/v1beta/models/ + model + :generateContent?key= + geminiApiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature, responseMimeType }
        })
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('응답 텍스트를 찾을 수 없습니다.');

    const cleaned = text.replace(/`json/g, '').replace(/`/g, '').trim();
    const parsedData = JSON.parse(cleaned);

    if (parseType === 'bet') {
      return res.status(200).json({ success: true, bet: parsedData });
    } else if (parseType === 'prediction') {
      return res.status(200).json({ success: true, predictions: parsedData, count: parsedData.length });
    } else {
      return res.status(200).json({ success: true, games: parsedData, count: parsedData.length });
    }

  } catch (error) {
    console.error('parse API error:', error);
    res.status(500).json({ error: error.message });
  }
}