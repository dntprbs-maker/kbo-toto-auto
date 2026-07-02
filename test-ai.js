const fetch = require('node-fetch');
const env = require('fs').readFileSync('.env.local', 'utf8');
const openaiKey = env.match(/OPENAI_API_KEY=(.+)/)[1].trim();

async function test() {
  const prompt = `
  다음 KBO 경기들에 대해 승리 팀을 예측해줘.
  1. SSG vs NC
  2. 삼성 vs 한화
  3. 롯데 vs 키움
  4. 두산 vs LG
  5. KIA vs KT
  
  반드시 아래 JSON 형식으로만 답해.
  [
    { "match": "SSG vs NC", "predictedWinner": "NC" },
    { "match": "삼성 vs 한화", "predictedWinner": "한화" },
    { "match": "롯데 vs 키움", "predictedWinner": "키움" },
    { "match": "두산 vs LG", "predictedWinner": "LG" },
    { "match": "KIA vs KT", "predictedWinner": "KT" }
  ]
  `;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });
  const data = await res.json();
  console.log(data.choices[0].message.content);
}
test();
