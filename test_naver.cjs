const https = require('https');

const pad = n => n < 10 ? '0' + n : n;
const d = new Date();
// Get Korean date by adding 9 hours
const koDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
const dateStr = `${koDate.getUTCFullYear()}-${pad(koDate.getUTCMonth()+1)}-${pad(koDate.getUTCDate())}`;

const url = `https://api-gw.sports.naver.com/schedule/games/kbo?fromDate=${dateStr}&toDate=${dateStr}`;

https.get(url, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      console.log('Success!', json.result.games.length, 'games found.');
      console.log(json.result.games[0]);
    } catch(e) {
      console.log('Error parsing JSON:', e.message);
      console.log(body.substring(0, 200));
    }
  });
}).on('error', e => console.error(e));
