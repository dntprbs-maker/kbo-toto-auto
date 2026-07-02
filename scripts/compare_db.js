import fs from 'fs';
import path from 'path';

const API_BASE = 'https://kbo-toto-analysis.vercel.app/api';

async function fetchAPI(endpoint) {
  const url = `${API_BASE}/${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
  return await response.json();
}

async function run() {
  try {
    const games = await fetchAPI('admin/games');
    const predictions = await fetchAPI('admin/predictions');

    const jsonPath = path.resolve('excel_out.json');
    const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const dataRows = rawData.slice(1);
    
    let currentDate = '';
    const discrepancies = [];

    for (const row of dataRows) {
      const dateVal = row['⚾ KBO 토토 - 경기 예측 현황 2026'];
      if (dateVal) currentDate = String(dateVal).trim();
      
      const matchup = row['Unnamed: 1'];
      if (!matchup || !matchup.includes('vs')) continue;
      
      const parts = matchup.split('vs').map(s => s.trim());
      const awayTeam = parts[0];
      const homeTeam = parts[1];
      
      const expectedAi1 = row['Unnamed: 2'] || '-';
      const expectedAi2 = row['Unnamed: 3'] || '-';
      const expectedAi3 = row['Unnamed: 4'] || '-';
      const expectedPick = row['Unnamed: 5'] || '-';
      let expectedResult = row['Unnamed: 6'] || null;
      if (expectedResult === '대기중' || expectedResult === '취소') expectedResult = null;

      const gameDoc = games.find(g => g.date === currentDate && g.awayTeam === awayTeam && g.homeTeam === homeTeam);
      const predDoc = predictions.find(p => p.date === currentDate && p.awayTeam === awayTeam && p.homeTeam === homeTeam);

      if (!gameDoc) {
        discrepancies.push(`[${currentDate} ${matchup}] DB에 경기(Game) 데이터가 없습니다.`);
      } else if (gameDoc.winner !== expectedResult) {
        discrepancies.push(`[${currentDate} ${matchup}] 결과 불일치: 엑셀(${expectedResult}) vs DB(${gameDoc.winner})`);
      }

      if (!predDoc) {
        discrepancies.push(`[${currentDate} ${matchup}] DB에 예측(Prediction) 데이터가 없습니다.`);
      } else {
        if (predDoc['반짝이'] !== expectedAi1) discrepancies.push(`[${currentDate} ${matchup}] 반짝이 예측 불일치: 엑셀(${expectedAi1}) vs DB(${predDoc['반짝이']})`);
        if (predDoc['별이'] !== expectedAi2) discrepancies.push(`[${currentDate} ${matchup}] 별이 예측 불일치: 엑셀(${expectedAi2}) vs DB(${predDoc['별이']})`);
        if (predDoc['초롱이'] !== expectedAi3) discrepancies.push(`[${currentDate} ${matchup}] 초롱이 예측 불일치: 엑셀(${expectedAi3}) vs DB(${predDoc['초롱이']})`);
        if (predDoc['predictedWinner'] !== expectedPick) discrepancies.push(`[${currentDate} ${matchup}] 최종픽 불일치: 엑셀(${expectedPick}) vs DB(${predDoc['predictedWinner']})`);
      }
    }

    if (discrepancies.length === 0) {
      console.log('불일치하는 데이터가 하나도 없습니다. 모두 완벽하게 일치합니다.');
    } else {
      console.log('=== 데이터 불일치 내역 ===');
      discrepancies.forEach(d => console.log(d));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
