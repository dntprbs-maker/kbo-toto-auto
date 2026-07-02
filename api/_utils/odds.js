// The Odds API 배당률 조회 유틸 (cron.js / sync.js 공통)

// 영문 팀명 → 한국어 매핑 (The Odds API 반환값 변환용)
export const ODDS_TEAM_MAP = {
  'Kia Tigers': 'KIA', 'KIA Tigers': 'KIA', 'Samsung Lions': '삼성', 'LG Twins': 'LG', 'Doosan Bears': '두산',
  'KT Wiz': 'KT', 'SSG Landers': 'SSG', 'Lotte Giants': '롯데', 'Hanwha Eagles': '한화',
  'NC Dinos': 'NC', 'Kiwoom Heroes': '키움'
};

// 배당률 맵 빌드 (팀명 → 복수 북메이커 평균 배당률)
export function buildOddsMap(oddsJson) {
  const sumMap = {};
  if (!Array.isArray(oddsJson)) return {};
  for (const game of oddsJson) {
    for (const bookmaker of (game.bookmakers || [])) {
      const market = (bookmaker.markets || []).find(m => m.key === 'h2h');
      if (!market) continue;
      for (const outcome of (market.outcomes || [])) {
        const korName = ODDS_TEAM_MAP[outcome.name] || outcome.name;
        if (!sumMap[korName]) sumMap[korName] = { sum: 0, count: 0 };
        sumMap[korName].sum += outcome.price;
        sumMap[korName].count += 1;
      }
    }
  }
  const map = {};
  for (const [team, val] of Object.entries(sumMap)) {
    map[team] = Math.round((val.sum / val.count) * 100) / 100;
  }
  return map;
}

export async function fetchOddsJson() {
  if (!process.env.THE_ODDS_API_KEY) return null;
  const res = await fetch(`https://api.the-odds-api.com/v4/sports/baseball_kbo/odds/?apiKey=${process.env.THE_ODDS_API_KEY}&regions=eu,us&markets=h2h`);
  if (!res.ok) return null;
  return await res.json();
}
