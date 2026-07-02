const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

let apiKey = '';
try {
  const env = fs.readFileSync('.env', 'utf8');
  const match = env.match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
} catch (e) {}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || apiKey);

async function run() {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    tools: [{ googleSearch: {} }]
  });

  try {
    const result = await model.generateContent("오늘(2026년 6월 12일) KBO 야구 경기 결과와 내일 경기 일정을 알려줘.");
    console.log(result.response.text());
  } catch(e) {
    console.log("googleSearch tool failed:", e.message);
  }
}
run();
