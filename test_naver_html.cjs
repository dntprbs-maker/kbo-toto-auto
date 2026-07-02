const https = require('https');
https.get('https://sports.news.naver.com/kbaseball/schedule/index', (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(body.substring(0, 1000));
    console.log("Length:", body.length);
    if(body.includes('기아') || body.includes('KIA')) console.log("Found KIA!");
  });
});
