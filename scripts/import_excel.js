import fs from 'fs';
import path from 'path';

const API_BASE = 'https://kbo-toto-analysis.vercel.app/api';

async function clearAPI(endpoint) {
  const url = `${API_BASE}/${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${endpoint}: ${await response.text()}`);
  
  const docs = await response.json();
  console.log(`Deleting ${docs.length} docs from ${endpoint}...`);
  
  const deletePromises = docs.map(doc => {
    if (!doc.id) return Promise.resolve();
    return fetch(`${url}?id=${doc.id}`, { method: 'DELETE' });
  });
  await Promise.all(deletePromises);
}

async function uploadAPI(endpoint, data) {
  const url = `${API_BASE}/${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`Failed to upload to ${endpoint}: ${await response.text()}`);
}

async function run() {
  try {
    console.log(`Clearing DB...`);
    await clearAPI('admin/games');
    await clearAPI('admin/predictions');

    const jsonPath = path.resolve('excel_out.json');
    const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    const dataRows = rawData.slice(1);
    let currentDate = '';
    
    for (const row of dataRows) {
      const dateVal = row['⚾ KBO 토토 - 경기 예측 현황 2026'];
      if (dateVal) currentDate = String(dateVal).trim();
      
      const matchup = row['Unnamed: 1'];
      if (!matchup || !matchup.includes('vs')) continue;
      
      const parts = matchup.split('vs').map(s => s.trim());
      const awayTeam = parts[0];
      const homeTeam = parts[1];
      
      const ai1 = row['Unnamed: 2'] || '-';
      const ai2 = row['Unnamed: 3'] || '-';
      const ai3 = row['Unnamed: 4'] || '-';
      const finalPick = row['Unnamed: 5'] || '-';
      let result = row['Unnamed: 6'] || null;
      if (result === '대기중') result = null;
      
      const gameDoc = {
        date: currentDate,
        awayTeam,
        homeTeam,
        winner: result
      };
      
      const predDoc = {
        date: currentDate,
        awayTeam,
        homeTeam,
        반짝이: ai1,
        별이: ai2,
        초롱이: ai3,
        predictedWinner: finalPick,
        confidence: 80,
        reason: 'Excel Import'
      };
      
      console.log(`Uploading ${currentDate} ${matchup}...`);
      await uploadAPI('admin/games', gameDoc);
      await uploadAPI('admin/predictions', predDoc);
    }
    
    console.log('Import completed!');
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
