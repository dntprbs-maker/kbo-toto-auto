const https = require('https');

const data = JSON.stringify({
  userRequest: {
    utterance: '오늘 기아타이거즈가 LG트윈스를 상대로 5대3으로 멋지게 승리했어!'
  }
});

const options = {
  hostname: 'kbo-toto-analysis.vercel.app',
  port: 443,
  path: '/api/kakao',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
