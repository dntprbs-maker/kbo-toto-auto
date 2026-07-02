const https = require('https');

const postData = 'leId=1&srIdList=0,9&seasonId=2024&gameMonth=06&teamId=';

const options = {
  hostname: 'www.koreabaseball.com',
  port: 443,
  path: '/ws/Schedule.asmx/GetScheduleList',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(body.substring(0, 500));
  });
});

req.on('error', e => console.error(e));
req.write(postData);
req.end();
