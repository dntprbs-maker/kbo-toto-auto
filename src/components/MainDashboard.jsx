import React, { useState, useEffect, useRef } from 'react';
import './MainDashboard.css';

const MainDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardView, setDashboardView] = useState('main'); // 'main', 'accuracy', 'profit', 'pattern', 'today', 'daily'
  const [betFilterType, setBetFilterType] = useState('unanimous');
  
  const yyyy_mm = new Date().toISOString().slice(0, 7);
  const parts = yyyy_mm.split('-');
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  
  const [startDate, setStartDate] = useState(yyyy_mm + '-01');
  const [endDate, setEndDate] = useState(yyyy_mm + '-' + String(lastDay).padStart(2, '0'));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDB = async () => {
      try {
        const [games, preds, bets] = await Promise.all([
          fetch('/api/admin/games').then(r => r.json()),
          fetch('/api/admin/predictions').then(r => r.json()),
          fetch('/api/admin/bets').then(r => r.json())
        ]);
        
        // 날짜별 그룹화
        const groups = {};
        
        if (Array.isArray(games)) {
          games.forEach(g => {
            if (!groups[g.date]) groups[g.date] = { date: g.date, games: [], unanimousBet: null, allFiveBets: [], singleBets: [] };
            const p = Array.isArray(preds) ? preds.find(x => x.date === g.date && x.awayTeam === g.awayTeam && x.homeTeam === g.homeTeam) : null;
            const ai1 = p ? (p['반짝이'] || p.ai1 || '-') : '-';
            const ai2 = p ? (p['별이'] || p.ai2 || '-') : '-';
            const ai3 = p ? (p['초롱이'] || p.ai3 || '-') : '-';
            groups[g.date].games.push({
              matchup: `${g.awayTeam} vs ${g.homeTeam}`,
              awayTeam: g.awayTeam,
              homeTeam: g.homeTeam,
              ai1,
              ai2,
              ai3,
              pick: p ? p.predictedWinner : '-',
              result: g.result || g.winner || null
            });
          });
        }
        
        if (Array.isArray(preds)) {
          preds.forEach(p => {
            if (!groups[p.date]) groups[p.date] = { date: p.date, games: [], unanimousBet: null, allFiveBets: [], singleBets: [] };
            const existingGame = groups[p.date].games.find(g => g.awayTeam === p.awayTeam && g.homeTeam === p.homeTeam);
            if (!existingGame) {
              const ai1 = p['반짝이'] || p.ai1 || '-';
              const ai2 = p['별이'] || p.ai2 || '-';
              const ai3 = p['초롱이'] || p.ai3 || '-';
              groups[p.date].games.push({
                matchup: `${p.awayTeam} vs ${p.homeTeam}`,
                awayTeam: p.awayTeam,
                homeTeam: p.homeTeam,
                ai1,
                ai2,
                ai3,
                pick: p.predictedWinner || '-',
                result: null
              });
            }
          });
        }

        if (Array.isArray(bets)) {
          bets.forEach(b => {
            if (!groups[b.date]) groups[b.date] = { date: b.date, games: [], unanimousBet: null, allFiveBets: [], singleBets: [] };
            b.betResult = b.status || 'pending';
            
            // [신규 포맷] picks = [{ matchup, pick }] 구조화 배열이면 직접 사용
            if (b.picks && b.picks.length > 0 && b.picks[0] && b.picks[0].pick) {
              const dayGames = groups[b.date].games;
              const customGames = [];
              const pickLabels = [];
              b.picks.forEach(item => {
                const mt = item.matchup || '';
                const g = dayGames.find(g => mt.includes(g.awayTeam) && mt.includes(g.homeTeam));
                if (g && !customGames.includes(g)) {
                  customGames.push(g);
                  pickLabels.push(item.pick);
                }
              });
              if (customGames.length > 0) {
                b.customGames = customGames;
                b.pickLabels = pickLabels;
              }
            }

            // [구버전 호환] picks[0].matchup 안에 픽이 문자열로 박혀있던 옛날 데이터 처리
            const details = (!b.customGames && b.picks && b.picks.length > 0) ? b.picks[0].matchup : '';
            if (details) {
              let pickStr = details;
              if (details.includes('|')) pickStr = details.split('|')[1].trim();
              else if (details.includes('(') && details.includes('vs')) {
                const match = details.match(/\((.*?)\)/);
                if (match) pickStr = match[1].trim();
              }

              const pickTokens = pickStr.split('·').map(s => s.trim().replace('(취소)', '').replace('승', '').replace('패', ''));
              const originalTokens = pickStr.split('·').map(s => s.trim().replace('(취소)', ''));
              
              const dayGames = groups[b.date].games;
              const customGames = [];
              const pickLabels = [];
              
              if (b.type === 'single') {
                const matchText = details.split('(')[0];
                const g = dayGames.find(g => matchText.includes(g.awayTeam) && matchText.includes(g.homeTeam));
                if (g) {
                  customGames.push(g);
                  pickLabels.push(originalTokens[0]);
                }
              } else {
                pickTokens.forEach((teamName, idx) => {
                  const g = dayGames.find(g => teamName.includes(g.awayTeam) || teamName.includes(g.homeTeam) || g.awayTeam.includes(teamName) || g.homeTeam.includes(teamName));
                  if (g && !customGames.includes(g)) {
                    customGames.push(g);
                    pickLabels.push(originalTokens[idx]);
                  }
                });
              }
              
              if (customGames.length > 0) {
                b.customGames = customGames;
                b.pickLabels = pickLabels;
              }
            }

            // Update betResult dynamically based on game results if it's currently pending
            if (b.betResult === 'pending' && b.customGames && b.customGames.length > 0) {
              if (b.customGames.some(g => g.result === null)) {
                b.betResult = 'pending';
              } else if (b.customGames.some(g => g.result === '취소')) {
                b.betResult = 'cancel';
              } else {
                b.betResult = b.customGames.every((g, idx) => g.result === b.pickLabels[idx]) ? 'hit' : 'miss';
              }
            }

            if (b.type === 'unanimous') groups[b.date].unanimousBet = b;
            else if (b.type === 'allfive') groups[b.date].allFiveBets.push(b);
            else if (b.type === 'single') groups[b.date].singleBets.push(b);
          });
        }

        setData(Object.values(groups).sort((a,b) => a.date.localeCompare(b.date)));
      } catch (error) {
        console.error('Fetch error:', error);
      }
      setLoading(false);
    };
    fetchDB();
  }, []);

  const canvasRef = useRef(null);

  // 유틸리티 함수
  const calcDayProfit = (d) => {
    let invest = 0, profit = 0, pending = false;
    const allBets = [d.unanimousBet, ...(d.allFiveBets || []), ...(d.singleBets || [])].filter(Boolean);
    allBets.forEach(b => {
      if (b.betResult === 'pending') { pending = true; return; }
      if (b.betResult === 'cancel') return;
      invest += b.amount || 0;
      profit += getProfit(b) || 0;
    });
    return { invest, profit, pending, allBets };
  };

  const isUnanimous = (g) => g.ai1 === g.ai2 && g.ai2 === g.ai3 && g.ai1 !== '-';
  const getUnanimousGames = (day) => day.games.filter(g => isUnanimous(g));
  const calcBetStatus = (games, item) => {
    if (item.betResult === 'hit' || item.betResult === 'miss' || item.betResult === 'cancel') return item.betResult;
    if (games.some(g => g.result === null)) return 'pending';
    return games.every(g => g.pick === g.result) ? 'hit' : 'miss';
  };
  const getProfit = (bet) => {
    if (!bet || bet.betResult === 'pending' || bet.betResult === 'cancel') return null;
    if (bet.betResult === 'hit') return Math.round(bet.amount * bet.odds - bet.amount);
    return -bet.amount;
  };
  const fmt = (v, unit = '원') => {
    if (v === null) return '-';
    return (v >= 0 ? '+' : '') + v.toLocaleString() + unit;
  };

  // 필터링된 데이터
  const filteredData = data.filter(d => (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate));

  // 차트 그리기 로직
  useEffect(() => {
    if (activeTab !== 'dashboard' || dashboardView !== 'profit') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = 160 * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const W = canvas.offsetWidth, H = 160;
    ctx.clearRect(0,0,W,H);
    
    const minTime = new Date(startDate || data[0]?.date || Date.now()).getTime();
    const maxTime = new Date(endDate || new Date().toISOString().split('T')[0]).getTime();
    const timeRange = maxTime - minTime || 86400000;

    const daysWithResults = filteredData.filter(d => {
      return (d.unanimousBet && d.unanimousBet.betResult !== 'pending') ||
             (d.allFiveBets && d.allFiveBets.some(b => b.betResult !== 'pending')) ||
             (d.singleBets && d.singleBets.some(b => b.betResult !== 'pending'));
    });

    if (!daysWithResults.length) {
      ctx.fillStyle = '#6b7280'; ctx.font = '13px Noto Sans KR'; ctx.textAlign = 'center';
      ctx.fillText('해당 기간에 결과 데이터가 없습니다', W/2, H/2); 
      
      ctx.font = '9px Noto Sans KR';
      const numLabels = 5;
      const pad = {l:52, r:16, t:16, b:28};
      const cW = W - pad.l - pad.r;
      const toX = t => pad.l + ((t - minTime) / timeRange) * cW;
      for (let i=0; i<=numLabels; i++) {
        const t = minTime + (timeRange * (i/numLabels));
        const d = new Date(t);
        ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, toX(t), H-pad.b+14);
      }
      return;
    }
    
    const pts = daysWithResults.map(d => { 
      let dailyProfit = (getProfit(d.unanimousBet)||0);
      if (d.allFiveBets) dailyProfit += d.allFiveBets.reduce((s,b)=>s+(getProfit(b)||0), 0);
      if (d.singleBets) dailyProfit += d.singleBets.reduce((s,b)=>s+(getProfit(b)||0), 0);
      return { time: new Date(d.date).getTime(), y: dailyProfit, dateStr: d.date }; 
    });

    const pad = {l:52, r:16, t:16, b:38};
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    
    const maxY = Math.max(...pts.map(p=>p.y), 2000);
    const minY = Math.min(...pts.map(p=>p.y), -2000);
    const rY = maxY - minY || 1;
    const toY = v => pad.t + (1 - (v - minY) / rY) * cH;
    const toX = t => pad.l + ((t - minTime) / timeRange) * cW;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(pad.l, toY(0)); ctx.lineTo(W - pad.r, toY(0)); ctx.stroke(); ctx.setLineDash([]);
    
    const daysDiff = Math.max(timeRange / 86400000, 1);
    const barW = Math.max((cW / daysDiff) * 0.4, 4);

    ctx.textAlign = 'center'; ctx.font = '9px Noto Sans KR';

    pts.forEach((p) => { 
      const isPos = p.y > 0;
      const isZero = p.y === 0;
      const barColor = isPos ? '#3b82f6' : (isZero ? '#6b7280' : '#ef476f');
      
      ctx.fillStyle = barColor;
      const x = toX(p.time);
      const yZero = toY(0);
      const yVal = toY(p.y);
      const rectY = p.y >= 0 ? yVal : yZero;
      const rectH = Math.abs(yZero - yVal);
      ctx.fillRect(x - barW/2, rectY, barW, Math.max(rectH, 1));

      ctx.fillStyle = '#9ca3af';
      const d = new Date(p.time);
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, H-pad.b+14);

      ctx.fillStyle = barColor;
      const amtStr = p.y > 0 ? `+${p.y.toLocaleString()}` : p.y.toLocaleString();
      ctx.fillText(amtStr, x, H-pad.b+26);
    });
    
    ctx.fillStyle = '#6b7280'; ctx.font = '10px Noto Sans KR'; ctx.textAlign = 'right';
    [maxY,0,minY].forEach(v => ctx.fillText(v.toLocaleString(), pad.l-4, toY(v)+4));

  }, [filteredData, activeTab, dashboardView, startDate, endDate]);

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  // 대시보드 요약 지표 계산
  const uBets = filteredData.map(d=>d.unanimousBet).filter(b=>b && b.betResult!=='pending' && b.betResult!=='cancel');
  const a5Bets = filteredData.flatMap(d=>d.allFiveBets||[]).filter(b=>b.betResult!=='pending' && b.betResult!=='cancel');
  const sBets = filteredData.flatMap(d=>d.singleBets||[]).filter(b=>b.betResult!=='pending' && b.betResult!=='cancel');
  const allBets = [...uBets, ...a5Bets, ...sBets];
  
  const totalBet = allBets.reduce((s,b)=>s+b.amount,0);
  const totalProfit = allBets.reduce((s,b)=>s+(getProfit(b)||0),0);
  const totalDays = filteredData.filter(d=>d.games.some(g=>g.result!==null)).length;

  const renderBetStats = (bets, label, cls) => {
    const done = bets.filter(b=>b.betResult!=='pending' && b.betResult!=='cancel');
    const hits = done.filter(b=>b.betResult==='hit');
    const profit = done.reduce((s,b)=>s+(getProfit(b)||0),0);
    const rate = done.length ? (hits.length/done.length*100).toFixed(0) : 0;
    
    return (
      <div className={`bet-type-card ${cls}`}>
        <div className="bet-type-title">{label}</div>
        <div className="bet-stat"><span className="bet-stat-label">진행 횟수</span><span className="bet-stat-val">{done.length}회</span></div>
        <div className="bet-stat"><span className="bet-stat-label">적중</span><span className={`bet-stat-val ${hits.length>0?'pos':''}`}>{hits.length}회</span></div>
        <div className="bet-stat"><span className="bet-stat-label">적중률</span><span className={`bet-stat-val ${rate>=50?'pos':'neg'}`}>{rate}%</span></div>
        <div className="bet-stat"><span className="bet-stat-label">누적 손익</span><span className={`bet-stat-val ${profit>=0?'pos':'neg'}`}>{fmt(profit)}</span></div>
      </div>
    );
  };

  const renderUnanimousDay = (d) => {
    const item = d.unanimousBet;
    if (!item) return null;
    const games = item.customGames || getUnanimousGames(d);
    if (games.length === 0) return null;
    
    const status = calcBetStatus(games, item);
    return (
      <div className="day-card day-card-inner">
        <div className="day-header bet-day-header-pc" style={{flexDirection: 'column', alignItems: 'stretch', gap: 4}}>
          <div className="bet-card-summary-row" style={{marginTop:0}}>
            <span className="bet-header-summary" style={{marginLeft: 0}}>
              {games.length}경기 / 배당 <strong>{item.odds||'-'}배</strong> / 베팅 {(item.amount||0).toLocaleString()}원
              {status==='hit' ? <span> / <strong style={{color:'var(--green)'}}>📈 +{Math.round((item.amount||0)*(item.odds||1)).toLocaleString()}원</strong></span> : 
               status === 'cancel' ? '' : 
               item.odds ? <span> / <span style={{color:'#6b9fce'}}>예상 {Math.round((item.amount||0)*(item.odds||1)).toLocaleString()}원</span></span> : ''}
            </span>
          </div>
        </div>
        <div className="day-body">
          <div className="game-list-header">
            <span className="col-match">매치업</span>
            <span className="col-pick">최종픽</span>
            <span className="col-result">결과</span>
          </div>
          {games.map((g, j) => {
            let rs = 'pending';
            if (g.result === '취소' || g.result === '무승부') rs = 'cancel';
            else if (g.result) rs = g.result === g.pick ? 'hit' : 'miss';
            return (
              <div key={j} className="game-row">
                <span className="game-matchup">{g.matchup}</span>
                <span className="col-pick-cell"><span className="pick-chip">{g.pick}</span></span>
                <span className={`col-result-cell game-result ${rs}`}>{g.result||'대기'}</span>
              </div>
            );
          })}
          {status !== 'hit' && status !== 'cancel' && (
            <div style={{display:'flex', justifyContent:'flex-end', marginTop: 8, paddingTop: 8, borderTop:'1px solid var(--border)'}}>
              <span className={status==='pending'?'neu':'neg'} style={{fontWeight: 900, fontSize: 13}}>
                {status==='pending' ? '-' : fmt(-item.amount)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAllFiveDay = (d) => {
    const bets = d.allFiveBets || [];
    if (!bets.length) return null;

    return bets.map((item, bi) => {
      const displayGames = item.customGames || d.games;
      const status = calcBetStatus(displayGames, item);
      const labels = item.pickLabels || displayGames.map(g=>g.pick);
      
      return (
        <div key={`a5-${bi}`} className="day-card day-card-inner">
          <div className="day-header bet-day-header-pc" style={{flexDirection: 'column', alignItems: 'stretch', gap: 4}}>
            <div className="bet-card-summary-row" style={{marginTop:0}}>
              <span className="bet-header-summary" style={{marginLeft: 0}}>
                <span style={{fontSize: 10, fontWeight: 700, color: '#5ba8ff', background: 'rgba(91,168,255,0.10)', borderRadius: 6, padding: '2px 8px', marginRight: 4}}>{item.label||'조합'+(bi+1)}</span>
                {displayGames.length}경기 / 배당 <strong>{item.odds||'-'}배</strong> / 베팅 {(item.amount||0).toLocaleString()}원
                {status==='hit' ? <span> / <strong style={{color:'var(--green)'}}>📈 +{Math.round((item.amount||0)*(item.odds||1)).toLocaleString()}원</strong></span> : 
                 status === 'cancel' ? '' :
                 item.odds ? <span> / <span style={{color:'#6b9fce'}}>예상 {Math.round((item.amount||0)*(item.odds||1)).toLocaleString()}원</span></span> : ''}
              </span>
            </div>
          </div>
          <div className="day-body">
            <div className="game-list-header">
              <span className="col-match">매치업</span>
              <span className="col-pick">최종픽</span>
              <span className="col-result">결과</span>
            </div>
            {displayGames.map((g, gi) => {
              let rs = 'pending';
              if (g.result === '취소' || g.result === '무승부') rs = 'cancel';
              else if (g.result) rs = g.result === g.pick ? 'hit' : 'miss';
              return (
                <div key={gi} className="game-row">
                  <span className="game-matchup">{g.matchup}</span>
                  <span className="col-pick-cell"><span className="pick-chip">{labels[gi] || g.pick}</span></span>
                  <span className={`col-result-cell game-result ${rs}`}>{g.result||'대기'}</span>
                </div>
              );
            })}
            {status !== 'hit' && status !== 'cancel' && (
              <div style={{display:'flex', justifyContent:'flex-end', marginTop: 8, paddingTop: 8, borderTop:'1px solid var(--border)'}}>
                <span className={status==='pending'?'neu':'neg'} style={{fontWeight: 900, fontSize: 13}}>
                  {status==='pending' ? '-' : fmt(-item.amount)}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  const renderSingleDay = (d) => {
    const bets = d.singleBets || [];
    if (!bets.length) return null;

    const totalAmount = bets.reduce((s, b) => s + (b.amount || 0), 0);
    const totalProfit = bets.reduce((s, b) => s + (getProfit(b) || 0), 0);

    return (
      <div className="day-card day-card-inner">
        <div className="day-header bet-day-header-pc" style={{flexDirection: 'column', alignItems: 'stretch', gap: 4}}>
          <div className="bet-card-summary-row" style={{marginTop:0}}>
            <span className="bet-header-summary" style={{marginLeft: 0}}>
              {bets.length}경기 / 총 베팅 {totalAmount.toLocaleString()}원
              {totalProfit > 0 ? <span> / <strong style={{color:'var(--green)'}}>📈 +{totalProfit.toLocaleString()}원</strong></span> : 
               totalProfit < 0 ? <span> / <strong style={{color:'var(--red)'}}>📉 {totalProfit.toLocaleString()}원</strong></span> : ''}
            </span>
          </div>
        </div>
        <div className="day-body">
          <div className="game-list-header">
            <span className="col-match">매치업 / 픽</span>
            <span className="col-pick">배당</span>
            <span className="col-result">결과</span>
          </div>
          {bets.map((b, bi) => {
            const displayGames = b.customGames || d.games;
            const labels = b.pickLabels || displayGames.map(g => g.pick);
            const g = displayGames[0] || {};
            const pickLabel = labels[0] || g.pick || (b.picks && b.picks[0]?.pick) || '-';
            const matchupText = g.matchup || (b.picks && b.picks[0]?.matchup) || '-';
            
            let rs = 'pending';
            if (g.result === '취소' || g.result === '무승부') rs = 'cancel';
            else if (g.result) rs = g.result === pickLabel ? 'hit' : 'miss';
            const status = b.betResult !== 'pending' && b.betResult !== 'cancel' ? b.betResult : rs;
            return (
              <React.Fragment key={bi}>
                <div className="game-row">
                  <span className="game-matchup">{matchupText} <span className="pick-chip">{pickLabel}</span></span>
                  <span className="col-pick-cell" style={{color:'var(--gold2)', fontWeight: 700}}>{b.odds}배</span>
                  <span className={`col-result-cell game-result ${rs}`}>{g.result||'대기'}</span>
                </div>
                {status !== 'cancel' && (
                  <div style={{display: 'flex', justifyContent: 'space-between', padding: '2px 20px 6px', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                    <span style={{color: 'var(--gray)'}}>베팅 {(b.amount||0).toLocaleString()}원</span>
                    <span className={status==='hit'?'pos':status==='pending'?'neu':'neg'} style={{fontWeight: 700}}>
                      {status==='hit' ? `+${Math.round((b.amount||0)*(b.odds||1) - (b.amount||0)).toLocaleString()}원` : 
                       status==='pending' ? `예상 +${Math.round((b.amount||0)*(b.odds||1) - (b.amount||0)).toLocaleString()}원` : 
                       `-${(b.amount||0).toLocaleString()}원`}
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // --- 대시보드 하위 화면 렌더링 함수들 ---
  const renderDashboardMain = () => {
    const daysWithBets = filteredData.filter(d => {
      return d.unanimousBet || (d.allFiveBets && d.allFiveBets.length > 0) || (d.singleBets && d.singleBets.length > 0);
    });
    const recentDays = daysWithBets.sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 5);

    return (
      <div id="dash-main">
        <div className="sec" style={{marginTop: 0}}>📊 대시보드</div>
        <div className="dash-menu-grid">
          <div className="dash-menu-card c1" onClick={() => setDashboardView('accuracy')}>
            <div className="dash-menu-badge">1순위</div>
            <div className="dash-menu-icon">🎯</div>
            <div className="dash-menu-title">적중률 / 수익률</div>
            <div className="dash-menu-desc">베팅 유형별 적중률<br/>AI 3인 예측 성적</div>
          </div>
          <div className="dash-menu-card c2" onClick={() => setDashboardView('profit')}>
            <div className="dash-menu-badge">2순위</div>
            <div className="dash-menu-icon">💰</div>
            <div className="dash-menu-title">수익 관련</div>
            <div className="dash-menu-desc">총 투자 / 수익<br/>누적 손익 그래프</div>
          </div>
          <div className="dash-menu-card c3" onClick={() => setDashboardView('pattern')}>
            <div className="dash-menu-badge">3순위</div>
            <div className="dash-menu-icon">📈</div>
            <div className="dash-menu-title">패턴 분석</div>
            <div className="dash-menu-desc">요일별 승률<br/>팀별 픽 성공률</div>
          </div>
          <div className="dash-menu-card c4" onClick={() => setDashboardView('today')}>
            <div className="dash-menu-badge">4순위</div>
            <div className="dash-menu-icon">⚾</div>
            <div className="dash-menu-title">오늘 현황</div>
            <div className="dash-menu-desc">오늘 베팅 & 경기<br/>예상 수익 확인</div>
          </div>
        </div>

        <div className="sec" style={{cursor:'pointer'}} onClick={() => setDashboardView('daily')}>
          📅 일별 손익 현황 <span style={{float:'right',fontSize:11,color:'var(--gray)',fontWeight:400,letterSpacing:0,textTransform:'none'}}>전체보기 ›</span>
        </div>
        <div id="daily-summary-list">
          {recentDays.map((d, i) => {
            const {invest, profit, pending, allBets} = calcDayProfit(d);
            const profitColor = pending ? 'var(--gray)' : profit >= 0 ? 'var(--green)' : 'var(--red)';
            const profitText = pending ? '대기중' : fmt(profit);
            const roi = invest > 0 && !pending ? (profit/invest*100).toFixed(0)+'%' : '-';
            const hitCount = allBets.filter(b=>b.betResult==='hit').length;
            const doneCount = allBets.filter(b=>b.betResult!=='pending'&&b.betResult!=='cancel').length;
            
            return (
              <div key={i} className="day-summary-card" onClick={() => setDashboardView('daily')}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:900,color:'var(--gold)'}}>📅 {d.date}</span>
                  <span style={{fontSize:18,fontWeight:900,color:profitColor}}>{profitText}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--gray)'}}>
                  <span>💰 투자 <strong style={{color:'var(--light)'}}>{invest.toLocaleString()}원</strong></span>
                  <span>🎯 적중 <strong style={{color:'var(--light)'}}>{hitCount}/{doneCount}</strong></span>
                  <span>💹 수익률 <strong style={{color:profitColor}}>{roi}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDetailAccuracy = () => {
    const done = filteredData.filter(d => d.unanimousBet && d.unanimousBet.betResult !== 'pending');

    // 베팅 유형별 적중률
    const uBets = done.map(d => d.unanimousBet).filter(b => b.betResult !== 'cancel');
    const uHit = uBets.filter(b => b.betResult === 'hit').length;
    const uRate = uBets.length ? Math.round(uHit / uBets.length * 100) : 0;

    const a5All = done.flatMap(d => (d.allFiveBets || []).filter(b => b.betResult !== 'cancel' && b.betResult !== 'pending'));
    const a5Hit = a5All.filter(b => b.betResult === 'hit').length;
    const a5Rate = a5All.length ? Math.round(a5Hit / a5All.length * 100) : 0;

    const sDayCount = done.filter(d => (d.singleBets || []).some(b => b.betResult !== 'cancel' && b.betResult !== 'pending')).length;
    const sAll = done.flatMap(d => (d.singleBets || []).filter(b => b.betResult !== 'cancel' && b.betResult !== 'pending'));
    const sHit = sAll.filter(b => b.betResult === 'hit').length;
    const sRate = sAll.length ? Math.round(sHit / sAll.length * 100) : 0;

    const calcRoi = (bets) => {
      const invest = bets.reduce((s, b) => s + b.amount, 0);
      const profit = bets.reduce((s, b) => s + (getProfit(b) || 0), 0);
      return invest > 0 ? (profit / invest * 100).toFixed(1) : null;
    };
    const uRoi = calcRoi(uBets), a5Roi = calcRoi(a5All), sRoi = calcRoi(sAll);

    const barColor = (r) => r >= 60 ? 'var(--green)' : r >= 40 ? 'var(--gold)' : 'var(--red)';
    const roiColor = (v) => v === null ? 'var(--gray)' : parseFloat(v) >= 0 ? 'var(--green)' : 'var(--red)';
    const roiText = (v) => v === null ? '-' : (parseFloat(v) >= 0 ? '+' : '') + v + '%';

    const rateBars = [
      { key: 'unanimous', name: '🎯 만장일치', hit: uHit, total: uBets.length, rate: uRate, roi: uRoi, sub: `${uHit}회 적중 / 총 ${uBets.length}회` },
      { key: 'allfive', name: '⚡ 도전경기', hit: a5Hit, total: a5All.length, rate: a5Rate, roi: a5Roi, sub: `${a5Hit}회 적중 / 총 ${a5All.length}회` },
      { key: 'single', name: '1️⃣ 단독베팅', hit: sHit, total: sAll.length, rate: sRate, roi: sRoi, sub: `${sHit}회 적중 / 총 ${sAll.length}회 (${sDayCount}일)` }
    ];

    // AI 적중률
    const doneGames = done.flatMap(d => (d.games || []).filter(g => g.result && g.result !== '취소'));
    const aiRate = (key) => {
      const t = doneGames.filter(g => g[key] && g[key] !== '-');
      const h = t.filter(g => g[key] === g.result);
      return { hit: h.length, total: t.length, rate: t.length ? Math.round(h.length / t.length * 100) : 0 };
    };
    const ais = [
      { name: '반짝이', d: aiRate('ai1'), color: '#7ec8ff' },
      { name: '별이', d: aiRate('ai2'), color: '#5ba8ff' },
      { name: '초롱이', d: aiRate('ai3'), color: '#a29bfe' }
    ];

    // 전체 수익률
    const allBets = [...uBets, ...a5All, ...sAll];
    const tInvest = allBets.reduce((s, b) => s + b.amount, 0);
    const tProfit = allBets.reduce((s, b) => s + (getProfit(b) || 0), 0);
    const tRoi = tInvest > 0 ? (tProfit / tInvest * 100).toFixed(1) : 0;
    const tHit = uHit + a5Hit + sHit;

    return (
      <div className="detail-view active">
        <button className="back-btn" onClick={() => setDashboardView('main')}><span className="back-arrow">←</span> 대시보드</button>
        
        <div className="sec" style={{marginTop: 0}}>🎯 베팅 유형별 적중률 <span style={{float:'right',fontSize:11,color:'var(--gray)',fontWeight:400,letterSpacing:0,textTransform:'none',cursor:'pointer'}}>날짜별 보기 ›</span></div>
        <div>
          {rateBars.map(r => (
            <div key={r.key} className="rate-bar-wrap" style={{cursor:'default'}}>
              <div className="rate-bar-label">
                <span className="rate-bar-name">{r.name}</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span className="rate-bar-pct" style={{color:barColor(r.rate)}}>{r.rate}%</span>
                  <span style={{fontSize:11,color:roiColor(r.roi),fontWeight:700}}>수익률 {roiText(r.roi)}</span>
                </div>
              </div>
              <div className="rate-bar-bg"><div className="rate-bar-fill" style={{width:`${r.rate}%`,background:barColor(r.rate)}}></div></div>
              <div className="rate-bar-sub">{r.sub}</div>
            </div>
          ))}
        </div>

        <div className="sec">🦾 AI 예측 적중률</div>
        <div className="ai-compare-grid">
          {ais.map(a => (
            <div key={a.name} className="ai-card">
              <div className="ai-name" style={{color:a.color}}>{a.name}</div>
              <div className="ai-pct" style={{color:barColor(a.d.rate)}}>{a.d.rate}%</div>
              <div className="ai-sub">{a.d.hit}/{a.d.total}경기</div>
            </div>
          ))}
        </div>

        <div className="sec">💹 전체 수익률</div>
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">💰 총 투자</div><div className="kpi-val gold">{tInvest.toLocaleString()}원</div></div>
          <div className="kpi-card"><div className="kpi-label">📈 누적 손익</div><div className={`kpi-val ${tProfit>=0?'green':'red'}`}>{fmt(tProfit)}</div></div>
          <div className="kpi-card"><div className="kpi-label">💹 ROI</div><div className={`kpi-val ${tRoi>=0?'green':'red'}`}>{tRoi}%</div></div>
          <div className="kpi-card"><div className="kpi-label">🏆 총 적중</div><div className="kpi-val blue">{tHit}회</div></div>
        </div>
      </div>
    );
  };

  const renderDetailProfit = () => {
    return (
      <div className="detail-view active">
        <button className="back-btn" onClick={() => setDashboardView('main')}><span className="back-arrow">←</span> 대시보드</button>
        <div className="sec" style={{marginTop: 0}}>💰 수익 요약</div>
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">💰 총 투자 금액</div><div className="kpi-val gold">{totalBet.toLocaleString()}원</div></div>
          <div className="kpi-card"><div className="kpi-label">📅 경기 진행일수</div><div className="kpi-val gold">{totalDays}일</div></div>
          <div className="kpi-card"><div className="kpi-label">📈 누적 손익 금액</div><div className={`kpi-val ${totalProfit>=0?'green':'red'}`}>{fmt(totalProfit)}</div></div>
          <div className="kpi-card"><div className="kpi-label">💹 수익률</div><div className={`kpi-val ${totalProfit>=0?'green':'red'}`}>{totalBet>0?(totalProfit/totalBet*100).toFixed(1):0}%</div></div>
        </div>
        <div className="sec">📈 누적 손익 차트</div>
        <div className="chart-wrap">
          <canvas ref={canvasRef} height="160"></canvas>
        </div>
      </div>
    );
  };

  const renderDetailPattern = () => {
    return (
      <div className="detail-view active">
        <button className="back-btn" onClick={() => setDashboardView('main')}><span className="back-arrow">←</span> 대시보드</button>
        <div className="sec" style={{marginTop: 0}}>📈 패턴 분석</div>
        <div className="empty" style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12}}>패턴 분석 기능이 준비 중입니다.</div>
      </div>
    );
  };

  const renderDetailToday = () => {
    return (
      <div className="detail-view active">
        <button className="back-btn" onClick={() => setDashboardView('main')}><span className="back-arrow">←</span> 대시보드</button>
        <div className="sec" style={{marginTop: 0}}>⚾ 오늘 현황</div>
        <div className="empty" style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12}}>오늘 현황 기능이 준비 중입니다.</div>
      </div>
    );
  };

  const renderDetailDaily = () => {
    const daysWithBets = filteredData.filter(d => {
      return d.unanimousBet || (d.allFiveBets && d.allFiveBets.length > 0) || (d.singleBets && d.singleBets.length > 0);
    });
    const days = daysWithBets.sort((a,b)=>b.date.localeCompare(a.date));
    
    return (
      <div className="detail-view active">
        <button className="back-btn" onClick={() => setDashboardView('main')}><span className="back-arrow">←</span> 대시보드</button>
        <div className="sec" style={{marginTop: 0}}>📅 일별 손익 전체 내역</div>
        {days.map((d, i) => {
          const {invest, profit, pending, allBets} = calcDayProfit(d);
          const profitColor = pending ? 'var(--gray)' : profit >= 0 ? 'var(--green)' : 'var(--red)';
          const roi = invest > 0 && !pending ? (profit/invest*100).toFixed(0)+'%' : '-';
          const hitCount = allBets.filter(b=>b.betResult==='hit').length;
          const doneCount = allBets.filter(b=>b.betResult!=='pending'&&b.betResult!=='cancel').length;
          
          return (
            <div key={i} className="day-summary-card" style={{cursor: 'default'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:13,fontWeight:900,color:'var(--gold)'}}>📅 {d.date}</span>
                <span style={{fontSize:18,fontWeight:900,color:profitColor}}>{pending?'대기중':fmt(profit)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--gray)'}}>
                <span>💰 투자 <strong style={{color:'var(--light)'}}>{invest.toLocaleString()}원</strong></span>
                <span>🎯 적중 <strong style={{color:'var(--light)'}}>{hitCount}/{doneCount}</strong></span>
                <span>💹 수익률 <strong style={{color:profitColor}}>{roi}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="main-dashboard">
      <header>
        <div className="header-inner">
          <div className="logo">⚾ KBO<em>TOTO</em></div>
          <div className="header-sub">2026 한국 프로야구 투자 기록부</div>
        </div>
      </header>

      <div className="sticky-ui-group">
        <div className="tabs">
          <div className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 대시보드</div>
          <div className={`tab ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>📋 경기기록</div>
          <div className={`tab ${activeTab === 'betting' ? 'active' : ''}`} onClick={() => setActiveTab('betting')}>🎯 베팅내역</div>
        </div>

        <div className="common-filter-area">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="date-input" />
            <span style={{color: 'var(--gray)'}}>~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="date-input" />
            <button onClick={handleResetFilters} className="btn-reset">초기화</button>
        </div>

      </div>

      <main>
        {/* 1. 대시보드 탭 */}
        <div className={`panel ${activeTab === 'dashboard' ? 'active' : ''}`} id="tab-dashboard">
          {dashboardView === 'main' && renderDashboardMain()}
          {dashboardView === 'accuracy' && renderDetailAccuracy()}
          {dashboardView === 'profit' && renderDetailProfit()}
          {dashboardView === 'pattern' && renderDetailPattern()}
          {dashboardView === 'today' && renderDetailToday()}
          {dashboardView === 'daily' && renderDetailDaily()}
        </div>

        {/* 2. 경기기록 탭 */}
        <div className={`panel ${activeTab === 'records' ? 'active' : ''}`} id="tab-records">
          {[...filteredData].reverse().map((d, i) => {
            const dayDateObj = new Date(d.date);
            const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dayDateObj.getDay()];
            
            const totalGames = d.games.length;
            const hitGames = d.games.filter(g => g.result && g.result === g.pick).length;
            const missGames = d.games.filter(g => g.result && g.result !== g.pick && g.result !== '취소').length;
            const canceledGames = d.games.filter(g => g.result === '취소').length;
            const isFinished = hitGames + missGames + canceledGames === totalGames && totalGames > 0;

            return (
              <div key={i} className="date-group-card">
                <div className="date-group-header-main" style={{justifyContent: 'flex-start', flexWrap: 'wrap', gap: 16}}>
                  <span className="date-group-title">📅 {d.date} ({dayOfWeek})</span>
                  <span style={{fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12}}>
                    <span style={{color: 'var(--gray)'}}>총 {totalGames}경기</span>
                    {isFinished ? (
                      <span className={hitGames > missGames ? 'pos' : hitGames < missGames ? 'neg' : 'neu'}>
                        {hitGames}적중 {missGames}실패 {canceledGames > 0 ? `${canceledGames}취소` : ''}
                      </span>
                    ) : (
                      <span style={{color: '#6b9fce'}}>진행 중</span>
                    )}
                  </span>
                </div>
                <div className="table-scroll-wrap" style={{padding: '0 16px 16px 16px'}}>
                  <table className="games-table">
                    <thead>
                      <tr>
                        <th className="col-match">매치업</th>
                        <th className="col-ai1">반짝이</th>
                        <th className="col-ai2">별이</th>
                        <th className="col-ai3">초롱이</th>
                        <th className="col-pick">최종픽</th>
                        <th className="col-result">결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.games.map((g, j) => {
                        const unani = isUnanimous(g);
                        let rs = 'pending';
                        if (g.result === '취소' || g.result === '무승부') rs = 'cancel';
                        else if (g.result) rs = g.result === g.pick ? 'hit' : 'miss';
                        return (
                          <tr key={j}>
                            <td className="col-match">{g.matchup}{unani && <span className="unani-dot"></span>}</td>
                            <td className="col-ai1">{g.ai1}</td><td className="col-ai2">{g.ai2}</td><td className="col-ai3">{g.ai3}</td>
                            <td className="col-pick">{g.pick}</td>
                            <td className={`col-result td-result-${rs}`}>{g.result||'대기'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {filteredData.length === 0 && <div className="empty">📝 기간 내 기록 데이터 없음</div>}
        </div>

        {/* 3. 베팅내역 탭 */}
        <div className={`panel ${activeTab === 'betting' ? 'active' : ''}`} id="tab-betting">
          <div className="bet-lists-by-date">
            {[...filteredData].reverse().map((d, i) => {
              const hasUnanimous = d.unanimousBet && (d.unanimousBet.customGames || getUnanimousGames(d)).length > 0;
              const hasAllFive = d.allFiveBets && d.allFiveBets.length > 0;
              const hasSingle = d.singleBets && d.singleBets.length > 0;
              if (!hasUnanimous && !hasAllFive && !hasSingle) return null;

              const dayDateObj = new Date(d.date);
              const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dayDateObj.getDay()];

              let dayProfit = 0;
              let dayBetAmount = 0;
              let dayHasFinished = false;

              if (d.unanimousBet && d.unanimousBet.betResult !== 'cancel') {
                dayBetAmount += d.unanimousBet.amount || 0;
                const p = getProfit(d.unanimousBet);
                if (p !== null) { dayProfit += p; dayHasFinished = true; }
              }
              if (d.allFiveBets) {
                d.allFiveBets.forEach(b => {
                  if (b.betResult !== 'cancel') dayBetAmount += b.amount || 0;
                  const p = getProfit(b);
                  if (p !== null) { dayProfit += p; dayHasFinished = true; }
                });
              }
              if (d.singleBets) {
                d.singleBets.forEach(b => {
                  if (b.betResult !== 'cancel') dayBetAmount += b.amount || 0;
                  const p = getProfit(b);
                  if (p !== null) { dayProfit += p; dayHasFinished = true; }
                });
              }

              return (
                <div key={`date-group-${i}`} className="date-group-card">
                  <div className="date-group-header-main" style={{justifyContent: 'flex-start', flexWrap: 'wrap', gap: 16}}>
                    <span className="date-group-title">📅 {d.date} ({dayOfWeek})</span>
                    {dayHasFinished && (
                      <span style={{fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12}}>
                        <span style={{color: 'var(--gray)'}}>총 베팅: {dayBetAmount.toLocaleString()}원</span>
                        <span className={dayProfit > 0 ? 'pos' : dayProfit < 0 ? 'neg' : 'neu'}>
                          당일 손익: {dayProfit > 0 ? `+${dayProfit.toLocaleString()}원` : `${dayProfit.toLocaleString()}원`}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="date-group-body">
                    {/* 만장일치 컬럼 */}
                    <div className="date-group-col">
                      <div className="date-group-col-title unanimous">🎯 만장일치 내역</div>
                      {hasUnanimous ? renderUnanimousDay(d) : <div className="empty" style={{fontSize:12, padding:12}}>내역 없음</div>}
                    </div>
                    {/* 도전경기 컬럼 */}
                    <div className="date-group-col">
                      <div className="date-group-col-title allfive">⚡ 도전경기 내역</div>
                      {hasAllFive ? renderAllFiveDay(d) : <div className="empty" style={{fontSize:12, padding:12}}>내역 없음</div>}
                    </div>
                    {/* 단독베팅 컬럼 */}
                    <div className="date-group-col">
                      <div className="date-group-col-title single">1️⃣ 단독베팅 내역</div>
                      {hasSingle ? renderSingleDay(d) : <div className="empty" style={{fontSize:12, padding:12}}>내역 없음</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredData.length === 0 && <div className="empty">📝 기간 내 기록 데이터가 없습니다.</div>}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MainDashboard;
