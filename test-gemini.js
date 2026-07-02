import fs from 'fs';
import fetch from 'node-fetch';

const env = fs.readFileSync('.env.local', 'utf8');
const geminiKey = env.match(/GEMINI_API_KEY=(.+)/)[1].trim();

async function test() {
  const prompt = '오늘 KBO 리그 경기 일정과 예상 선발투수, 그리고 최근 이슈를 구글에서 검색해서 요약해줘.';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }]
      })
    }
  );
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
