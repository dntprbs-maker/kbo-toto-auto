export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { homeTeam, awayTeam, gameDate } = req.body;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
    if (!homeTeam || !awayTeam) return res.status(400).json({ error: '홈팀과 원정팀 정보가 필요합니다.' });

    const prompt = `당신은 KBO 야구 전문가이자 데이터 분석가입니다.
    다음 경기에 대한 **심층 분석 리포트**와 **추천 배팅 가이드**를 작성해주세요.

    경기: ${awayTeam}(원정) vs ${homeTeam}(홈)
    날짜: ${gameDate || '내일'}

    다음 항목들을 포함하여 작성해 주세요:
    1. 양 팀의 최근 흐름 및 전력 비교
    2. 홈/원정 이점에 따른 분석
    3. 핵심 관전 포인트 (키 플레이어 등)
    4. 🤖 최종 예측 및 배팅 추천 (승리 확률 포함)

    응답은 마크다운 형식으로 보기 좋게 정리해서 작성해 주세요.`;

    // 딥다이브 분석은 시간이 걸릴 수 있으므로 2.5-flash 또는 pro 모두 가능. 여기서는 2.5-flash 사용.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    if (!response.ok) throw new Error(`Gemini API 오류: ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '분석 결과를 가져오지 못했습니다.';

    return res.status(200).json({ success: true, report: text });
  } catch (error) {
    console.error('Deep AI Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
