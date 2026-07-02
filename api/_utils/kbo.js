// KBO 공식 API 일정/결과 조회 + 한국시간 날짜 계산 (cron.js / sync.js 공통)

export function getKoreaDates() {
  const pad = n => n < 10 ? '0' + n : String(n);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();
  let koNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // 야구장 시간표: 새벽 6시 이전(0~5시)은 전날로 간주하여 자정 넘김 오류 방지
  if (koNow.getUTCHours() < 6) koNow = new Date(koNow.getTime() - 24 * 60 * 60 * 1000);
  const tomorrowKo = new Date(koNow.getTime() + 24 * 60 * 60 * 1000);

  const todayMonth = koNow.getUTCMonth() + 1;
  const todayDay = koNow.getUTCDate();
  const todayYear = koNow.getUTCFullYear();
  const tomorrowMonth = tomorrowKo.getUTCMonth() + 1;
  const tomorrowDay = tomorrowKo.getUTCDate();
  const tomorrowYear = tomorrowKo.getUTCFullYear();

  return {
    pad, dayNames,
    todayMonth, todayDay, todayYear,
    todayISO: `${todayYear}-${pad(todayMonth)}-${pad(todayDay)}`,
    todayLabel: `${pad(todayMonth)}.${pad(todayDay)}(${dayNames[koNow.getUTCDay()]})`,
    tomorrowMonth, tomorrowDay, tomorrowYear,
    tomorrowISO: `${tomorrowYear}-${pad(tomorrowMonth)}-${pad(tomorrowDay)}`,
    tomorrowLabel: `${pad(tomorrowMonth)}.${pad(tomorrowDay)}(${dayNames[tomorrowKo.getUTCDay()]})`,
    isTomorrowMonday: tomorrowKo.getUTCDay() === 1
  };
}

export async function fetchKboSchedule(month, year) {
  const pad = n => n < 10 ? '0' + n : String(n);
  const body = `leId=1&srIdList=0%2C9&seasonId=${year}&gameMonth=${pad(month)}&teamId=`;
  const res = await fetch('https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    },
    body
  });
  if (!res.ok) throw new Error(`KBO API 연결 실패 (상태코드: ${res.status})`);
  return await res.json();
}

// KBO API 응답에서 경기 결과 파싱 (Class='play', Text='한화3vs5두산' 형식)
export function parseKboGames(apiData, targetDate) {
  const games = [];
  if (!apiData?.rows) return games;
  let currentDate = '';
  for (const rowObj of apiData.rows) {
    const row = rowObj.row;
    if (!row) continue;
    const dateCell = row.find(cell => cell.Class === 'day');
    if (dateCell) currentDate = dateCell.Text.replace(/<[^>]+>/g, '').trim();
    if (currentDate !== targetDate) continue;
    const playCell = row.find(c => c.Class === 'play');
    if (!playCell) continue;
    const playText = playCell.Text.replace(/<[^>]+>/g, '').trim();
    const playMatch = playText.match(/^(.+?)(\d+)vs(\d+)(.+)$/);
    if (playMatch) {
      const awayTeam = playMatch[1].trim();
      const awayScore = parseInt(playMatch[2]);
      const homeScore = parseInt(playMatch[3]);
      const homeTeam = playMatch[4].trim();
      games.push({
        homeTeam, awayTeam, homeScore, awayScore,
        winner: homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : '무승부'
      });
    }
  }
  return games;
}

// 예정 경기(내일) 파싱: Class='play', Text='팀A vs 팀B' 형식 (점수 없음, 시간만 있음)
export function parseKboScheduled(apiData, targetDate) {
  const games = [];
  if (!apiData?.rows) return games;
  let currentDate = '';
  for (const rowObj of apiData.rows) {
    const row = rowObj.row;
    if (!row) continue;
    const dateCell = row.find(cell => cell.Class === 'day');
    if (dateCell) currentDate = dateCell.Text.replace(/<[^>]+>/g, '').trim();
    if (currentDate !== targetDate) continue;
    const timeCell = row.find(c => c.Class === 'time');
    const playCell = row.find(c => c.Class === 'play');
    if (!timeCell || !playCell) continue;
    const timeText = timeCell.Text.replace(/<[^>]+>/g, '').trim();
    const playText = playCell.Text.replace(/<[^>]+>/g, '').trim();
    if (playText.includes('vs') && !/\d+vs\d+/.test(playText)) {
      const [awayTeam, homeTeam] = playText.split('vs').map(s => s.trim());
      if (awayTeam && homeTeam) games.push({ homeTeam, awayTeam, gameTime: timeText });
    }
  }
  return games;
}
