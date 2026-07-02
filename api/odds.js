export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'THE_ODDS_API_KEY 환경변수가 Vercel에 설정되지 않았습니다.' });
  }

  try {
    // KBO 야구 경기, 승무패(Moneyline, h2h) 데이터, EU/US 지역 북메이커 혼합
    const url = `https://api.the-odds-api.com/v4/sports/baseball_kbo/odds/?apiKey=${apiKey}&regions=eu,us&markets=h2h`;

    const fetchRes = await fetch(url);
    const rawText = await fetchRes.text();

    // The Odds API가 에러를 주면 그 상태코드와 본문을 그대로 노출 (진단용)
    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({
        error: `The Odds API 오류 (상태 ${fetchRes.status})`,
        detail: rawText.substring(0, 300),
        // 남은 사용량 헤더도 함께 노출
        quotaRemaining: fetchRes.headers.get('x-requests-remaining'),
        quotaUsed: fetchRes.headers.get('x-requests-used')
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({ error: 'The Odds API 응답이 JSON이 아닙니다.', detail: rawText.substring(0, 300) });
    }

    // 정상 응답이지만 경기가 0건이면 그 사실을 알려줌 (비시즌/미제공)
    if (Array.isArray(data) && data.length === 0) {
      return res.status(200).json({
        empty: true,
        message: 'The Odds API는 정상이지만 현재 KBO 배당 데이터가 0건입니다 (비시즌이거나 아직 배당 미오픈).',
        quotaRemaining: fetchRes.headers.get('x-requests-remaining')
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Odds API fetch error:', error);
    return res.status(500).json({ error: '배당 데이터 호출 실패', detail: String(error?.message || error) });
  }
}
