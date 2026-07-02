const data = [
  { date: '2026-06-16', awayTeam: 'KT', homeTeam: '두산', matchup: 'KT vs 두산', ai1: 'KT', ai2: 'KT', ai3: 'KT', pick: 'KT', result: null, type: 'result' },
  { date: '2026-06-16', awayTeam: '키움', homeTeam: '삼성', matchup: '키움 vs 삼성', ai1: '삼성', ai2: '삼성', ai3: '삼성', pick: '삼성', result: null, type: 'result' },
  { date: '2026-06-16', awayTeam: '롯데', homeTeam: 'SSG', matchup: '롯데 vs SSG', ai1: '롯데', ai2: 'SSG', ai3: '롯데', pick: '롯데', result: null, type: 'result' },
  { date: '2026-06-16', awayTeam: 'LG', homeTeam: 'KIA', matchup: 'LG vs KIA', ai1: 'LG', ai2: 'LG', ai3: 'LG', pick: 'LG', result: null, type: 'result' },
  { date: '2026-06-16', awayTeam: '한화', homeTeam: 'NC', matchup: '한화 vs NC', ai1: 'NC', ai2: 'NC', ai3: '한화', pick: 'NC', result: null, type: 'result' }
];

async function run() {
  for (const game of data) {
    const res = await fetch('https://kbo-toto-analysis.vercel.app/api/admin/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(game)
    });
    console.log(await res.json());
  }
}
run();
