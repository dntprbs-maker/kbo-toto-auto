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
    console.log(`Clearing bets DB...`);
    await clearAPI('admin/bets');

    const jsonPath = path.resolve('bets_out.json');
    const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Ignore the first row if it's the header row.
    const dataRows = rawData.slice(1);
    let currentDate = '';
    
    for (const row of dataRows) {
      const dateVal = row['⚾ KBO 토토 - 베팅 현황 2026'];
      if (dateVal) currentDate = String(dateVal).trim();
      
      const typeStr = row['Unnamed: 1'];
      if (!typeStr) continue;
      
      let type = 'single';
      if (typeStr.includes('만장일치')) type = 'unanimous';
      else if (typeStr.includes('도전경기')) type = 'allfive';
      
      const details = row['Unnamed: 2'] || '';
      const odds = parseFloat(row['Unnamed: 3']) || 1.0;
      const amountStr = String(row['Unnamed: 4'] || '0').replace(/,/g, '').replace('원', '');
      const amount = parseInt(amountStr) || 0;
      
      const resultStr = row['Unnamed: 5'] || '';
      let status = 'pending';
      if (resultStr.includes('적중') && !resultStr.includes('미')) status = 'hit';
      else if (resultStr.includes('미적중')) status = 'miss';
      else if (resultStr.includes('취소')) status = 'cancel';
      
      const betDoc = {
        date: currentDate,
        type: type,
        amount: amount,
        odds: odds,
        picks: [{ matchup: details, pick: '-' }], // Store the raw string in matchup for now
        status: status
      };
      
      console.log(`Uploading bet for ${currentDate} [${type}]...`);
      await uploadAPI('admin/bets', betDoc);
    }
    
    console.log('Import completed!');
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
