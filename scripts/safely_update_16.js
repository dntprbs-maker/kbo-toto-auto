const updateData = [
  { id: '6BKByDlE1MSQjWV1YBri', result: 'NC' }, // 한화 vs NC
  { id: 'ULFPWnEMy8vYeaLFYQgL', result: 'LG' }, // LG vs KIA
  { id: 'ZmcATZ537jTp4jEEaKkM', result: '롯데' }, // 롯데 vs SSG
  { id: 'gEAVaH2zw8WTElEQ3bhL', result: '삼성' }, // 키움 vs 삼성
  { id: '0KIv12O039XXRcGTphuU', result: 'KT' }  // KT vs 두산
];

async function run() {
  for (const game of updateData) {
    const res = await fetch('https://kbo-toto-analysis.vercel.app/api/admin/games', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(game)
    });
    console.log(await res.json());
  }
}
run();
