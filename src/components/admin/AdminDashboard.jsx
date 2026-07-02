import React, { useState, useEffect, useRef } from 'react';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [games, setGames] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);

  // 모달 상태 ('aiGame' | 'aiPred' | 'manualGame' | 'manualPred' | 'dataGames' | 'dataPreds' | null)
  const [activeModal, setActiveModal] = useState(null);
  // Pipeline States
  const [syncStepStatus, setSyncStepStatus] = useState({
    schedule: 'idle', // idle | loading | done | error
    step1: 'idle',
    step2: 'idle',
    step3: 'idle',
    merge: 'idle',
    bets: 'idle'
  });

  // 각 단계 결과 메시지
  const [syncStepResult, setSyncStepResult] = useState({
    schedule: null,
    step1: null,
    step2: null,
    step3: null,
    merge: null,
    bets: null
  });

  const handleSyncStep = async (stepKey, endpoint, body = {}) => {
    setSyncStepStatus(prev => ({ ...prev, [stepKey]: 'loading' }));
    setSyncStepResult(prev => ({ ...prev, [stepKey]: null }));
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '실패');
      setSyncStepStatus(prev => ({ ...prev, [stepKey]: 'done' }));

      // 단계별 결과 메시지 생성
      let resultMsg = '';
      if (stepKey === 'schedule') {
        const t = data.today;
        const tm = data.tomorrow;
        if (t.count === 0) {
          resultMsg = `오늘(${t.label}) 종료된 경기 없음`;
        } else {
          resultMsg = `오늘(${t.label}) ${t.count}경기 결과 저장 완료\n`;
          resultMsg += t.games.map(g => `  · ${g.awayTeam} ${g.awayScore}:${g.homeScore} ${g.homeTeam} → 🏆${g.winner}`).join('\n');
        }
        if (tm.isMonday) {
          resultMsg += `\n\n내일(${tm.label})은 월요일 → KBO 경기 없음`;
        } else {
          resultMsg += `\n\n내일(${tm.label}) 예정 경기 ${tm.count}개\n`;
          resultMsg += tm.games.map(g => `  · ${g.awayTeam} vs ${g.homeTeam} (${g.gameTime})`).join('\n');
        }
      } else if (stepKey === 'step1') {
        resultMsg = `✅ 반짝이(AI 1) 예측 완료 - ${data.matchCount || 0}경기`;
      } else if (stepKey === 'step2') {
        resultMsg = `✅ 별이(AI 2) 예측 완료 - ${data.matchCount || 0}경기`;
      } else if (stepKey === 'step3') {
        resultMsg = `✅ 초롱이(AI 3) 예측 완료 - ${data.matchCount || 0}경기`;
      } else if (stepKey === 'merge') {
        resultMsg = `✅ 예측 취합 완료 - ${data.merged || 0}경기 병합, 오늘 결과 ${data.gameResults || 0}건 저장`;
      } else if (stepKey === 'bets') {
        resultMsg = `✅ 배팅 내역 생성 완료 - ${data.createdCount || 0}건 생성`;
      } else {
        resultMsg = data.message || '완료되었습니다.';
      }

      setSyncStepResult(prev => ({ ...prev, [stepKey]: { type: 'success', msg: resultMsg } }));
      fetchAllData();
    } catch(e) {
      setSyncStepStatus(prev => ({ ...prev, [stepKey]: 'error' }));
      setSyncStepResult(prev => ({ ...prev, [stepKey]: { type: 'error', msg: '❌ 오류: ' + e.message } }));
    }
  };

  // 데이터 필터용 날짜 상태
  const yyyy_mm = new Date().toISOString().slice(0, 7);
  const parts = yyyy_mm.split('-');
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  const [filterStartDate, setFilterStartDate] = useState(yyyy_mm + '-01');
  const [filterEndDate, setFilterEndDate] = useState(yyyy_mm + '-' + String(lastDay).padStart(2, '0'));

  // 수동 입력 폼 상태
  const [gameForm, setGameForm] = useState({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
  const [predForm, setPredForm] = useState({ date: '', homeTeam: '', awayTeam: '', ai1: '', ai2: '', ai3: '', predictedWinner: '', confidence: '', reason: '' });

  // 수동 일괄 업데이트 (방향 2) 상태
  const [manualBatchDate, setManualBatchDate] = useState('');
  const [manualBatchGames, setManualBatchGames] = useState([]);

  // AI 분석 (테이블에서 딥다이브) 상태
  const [aiReport, setAiReport] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // ====== AI 이미지(경기 결과) 파싱 관련 ======
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [imageDate, setImageDate] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedGames, setParsedGames] = useState([]);
  const fileInputRef = useRef(null);

  // ====== AI 예측 파싱 관련 ======
  const [predImagePreview, setPredImagePreview] = useState(null);
  const [predImageBase64, setPredImageBase64] = useState(null);
  const [predImageMime, setPredImageMime] = useState('image/jpeg');
  const [predRawText, setPredRawText] = useState('');
  const [predDate, setPredDate] = useState('');
  const [isPredParsing, setIsPredParsing] = useState(false);
  const [parsedPredictions, setParsedPredictions] = useState([]);
  const predFileInputRef = useRef(null);
  const [predInputTab, setPredInputTab] = useState('image');

  // --- 배당률 검색 (The Odds API) 관련 상태 ---
  const [oddsData, setOddsData] = useState(null);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [oddsError, setOddsError] = useState(null);

  // --- AI 모델 설정 관련 상태 ---
  const [aiModels, setAiModels] = useState([]);
  const [loadingAiModels, setLoadingAiModels] = useState(false);
  const DEFAULT_AI_MODELS = [
    { name: 'ai1', label: '반짝이', model: 'gemini-2.5-pro', persona: '당신은 KBO 스탯 전문가입니다. 아래 제공된 [스탯 데이터]를 최우선으로 분석하여 객관적인 수치와 전력 위주로만 냉정하게 승패를 예측하세요.' },
    { name: 'ai2', label: '별이',   model: 'claude-sonnet-5', persona: '당신은 이변을 찾는 비판적인 기자입니다. 아래 제공된 [최신 뉴스/여론]을 바탕으로, 정배당(강팀)이 질 수 있는 이변의 시나리오를 집중적으로 탐색하세요. 약팀이 이길 단서가 조금이라도 있다면 과감히 약팀을, 도저히 이변이 불가능하다면 강팀을 예측하세요.' },
    { name: 'ai3', label: '초롱이', model: 'gpt-4o', persona: '당신은 가치 베팅(Value Betting) 전문가입니다. 아래 제공된 [배당률 데이터]를 보고 배당률 대비 승리 확률(가성비)을 분석하세요. 정배당 팀의 배당 메리트가 낮고 역배당 팀의 가치가 높다면 과감히 역배당을 추천하고, 그렇지 않다면 안전한 픽을 하세요.' },
  ];

  useEffect(() => {
    if (activeModal === 'oddsSearch' && !oddsData && !loadingOdds) {
      setLoadingOdds(true);
      fetch('/api/odds')
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          setOddsData(data);
          setLoadingOdds(false);
        })
        .catch(e => {
          setOddsError(e.message);
          setLoadingOdds(false);
        });
    }

    if (activeModal === 'aiSettings' && aiModels.length === 0 && !loadingAiModels) {
      setLoadingAiModels(true);
      fetch('/api/admin/ai-models')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setAiModels(data);
          } else {
            setAiModels([...DEFAULT_AI_MODELS]);
          }
          setLoadingAiModels(false);
        })
        .catch(e => {
          console.error(e);
          setAiModels([...DEFAULT_AI_MODELS]);
          setLoadingAiModels(false);
        });
    }
  }, [activeModal, oddsData, loadingOdds, aiModels, loadingAiModels]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const gRes = await fetch('/api/admin/games');
      const pRes = await fetch('/api/admin/predictions');
      if (gRes.ok) setGames(await gRes.json());
      if (pRes.ok) setPredictions(await pRes.json());
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    const today = new Date().toISOString().split('T')[0];
    setImageDate(today);
    setPredDate(today);
  }, []);

  // 수동 일괄 업데이트 데이터 초기화
  useEffect(() => {
    if (activeModal === 'manualBatchGame') {
      const todayStr = new Date().toISOString().split('T')[0];
      setManualBatchDate(todayStr);
    }
  }, [activeModal]);

  useEffect(() => {
    if (activeModal === 'manualBatchGame') {
      const dayGames = games.filter(g => g.date === manualBatchDate).map(g => ({...g, tempResult: g.result || g.winner || ''}));
      setManualBatchGames(dayGames);
    }
  }, [activeModal, manualBatchDate, games]);

  const handleManualBatchChange = (id, value) => {
    setManualBatchGames(prev => prev.map(g => g.id === id ? { ...g, tempResult: value } : g));
  };

  const saveManualBatchGames = async () => {
    if (manualBatchGames.length === 0) return alert('업데이트할 경기가 없습니다.');
    if (!window.confirm(`총 ${manualBatchGames.length}경기의 결과를 업데이트하시겠습니까?`)) return;
    
    for (const game of manualBatchGames) {
      if (game.tempResult !== (game.result || game.winner || '')) {
        await fetch('/api/admin/games', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: game.id, 
            result: game.tempResult,
            winner: game.tempResult
          })
        });
      }
    }
    alert('✅ 결과 일괄 업데이트가 완료되었습니다.');
    fetchAllData();
    closeModal();
  };

  const filteredGames = games.filter(g => (!filterStartDate || g.date >= filterStartDate) && (!filterEndDate || g.date <= filterEndDate));
  const filteredPreds = predictions.filter(p => (!filterStartDate || p.date >= filterStartDate) && (!filterEndDate || p.date <= filterEndDate));

  // 모달이 열려있을 때 배경 스크롤 방지
  useEffect(() => {
    if (activeModal || aiReport) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [activeModal, aiReport]);

  const closeModal = () => setActiveModal(null);

  // ===================== CRUD =====================
  const deleteItem = async (type, id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    await fetch(`/api/admin/${type}?id=${id}`, { method: 'DELETE' });
    fetchAllData();
  };

  const saveGame = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameForm)
    });
    setGameForm({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
    fetchAllData();
    closeModal();
  };

  const savePrediction = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(predForm)
    });
    setPredForm({ date: '', homeTeam: '', awayTeam: '', ai1: '', ai2: '', ai3: '', predictedWinner: '', confidence: '', reason: '' });
    fetchAllData();
    closeModal();
  };

  // ===================== EDIT =====================
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (type) => {
    await fetch(`/api/admin/${type}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    setEditingId(null);
    fetchAllData();
  };

  // ===================== GROUPING =====================
  const groupedGames = Object.values(filteredGames.reduce((acc, g) => {
    if (!acc[g.date]) acc[g.date] = { date: g.date, items: [] };
    acc[g.date].items.push(g);
    return acc;
  }, {})).sort((a,b) => b.date.localeCompare(a.date));

  const groupedPreds = Object.values(filteredPreds.reduce((acc, p) => {
    if (!acc[p.date]) acc[p.date] = { date: p.date, items: [] };
    acc[p.date].items.push(p);
    return acc;
  }, {})).sort((a,b) => b.date.localeCompare(a.date));

  // ===================== 경기 이미지 파싱 =====================
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageMime(file.type || 'image/jpeg');
    setImagePreview(URL.createObjectURL(file));
    setParsedGames([]);
    const reader = new FileReader();
    reader.onload = () => setImageBase64(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const parseImageWithAI = async () => {
    if (!imageBase64) return;
    setIsParsing(true);
    setParsedGames([]);
    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: imageMime, gameDate: imageDate, parseType: 'image' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `서버 오류 ${res.status}`);
      if (data.success) setParsedGames(data.games);
    } catch(e) { alert('오류: ' + e.message); }
    setIsParsing(false);
  };

  const clearGameImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setParsedGames([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateExistingOrPostGame = async (game) => {
    const existingGame = games.find(g => 
      g.date === game.date && 
      (g.awayTeam.includes(game.awayTeam) || game.awayTeam.includes(g.awayTeam) || 
       g.homeTeam.includes(game.homeTeam) || game.homeTeam.includes(g.homeTeam))
    );
    if (existingGame) {
      await fetch('/api/admin/games', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existingGame.id, result: game.winner })
      });
    } else {
      await fetch('/api/admin/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(game)
      });
    }
  };

  const saveAllParsedGames = async () => {
    if (parsedGames.length === 0) return;
    for (const game of parsedGames) {
      await updateExistingOrPostGame(game);
    }
    alert(`총 ${parsedGames.length}경기 결과 업데이트 완료!`);
    clearGameImage();
    fetchAllData();
    closeModal();
  };

  const saveSingleParsedGame = async (game) => {
    await updateExistingOrPostGame(game);
    setParsedGames(prev => prev.filter(g => g !== game));
    fetchAllData();
  };

  // ===================== 예측 데이터 파싱 =====================
  const handlePredImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPredImageMime(file.type || 'image/jpeg');
    setPredImagePreview(URL.createObjectURL(file));
    setParsedPredictions([]);
    const reader = new FileReader();
    reader.onload = () => setPredImageBase64(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const parsePredictionWithAI = async () => {
    const hasImage = !!predImageBase64;
    const hasText = predRawText.trim().length > 0;
    if (!hasImage && !hasText) return alert('데이터를 입력해주세요.');
    setIsPredParsing(true);
    setParsedPredictions([]);
    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: predImageBase64, mimeType: predImageMime, rawText: predRawText, gameDate: predDate, parseType: 'prediction' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `서버 오류`);
      if (data.success) setParsedPredictions(data.predictions);
    } catch(e) { alert('오류: ' + e.message); }
    setIsPredParsing(false);
  };

  const clearPredImage = () => {
    setPredImagePreview(null);
    setPredImageBase64(null);
    setParsedPredictions([]);
    if (predFileInputRef.current) predFileInputRef.current.value = '';
  };

  const saveAllParsedPredictions = async () => {
    if (parsedPredictions.length === 0) return;
    for (const pred of parsedPredictions) {
      await fetch('/api/admin/predictions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pred)
      });
    }
    alert(`✅ ${parsedPredictions.length}개 예측 저장 완료!`);
    clearPredImage();
    setPredRawText('');
    fetchAllData();
    closeModal();
  };

  const saveSingleParsedPrediction = async (pred) => {
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pred)
    });
    setParsedPredictions(prev => prev.filter(p => p !== pred));
    fetchAllData();
  };

  const runDeepAI = async (pred) => {
    setIsAiLoading(true);
    setAiReport('🤖 딥다이브 분석 중... (약 10초 소요)');
    try {
      const res = await fetch('/api/admin/deep-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, gameDate: pred.date })
      });
      const data = await res.json();
      setAiReport(data.report);
    } catch(e) { setAiReport('오류 발생: ' + e.message); }
    setIsAiLoading(false);
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        <div className="admin-header">
          <h1>👑 관리자 통제실</h1>
          <span>🔒 PIN 로그인 준비 중</span>
        </div>

        {loading && <div className="admin-loading">⏳ 데이터 불러오는 중...</div>}

        {/* --- 데이터 관리 섹션 --- */}
        <h2 style={{color: 'var(--light)', fontSize: '18px', marginBottom: '16px'}}>📊 데이터 관리</h2>
        <div className="admin-menu-grid" style={{marginBottom: '32px'}}>
          <div className="admin-menu-card" onClick={() => setActiveModal('dataGames')} style={{borderColor: 'var(--gray)'}}>
            <div className="admin-menu-icon">📋</div>
            <div className="admin-menu-title" style={{color: 'var(--gray)'}}>경기 기록</div>
            <div className="admin-menu-desc">총 {games.length}건 데이터 관리</div>
          </div>
          <div className="admin-menu-card" onClick={() => setActiveModal('dataPreds')} style={{borderColor: 'var(--gray)'}}>
            <div className="admin-menu-icon">🔮</div>
            <div className="admin-menu-title" style={{color: 'var(--gray)'}}>배팅 내역</div>
            <div className="admin-menu-desc">총 {predictions.length}건 데이터 관리</div>
          </div>
          <div className="admin-menu-card" onClick={() => setActiveModal('oddsSearch')} style={{borderColor: '#e63946'}}>
            <div className="admin-menu-icon">🔍</div>
            <div className="admin-menu-title" style={{color: '#e63946'}}>배당률 검색</div>
            <div className="admin-menu-desc">KBO 실시간 배당 (The Odds API)</div>
          </div>
        </div>

        {/* --- 데이터 입력 섹션 --- */}
        <h2 style={{color: 'var(--light)', fontSize: '18px', marginBottom: '16px'}}>➕ 데이터 입력</h2>
        <div className="admin-menu-grid">
          <div className="admin-menu-card yellow" onClick={() => setActiveModal('aiGame')}>
            <div className="admin-menu-icon">📸</div>
            <div className="admin-menu-title">경기 결과 자동 입력</div>
            <div className="admin-menu-desc">네이버 스포츠 이미지 파싱</div>
          </div>
          <div className="admin-menu-card purple" onClick={() => setActiveModal('aiPred')}>
            <div className="admin-menu-icon">🎯</div>
            <div className="admin-menu-title">승패 예측 자동 입력</div>
            <div className="admin-menu-desc">비교표/텍스트 AI 파싱</div>
          </div>
          <div className="admin-menu-card green" onClick={() => setActiveModal('manualBatchGame')}>
            <div className="admin-menu-icon">📝</div>
            <div className="admin-menu-title">경기 결과 수동 입력</div>
            <div className="admin-menu-desc">클릭으로 빠른 일괄 업데이트</div>
          </div>
          <div className="admin-menu-card blue" onClick={() => setActiveModal('manualPred')}>
            <div className="admin-menu-icon">✏️</div>
            <div className="admin-menu-title">승패 예측 수동 추가</div>
            <div className="admin-menu-desc">예측 데이터 직접 입력</div>
          </div>
        </div>

        {/* --- 시스템 제어 섹션 --- */}
        <h2 style={{color: 'var(--light)', fontSize: '18px', marginTop: '32px', marginBottom: '8px'}}>⚡ 단계별 실행 파이프라인</h2>
        <p style={{color:'#888', fontSize:'13px', marginBottom:'16px'}}>순서대로 하나씩 눌러서 실행하세요. 각 단계 아래에 결과가 바로 표시됩니다.</p>

        {[
          { key: 'schedule', icon: '📅', label: '0단계: KBO 경기 일정 가져오기', desc: '오늘 결과 + 내일 예정 경기 확인', endpoint: '/api/admin/sync', body: { action: 'schedule' } },
          { key: 'step1',    icon: '🤖', label: '1단계: 반짝이(AI 1) 예측',       desc: '스탯 기반 승패 예측', endpoint: '/api/admin/sync', body: { action: 'ai', modelIndex: 0 } },
          { key: 'step2',    icon: '🤖', label: '2단계: 별이(AI 2) 예측',         desc: '뉴스 기반 이변 탐색', endpoint: '/api/admin/sync', body: { action: 'ai', modelIndex: 1 } },
          { key: 'step3',    icon: '🤖', label: '3단계: 초롱이(AI 3) 예측',       desc: '배당률 기반 가치 분석', endpoint: '/api/admin/sync', body: { action: 'ai', modelIndex: 2 } },
          { key: 'merge',    icon: '🧩', label: '4단계: 예측 취합',               desc: 'AI 3명 의견 합치기 + 오늘 경기 결과 저장', endpoint: '/api/admin/sync', body: { action: 'merge' } },
          { key: 'bets',     icon: '💰', label: '5단계: 배팅 내역 생성',          desc: '단독/만장일치/도전경기 자동 생성', endpoint: '/api/admin/sync', body: { action: 'bets' } },
        ].map(step => {
          const status = syncStepStatus[step.key];
          const result = syncStepResult[step.key];
          const borderColor = status === 'done' ? '#10b981' : status === 'error' ? '#ef4444' : '#334155';
          return (
            <div key={step.key} style={{marginBottom: '12px', border: `1px solid ${borderColor}`, borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.3s'}}>
              <div
                style={{display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', background:'#1e293b', cursor: status === 'loading' ? 'wait' : 'pointer'}}
                onClick={() => status !== 'loading' && handleSyncStep(step.key, step.endpoint, step.body)}
              >
                <span style={{fontSize:'22px', animation: status === 'loading' ? 'spin 1s linear infinite' : 'none', display:'inline-block'}}>
                  {status === 'done' ? '✅' : status === 'error' ? '❌' : status === 'loading' ? '⏳' : step.icon}
                </span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700, fontSize:'14px', color: status === 'done' ? '#10b981' : status === 'error' ? '#ef4444' : 'var(--light)'}}>{step.label}</div>
                  <div style={{fontSize:'12px', color:'#888', marginTop:'2px'}}>{step.desc}</div>
                </div>
                <div style={{fontSize:'12px', color:'#555', whiteSpace:'nowrap'}}>
                  {status === 'loading' ? '실행 중...' : status === 'idle' ? '▶ 클릭하여 실행' : ''}
                </div>
              </div>
              {result && (
                <div style={{
                  padding:'12px 16px',
                  background: result.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  borderTop: `1px solid ${result.type === 'success' ? '#10b98133' : '#ef444433'}`,
                  fontSize:'13px',
                  color: result.type === 'success' ? '#6ee7b7' : '#fca5a5',
                  whiteSpace:'pre-line',
                  lineHeight:'1.7'
                }}>
                  {result.msg}
                </div>
              )}
            </div>
          );
        })}

        <h2 style={{color: 'var(--light)', fontSize: '18px', marginTop: '32px', marginBottom: '16px'}}>⚙️ 설정</h2>
        <div className="admin-menu-grid">
          <div className="admin-menu-card" onClick={() => setActiveModal('aiSettings')} style={{borderColor: '#8b5cf6'}}>
            <div className="admin-menu-icon">🧠</div>
            <div className="admin-menu-title" style={{color: '#8b5cf6'}}>AI 모델 성향 설정</div>
            <div className="admin-menu-desc">프롬프트 및 페르소나 튜닝</div>
          </div>
        </div>
      </div>

      {/* ====== 배당률 검색 모달 ====== */}
      {activeModal === 'oddsSearch' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content odds-modal" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', height: '80vh', overflowY: 'auto'}}>
            <div className="modal-header">
              <h2>🔍 실시간 KBO 배당률 (The Odds API)</h2>
              <button className="btn-close" onClick={closeModal}>X</button>
            </div>
            {(() => {
              if (loadingOdds) return <div style={{padding:'40px', textAlign:'center', color:'#888'}}>배당률 데이터를 불러오는 중... ⏳</div>;
              if (oddsError) return <div style={{padding:'40px', color:'#ff4d4f', textAlign:'center'}}>에러 발생: {oddsError}</div>;
              if (!oddsData || oddsData.length === 0) return <div style={{padding:'40px', textAlign:'center', color:'#888'}}>현재 등록된 KBO 배당률 데이터가 없습니다.</div>;

              return (
                <div className="odds-container">
                  <div className="odds-grid">
                    {oddsData.map((match, idx) => {
                      const homeTeam = match.home_team;
                      const awayTeam = match.away_team;
                      const bookmaker = match.bookmakers && match.bookmakers[0];
                      const market = bookmaker && bookmaker.markets.find(m => m.key === 'h2h');
                      let homeOdds = '-', awayOdds = '-';
                      if (market) {
                        const homeOutcome = market.outcomes.find(o => o.name === homeTeam);
                        const awayOutcome = market.outcomes.find(o => o.name === awayTeam);
                        homeOdds = homeOutcome ? homeOutcome.price : '-';
                        awayOdds = awayOutcome ? awayOutcome.price : '-';
                      }
                      return (
                        <div key={idx} className="odds-card" style={{background:'#2d2d2d', borderColor:'#444', color:'#eee'}}>
                          <div className="odds-time" style={{background:'#444', color:'#ddd'}}>{new Date(match.commence_time).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' })} 시작</div>
                          <div className="odds-matchup">
                            <div className="odds-team away-team">
                              <span className="team-name" style={{color:'#ddd'}}>{awayTeam} <span className="team-badge" style={{background:'#555'}}>원정</span></span>
                              <span className="team-odds" style={{color:'#ff7675'}}>{awayOdds}</span>
                            </div>
                            <div className="odds-vs">VS</div>
                            <div className="odds-team home-team">
                              <span className="team-name" style={{color:'#ddd'}}>{homeTeam} <span className="team-badge" style={{background:'#0984e3'}}>홈</span></span>
                              <span className="team-odds" style={{color:'#ff7675'}}>{homeOdds}</span>
                            </div>
                          </div>
                          <div className="odds-bookmaker" style={{borderTopColor:'#444'}}>제공처: {bookmaker ? bookmaker.title : 'N/A'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ====== AI 설정 모달 ====== */}
      {activeModal === 'aiSettings' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto'}}>
            <div className="modal-header">
              <h2 style={{color: '#8b5cf6'}}>🧠 AI 모델 성향 설정</h2>
              <button className="btn-close" onClick={closeModal}>X</button>
            </div>
            {loadingAiModels ? (
              <div style={{padding:'40px', textAlign:'center', color:'#888'}}>AI 설정을 불러오는 중... ⏳</div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'16px', marginTop:'16px'}}>
                <p style={{color: '#aaa', fontSize: '14px', marginBottom: '8px'}}>AI 모델의 이름, 프롬프트, 엔진을 개별적으로 튜닝할 수 있습니다.</p>
                {aiModels.map((ai, index) => (
                  <div key={index} style={{background:'#1e293b', padding:'16px', borderRadius:'8px', border:'1px solid #334155'}}>
                    <div style={{display:'flex', gap:'12px', marginBottom:'8px'}}>
                      <input 
                        type="text" 
                        value={ai.label} 
                        onChange={(e) => {
                          const newModels = [...aiModels];
                          newModels[index].label = e.target.value;
                          setAiModels(newModels);
                        }}
                        style={{background:'#0f172a', border:'1px solid #334155', color:'white', padding:'8px', borderRadius:'4px', width:'120px'}}
                      />
                      <select
                        value={ai.model}
                        onChange={(e) => {
                          const newModels = [...aiModels];
                          newModels[index].model = e.target.value;
                          setAiModels(newModels);
                        }}
                        style={{background:'#0f172a', border:'1px solid #334155', color:'white', padding:'8px', borderRadius:'4px', flex: 1}}
                      >
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                      </select>
                    </div>
                    <textarea 
                      value={ai.persona}
                      onChange={(e) => {
                        const newModels = [...aiModels];
                        newModels[index].persona = e.target.value;
                        setAiModels(newModels);
                      }}
                      style={{width:'100%', height:'80px', background:'#0f172a', border:'1px solid #334155', color:'white', padding:'8px', borderRadius:'4px', resize:'none', fontSize: '13px'}}
                      placeholder="프롬프트를 입력하세요..."
                    />
                  </div>
                ))}
                <div style={{display:'flex', justifyContent:'space-between', marginTop:'16px'}}>
                  <button className="admin-btn" style={{background: '#475569'}} onClick={() => setAiModels([...DEFAULT_AI_MODELS])}>기본값 복구</button>
                  <button className="admin-btn" style={{background: '#8b5cf6'}} onClick={async () => {
                    setLoadingAiModels(true);
                    try {
                      const res = await fetch('/api/admin/ai-models', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(aiModels)
                      });
                      if(res.ok) {
                        alert('AI 설정이 성공적으로 저장되었습니다!\n(다음 동기화부터 즉시 적용됩니다)');
                        closeModal();
                      } else {
                        alert('저장에 실패했습니다.');
                      }
                    } catch(e) { alert('오류: ' + e.message); }
                    setLoadingAiModels(false);
                  }}>저장하기</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= MODALS ======================= */}
      {/* 0-1. 저장된 경기 결과 모달 */}
      {activeModal === 'dataGames' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', height: '80vh'}}>
            <div className="modal-header" style={{display:'flex', flexWrap:'wrap', gap:'12px'}}>
              <h2 style={{margin:0}}>📋 경기 기록 ({filteredGames.length}건)</h2>
              <div style={{display:'flex', gap:'8px', alignItems:'center', marginLeft:'auto'}}>
                <input type="date" value={filterStartDate} onChange={e=>setFilterStartDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
                <span style={{color:'var(--gray)'}}>~</span>
                <input type="date" value={filterEndDate} onChange={e=>setFilterEndDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
              </div>
              <button className="modal-close" style={{position:'static', alignSelf:'center'}} onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" style={{padding: '16px', background: 'var(--bg-dark)'}}>
              {groupedGames.length === 0 && !loading && <div className="empty">데이터가 없습니다</div>}
              {groupedGames.map(day => (
                <div key={day.date} className="day-card" style={{marginBottom:'16px'}}>
                  <div className="day-header" style={{background: 'var(--card-bg)'}}><span className="day-date">📅 {day.date}</span></div>
                  <div className="table-scroll-wrap">
                    <table className="games-table" style={{borderTop: 'none'}}>
                      <thead>
                        <tr>
                          <th className="col-match">경기</th>
                          <th className="col-result">결과</th>
                          <th style={{width: '90px', textAlign:'center'}}>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.items.map(g => {
                          const isEditing = editingId === g.id;
                          return (
                            <tr key={g.id}>
                              <td className="col-match">
                                {isEditing ? (
                                  <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                                    <input type="text" className="admin-input" style={{width:'60px', padding:'2px 4px', fontSize:'12px'}} value={editForm.awayTeam} onChange={e=>setEditForm({...editForm, awayTeam:e.target.value})} />
                                    <span style={{color:'var(--gray)'}}>vs</span>
                                    <input type="text" className="admin-input" style={{width:'60px', padding:'2px 4px', fontSize:'12px'}} value={editForm.homeTeam} onChange={e=>setEditForm({...editForm, homeTeam:e.target.value})} />
                                  </div>
                                ) : (
                                  `${g.awayTeam} vs ${g.homeTeam}`
                                )}
                              </td>
                              <td className="col-result">
                                {isEditing ? (
                                  <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                                    <input type="number" className="admin-input" style={{width:'40px', padding:'2px 4px', fontSize:'12px'}} value={editForm.awayScore} onChange={e=>setEditForm({...editForm, awayScore:e.target.value})} />
                                    <span>:</span>
                                    <input type="number" className="admin-input" style={{width:'40px', padding:'2px 4px', fontSize:'12px'}} value={editForm.homeScore} onChange={e=>setEditForm({...editForm, homeScore:e.target.value})} />
                                    <input type="text" className="admin-input" placeholder="승리" style={{width:'50px', padding:'2px 4px', fontSize:'12px'}} value={editForm.winner} onChange={e=>setEditForm({...editForm, winner:e.target.value})} />
                                  </div>
                                ) : (
                                  <span className="text-green">
                                    {(g.awayScore || g.homeScore)
                                      ? `${g.awayScore}:${g.homeScore} `
                                      : ''}
                                    <span style={{fontWeight:900}}>🏆 {g.winner}</span>
                                  </span>
                                )}
                              </td>
                              <td style={{textAlign:'center'}}>
                                {isEditing ? (
                                  <div style={{display:'flex', gap:'4px', justifyContent:'center'}}>
                                    <button onClick={() => saveEdit('games')} className="btn-icon green" title="저장">💾</button>
                                    <button onClick={cancelEdit} className="btn-icon gray" title="취소">✕</button>
                                  </div>
                                ) : (
                                  <div style={{display:'flex', gap:'4px', justifyContent:'center'}}>
                                    <button onClick={() => startEdit(g)} className="btn-icon blue" title="수정">✏️</button>
                                    <button onClick={() => deleteItem('games', g.id)} className="btn-icon red" title="삭제">🗑️</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 0-2. 저장된 예측 데이터 모달 */}
      {activeModal === 'dataPreds' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', height: '80vh'}}>
            <div className="modal-header" style={{display:'flex', flexWrap:'wrap', gap:'12px'}}>
              <h2 style={{margin:0}}>🔮 배팅 내역 ({filteredPreds.length}건)</h2>
              <div style={{display:'flex', gap:'8px', alignItems:'center', marginLeft:'auto'}}>
                <input type="date" value={filterStartDate} onChange={e=>setFilterStartDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
                <span style={{color:'var(--gray)'}}>~</span>
                <input type="date" value={filterEndDate} onChange={e=>setFilterEndDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
              </div>
              <button className="modal-close" style={{position:'static', alignSelf:'center'}} onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" style={{padding: '16px', background: 'var(--bg-dark)'}}>
              {groupedPreds.length === 0 && !loading && <div className="empty">데이터가 없습니다</div>}
              {groupedPreds.map(day => (
                <div key={day.date} className="day-card" style={{marginBottom:'16px'}}>
                  <div className="day-header" style={{background: 'var(--card-bg)'}}><span className="day-date">📅 {day.date}</span></div>
                  <div className="table-scroll-wrap">
                    <table className="games-table" style={{borderTop: 'none'}}>
                      <thead>
                        <tr>
                          <th className="col-match">경기</th>
                          <th className="col-result">예측(확률)</th>
                          <th style={{width: '120px', textAlign:'center'}}>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.items.map(p => {
                          const isEditing = editingId === p.id;
                          return (
                            <tr key={p.id}>
                              <td className="col-match">
                                {isEditing ? (
                                  <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                                    <input type="text" className="admin-input" style={{width:'60px', padding:'2px 4px', fontSize:'12px'}} value={editForm.awayTeam} onChange={e=>setEditForm({...editForm, awayTeam:e.target.value})} />
                                    <span style={{color:'var(--gray)'}}>vs</span>
                                    <input type="text" className="admin-input" style={{width:'60px', padding:'2px 4px', fontSize:'12px'}} value={editForm.homeTeam} onChange={e=>setEditForm({...editForm, homeTeam:e.target.value})} />
                                  </div>
                                ) : (
                                  `${p.awayTeam} vs ${p.homeTeam}`
                                )}
                              </td>
                              <td className="col-result">
                                {isEditing ? (
                                  <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                                    <input type="text" className="admin-input" placeholder="승리 예측" style={{width:'60px', padding:'2px 4px', fontSize:'12px'}} value={editForm.predictedWinner} onChange={e=>setEditForm({...editForm, predictedWinner:e.target.value})} />
                                    <select className="admin-input" style={{padding:'2px', fontSize:'12px'}} value={editForm.confidence} onChange={e=>setEditForm({...editForm, confidence:e.target.value})}>
                                      <option value="높음">높음</option>
                                      <option value="중간">중간</option>
                                      <option value="낮음">낮음</option>
                                    </select>
                                  </div>
                                ) : (
                                  <span className="text-purple">{p.predictedWinner} <span className="text-gray" style={{fontSize:'12px'}}>({p.confidence})</span></span>
                                )}
                              </td>
                              <td style={{textAlign:'center'}}>
                                {isEditing ? (
                                  <div style={{display:'flex', gap:'4px', justifyContent:'center'}}>
                                    <button onClick={() => saveEdit('predictions')} className="btn-icon green" title="저장">💾</button>
                                    <button onClick={cancelEdit} className="btn-icon gray" title="취소">✕</button>
                                  </div>
                                ) : (
                                  <div style={{display:'flex', gap:'4px', justifyContent:'center'}}>
                                    <button onClick={() => runDeepAI(p)} className="btn-icon blue" title="AI 딥다이브 분석">🤖</button>
                                    <button onClick={() => startEdit(p)} className="btn-icon blue" title="수정">✏️</button>
                                    <button onClick={() => deleteItem('predictions', p.id)} className="btn-icon red" title="삭제">🗑️</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 1. 경기 결과 AI 파싱 모달 */}
      {activeModal === 'aiGame' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="yellow">📸 이미지로 경기 결과 자동 입력</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-grid">
                <div>
                  <div className="upload-area">
                    <div className="drop-zone" onClick={() => fileInputRef.current.click()}>
                      {imagePreview ? <img src={imagePreview} alt="업로드됨" /> : (
                        <div className="drop-zone-placeholder">
                          <div className="icon">📷</div><p className="title">클릭하여 이미지 업로드</p>
                        </div>
                      )}
                    </div>
                    {imagePreview && <button onClick={(e) => { e.stopPropagation(); clearGameImage(); }} className="btn-remove-image">✕</button>}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{display: 'none'}} onChange={handleImageSelect} />
                  <div className="action-row">
                    <div className="input-group">
                      <label>경기 날짜</label>
                      <input type="date" value={imageDate} onChange={e => setImageDate(e.target.value)} className="admin-input" />
                    </div>
                    <div className="input-group" style={{flex: '0 0 auto', alignSelf: 'flex-end'}}>
                      <button onClick={parseImageWithAI} disabled={!imageBase64 || isParsing} className="admin-btn yellow">
                        {isParsing ? '분석 중...' : '🤖 AI 분석'}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="result-header text-gray">
                    {parsedGames.length > 0 ? `✅ AI가 ${parsedGames.length}경기를 찾았습니다` : '🔍 분석 결과가 여기에 표시됩니다'}
                  </div>
                  {isParsing && <div className="result-loading"><div className="spinner"></div><span>분석 중...</span></div>}
                  {parsedGames.length > 0 && (
                    <>
                      <div className="result-list">
                        {parsedGames.map((game, i) => (
                          <div key={i} className="result-item">
                            <div className="result-item-content">
                              <span className="text-gray">{game.awayTeam} <span className="text-red">{game.awayScore}</span> vs <span className="text-blue">{game.homeScore}</span> {game.homeTeam}</span>
                              <span className="text-yellow" style={{marginLeft:'8px', fontSize:'12px'}}>🏆 {game.winner}</span>
                            </div>
                            <button onClick={() => saveSingleParsedGame(game)} className="admin-btn green small">저장</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={saveAllParsedGames} className="admin-btn green full-width">✅ 전체 {parsedGames.length}경기 한 번에 저장</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. 승패 예측 AI 파싱 모달 */}
      {activeModal === 'aiPred' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="purple">🔮 예측 데이터 자동 입력</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="admin-tabs">
                <button onClick={() => setPredInputTab('image')} className={`admin-tab-btn ${predInputTab === 'image' ? 'active' : ''}`}>📷 이미지 캡쳐</button>
                <button onClick={() => setPredInputTab('text')} className={`admin-tab-btn ${predInputTab === 'text' ? 'active' : ''}`}>📋 텍스트 복붙</button>
              </div>
              <div className="modal-grid">
                <div>
                  {predInputTab === 'image' ? (
                    <div className="upload-area">
                      <div className="drop-zone purple" onClick={() => predFileInputRef.current.click()}>
                        {predImagePreview ? <img src={predImagePreview} alt="업로드됨" /> : (
                          <div className="drop-zone-placeholder">
                            <div className="icon">📊</div><p className="title">클릭하여 이미지 업로드</p>
                          </div>
                        )}
                      </div>
                      {predImagePreview && <button onClick={(e) => { e.stopPropagation(); clearPredImage(); }} className="btn-remove-image">✕</button>}
                    </div>
                  ) : (
                    <textarea value={predRawText} onChange={e => setPredRawText(e.target.value)} placeholder="AI 텍스트 붙여넣기..." className="admin-textarea" />
                  )}
                  <input ref={predFileInputRef} type="file" accept="image/*" style={{display: 'none'}} onChange={handlePredImageSelect} />
                  <div className="action-row">
                    <div className="input-group">
                      <label>예측 날짜</label>
                      <input type="date" value={predDate} onChange={e => setPredDate(e.target.value)} className="admin-input purple-focus" />
                    </div>
                    <div className="input-group" style={{flex: '0 0 auto', alignSelf: 'flex-end'}}>
                      <button onClick={parsePredictionWithAI} disabled={isPredParsing || (!predImageBase64 && !predRawText.trim())} className="admin-btn purple">
                        {isPredParsing ? '분석 중...' : '🤖 AI 파싱'}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="result-header text-gray">
                    {parsedPredictions.length > 0 ? `✅ ${parsedPredictions.length}경기 예측을 찾았습니다` : '🔍 분석 결과가 여기에 표시됩니다'}
                  </div>
                  {isPredParsing && <div className="result-loading" style={{color:'var(--purple)'}}><div className="spinner"></div><span>분석 중...</span></div>}
                  {parsedPredictions.length > 0 && (
                    <>
                      <div className="result-list">
                        {parsedPredictions.map((pred, i) => (
                          <div key={i} className="result-item" style={{alignItems: 'flex-start'}}>
                            <div className="result-item-content">
                              <div className="text-gray">{pred.awayTeam} vs {pred.homeTeam}</div>
                              <div className="text-purple" style={{marginTop:'4px'}}>🏆 {pred.predictedWinner} ({pred.confidence})</div>
                            </div>
                            <button onClick={() => saveSingleParsedPrediction(pred)} className="admin-btn purple small">저장</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={saveAllParsedPredictions} className="admin-btn purple full-width">✅ 전체 {parsedPredictions.length}경기 한 번에 저장</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 수동 경기 결과 일괄 입력 모달 (방향 2) */}
      {activeModal === 'manualBatchGame' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px', maxHeight: '80vh'}}>
            <div className="modal-header">
              <h2 className="green">📝 오늘 경기 결과 수동 입력</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              <div className="form-row">
                <label style={{color: 'var(--gray)', fontSize: '14px', marginBottom: '4px'}}>조회할 날짜</label>
                <input type="date" value={manualBatchDate} onChange={e => setManualBatchDate(e.target.value)} className="admin-input" />
              </div>

              {manualBatchGames.length === 0 ? (
                <div className="empty" style={{padding: '32px 0'}}>해당 날짜에 대기 중인 경기가 없습니다.</div>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '4px'}}>
                  {manualBatchGames.map(g => (
                    <div key={g.id} className="result-item" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                      <div style={{fontWeight: 700, fontSize: '15px'}}>{g.awayTeam} vs {g.homeTeam}</div>
                      <div style={{display: 'flex', gap: '6px'}}>
                        <button 
                          className={`admin-btn small ${g.tempResult === g.awayTeam ? 'green' : 'gray'}`}
                          onClick={() => handleManualBatchChange(g.id, g.awayTeam)}
                          style={{padding: '6px 12px'}}
                        >
                          {g.awayTeam} 승
                        </button>
                        <button 
                          className={`admin-btn small ${g.tempResult === g.homeTeam ? 'blue' : 'gray'}`}
                          onClick={() => handleManualBatchChange(g.id, g.homeTeam)}
                          style={{padding: '6px 12px'}}
                        >
                          {g.homeTeam} 승
                        </button>
                        <button 
                          className={`admin-btn small ${g.tempResult === '무승부' ? 'yellow' : 'gray'}`}
                          onClick={() => handleManualBatchChange(g.id, '무승부')}
                          style={{padding: '6px 12px'}}
                        >
                          무승부
                        </button>
                        <button 
                          className={`admin-btn small ${g.tempResult === '취소' ? 'red' : 'gray'}`}
                          onClick={() => handleManualBatchChange(g.id, '취소')}
                          style={{padding: '6px 12px'}}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {manualBatchGames.length > 0 && (
                <button onClick={saveManualBatchGames} className="admin-btn green full-width" style={{marginTop: '8px'}}>
                  ✅ 전체 저장 ({manualBatchGames.filter(g => g.tempResult !== (g.result || g.winner || '')).length}건 변경됨)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 기존 수동 경기 결과 추가 모달 (숨김 처리 또는 대체 가능하지만 일단 남겨둠) */}
      {activeModal === 'manualGame' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2 className="green">📝 경기 결과 수동 추가</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={saveGame}>
                <div className="form-row">
                  <input type="date" value={gameForm.date} onChange={e => setGameForm({...gameForm, date: e.target.value})} className="admin-input" required />
                </div>
                <div className="form-row mobile-col">
                  <div style={{display:'flex', gap:'8px', flex:1}}>
                    <input type="text" placeholder="원정팀" value={gameForm.awayTeam} onChange={e => setGameForm({...gameForm, awayTeam: e.target.value})} className="admin-input flex-1" required />
                    <input type="number" placeholder="점수" value={gameForm.awayScore} onChange={e => setGameForm({...gameForm, awayScore: e.target.value})} className="admin-input w-16" required />
                  </div>
                  <div className="vs-text" style={{alignSelf:'center', color:'var(--gray)'}}>vs</div>
                  <div style={{display:'flex', gap:'8px', flex:1}}>
                    <input type="number" placeholder="점수" value={gameForm.homeScore} onChange={e => setGameForm({...gameForm, homeScore: e.target.value})} className="admin-input w-16" required />
                    <input type="text" placeholder="홈팀" value={gameForm.homeTeam} onChange={e => setGameForm({...gameForm, homeTeam: e.target.value})} className="admin-input flex-1" required />
                  </div>
                </div>
                <div className="form-row">
                  <input type="text" placeholder="승리팀 (예: KIA)" value={gameForm.winner} onChange={e => setGameForm({...gameForm, winner: e.target.value})} className="admin-input" required />
                </div>
                <button type="submit" className="admin-btn green full-width" style={{marginTop: '16px'}}>저장하기</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 4. 수동 예측 추가 모달 */}
      {activeModal === 'manualPred' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2 className="blue">🎯 승패 예측 수동 추가</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={savePrediction}>
                <div className="form-row">
                  <input type="date" value={predForm.date} onChange={e => setPredForm({...predForm, date: e.target.value})} className="admin-input" required />
                </div>
                <div className="form-row mobile-col">
                  <input type="text" placeholder="원정팀" value={predForm.awayTeam} onChange={e => setPredForm({...predForm, awayTeam: e.target.value})} className="admin-input flex-1" required />
                  <div className="vs-text" style={{alignSelf:'center', color:'var(--gray)'}}>vs</div>
                  <input type="text" placeholder="홈팀" value={predForm.homeTeam} onChange={e => setPredForm({...predForm, homeTeam: e.target.value})} className="admin-input flex-1" required />
                </div>
                {/* AI 3개 독립 예측 입력 */}
                <div style={{background:'rgba(168,85,247,0.06)', border:'1px solid rgba(168,85,247,0.2)', borderRadius:'8px', padding:'10px 12px', marginBottom:'8px'}}>
                  <div style={{fontSize:'11px', color:'var(--purple)', fontWeight:700, marginBottom:'8px'}}>🤖 AI별 예측 (고정 순서)</div>
                  <div className="form-row">
                    <span style={{fontSize:'12px', color:'var(--gray)', width:'70px'}}>반짝이</span>
                    <input type="text" placeholder="Gemini Pro 예측팀" value={predForm.ai1} onChange={e => setPredForm({...predForm, ai1: e.target.value})} className="admin-input flex-1" />
                  </div>
                  <div className="form-row">
                    <span style={{fontSize:'12px', color:'var(--gray)', width:'70px'}}>별이</span>
                    <input type="text" placeholder="Gemini Flash 예측팀" value={predForm.ai2} onChange={e => setPredForm({...predForm, ai2: e.target.value})} className="admin-input flex-1" />
                  </div>
                  <div className="form-row">
                    <span style={{fontSize:'12px', color:'var(--gray)', width:'70px'}}>초롱이</span>
                    <input type="text" placeholder="Gemini 2.0 예측팀" value={predForm.ai3} onChange={e => setPredForm({...predForm, ai3: e.target.value})} className="admin-input flex-1" />
                  </div>
                </div>
                <div className="form-row">
                  <input type="text" placeholder="최종픽 (다수결)" value={predForm.predictedWinner} onChange={e => setPredForm({...predForm, predictedWinner: e.target.value})} className="admin-input flex-1" required />
                  <select value={predForm.confidence} onChange={e => setPredForm({...predForm, confidence: e.target.value})} className="admin-input flex-1">
                    <option value="">확률 (선택)</option>
                    <option value="높음">높음</option>
                    <option value="중간">중간</option>
                    <option value="낮음">낮음</option>
                  </select>
                </div>
                <div className="form-row">
                  <input type="text" placeholder="예측 이유 (간단히)" value={predForm.reason} onChange={e => setPredForm({...predForm, reason: e.target.value})} className="admin-input" />
                </div>
                <button type="submit" className="admin-btn blue full-width" style={{marginTop: '16px'}}>저장하기</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 5. 딥다이브 리포트 모달 */}
      {aiReport && (
        <div className="modal-overlay" onClick={() => setAiReport(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="blue">🤖 AI 딥다이브 분석</h2>
              <button className="modal-close" onClick={() => setAiReport(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {isAiLoading ? (
                <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'160px'}}>
                  <div className="spinner" style={{width:'48px', height:'48px', borderWidth:'3px', color:'var(--blue)'}}></div>
                </div>
              ) : (
                <pre style={{whiteSpace:'pre-wrap', fontFamily:'inherit', margin:0}}>{aiReport}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
