const https = require('https');
const fs = require('fs');

// .env 파일에서 API 키 읽기
let apiKey = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  const match = env.match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
} catch(e) {
  console.log('ERROR: .env 파일 읽기 실패:', e.message);
  process.exit(1);
}

if (!apiKey) {
  console.log('ERROR: .env 파일에 GEMINI_API_KEY가 없습니다.');
  process.exit(1);
}

console.log('API Key 앞 10자:', apiKey.substring(0, 10) + '...');

// gemini-2.0-flash 직접 테스트
const postData = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text: '안녕' }] }]
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path: '/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, res => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.candidates) {
        console.log('SUCCESS:', json.candidates[0].content.parts[0].text);
      } else {
        console.log('ERROR RESPONSE:', JSON.stringify(json, null, 2));
      }
    } catch(e) {
      console.log('RAW:', data.substring(0, 500));
    }
  });
});
req.on('error', e => console.error('Request error:', e));
req.write(postData);
req.end();
