import React, { useState, useEffect, useRef } from 'react';
import './MobileAdminDashboard.css';
import '../MobileDashboard.css';

const MobileAdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('bets'); // 'bets' | 'ai' | 'system'
  const [loading, setLoading] = useState(false);

  // 데이터 상태
  const [bets, setBets] = useState([]);
  const [aiModels, setAiModels] = useState([]);
  const [games, setGames] = useState([]);
  const [predictions, setPredictions] = useState([]);

  // 모달 상태
  const [activeModal, setActiveModal] = useState(null); // 'parseBet' | 'aiModel' | 'editGame' | 'editPred'
  const [isSyncing, setIsSyncing] = useState(false);

  // 폼 상태
  const [aiForm, setAiForm] = useState({ id: '', name: '', label: '', model: '', order: 0 });
  
  // 영수증 파싱 폼
  const [betParseInput, setBetParseInput] = useState('image'); // 'image' | 'text'
  const [betImageBase64, setBetImageBase64] = useState(null);
  const [betImageMime, setBetImageMime] = useState('image/jpeg');
  const [betImagePreview, setBetImagePreview] = useState(null);
  const [betRawText, setBetRawText] = useState('');
  const [isParsingBet, setIsParsingBet] = useState(false);
  const [parsedBet, setParsedBet] = useState(null); // 파싱 완료 후 확인용
  const betFileInputRef = useRef(null);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [bRes, aRes, gRes, pRes] = await Promise.all([
        fetch('/api/admin/bets'),
        fetch('/api/admin/ai_models'),
        fetch('/api/admin/games'),
        fetch('/api/admin/predictions')
      ]);
      if (bRes.ok) setBets(await bRes.json());
      if (aRes.ok) setAiModels(await aRes.json());
      if (gRes.ok) setGames(await gRes.json());
      if (pRes.ok) setPredictions(await pRes.json());
    } catch(e) { console.error('Fetch Error:', e); }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // 삭제 공통 함수
  const deleteItem = async (type, id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/admin/${type}?id=${id}`, { method: 'DELETE' });
    fetchAllData();
  };

  // ===================== 1. 베팅 장부 (Bets) =====================
  const handleBetImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBetImageMime(file.type || 'image/jpeg');
    setBetImagePreview(URL.createObjectURL(file));
    setParsedBet(null);
    const reader = new FileReader();
    reader.onload = () => setBetImageBase64(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const parseBetReceipt = async () => {
    if (!betImageBase64 && !betRawText) return alert('이미지나 텍스트를 입력해주세요.');
    setIsParsingBet(true);
    setParsedBet(null);
    try {
      const res = await fetch('/api/admin/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageBase64: betImageBase64, 
          mimeType: betImageMime, 
          rawText: betRawText,
          parseType: 'bet'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.success && data.bet) {
        setParsedBet(data.bet);
      } else {
        alert('파싱 결과가 없습니다.');
      }
    } catch(e) { alert('파싱 오류: ' + e.message); }
    setIsParsingBet(false);
  };

  const saveParsedBet = async () => {
    if (!parsedBet) return;
    await fetch('/api/admin/bets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedBet)
    });
    alert('✅ 장부에 등록되었습니다!');
    setBetImageBase64(null); setBetImagePreview(null); setBetRawText(''); setParsedBet(null);
    setActiveModal(null);
    fetchAllData();
  };

  const renderBetsTab = () => (
    <div className="mob-admin-tab-content">
      <div className="mob-admin-header-row">
        <h2>🧾 내 투자 장부</h2>
      </div>
      {bets.length === 0 && <div className="empty-state">아직 기록된 영수증이 없습니다.</div>}
      {bets.map(b => (
        <div key={b.id} className="mob-admin-card bet-card">
          <div className="bet-card-header">
            <span className="bet-date">{b.date}</span>
            <span className={`bet-status ${b.status}`}>{b.status === 'hit' ? '✅ 적중' : b.status === 'miss' ? '❌ 실패' : '⏳ 대기'}</span>
          </div>
          <div className="bet-amount-row">
            <div className="bet-kpi"><label>베팅금액</label><b>{b.amount?.toLocaleString()}원</b></div>
            <div className="bet-kpi"><label>배당률</label><b style={{color:'var(--gold)'}}>{b.odds}배</b></div>
            <div className="bet-kpi"><label>예상수익</label><b style={{color:'var(--green)'}}>+{Math.round((b.amount||0)*(b.odds||0) - (b.amount||0)).toLocaleString()}원</b></div>
          </div>
          <div className="bet-picks-list">
            {(b.picks||[]).map((p, i) => (
              <div key={i} className="bet-pick-row">
                <span className="bet-matchup">{p.matchup}</span>
                <span className="bet-pick-chip">{p.pick}</span>
              </div>
            ))}
          </div>
          <div className="mob-admin-actions" style={{justifyContent:'flex-end', marginTop: 8}}>
             <button className="mob-admin-btn danger" onClick={() => deleteItem('bets', b.id)}>삭제</button>
          </div>
        </div>
      ))}
      <div className="mob-fab-container">
        <button className="mob-fab green" onClick={() => setActiveModal('parseBet')}>+</button>
      </div>
    </div>
  );

  // ===================== 2. AI 설정 (AI Models) =====================
  const openAiModal = (ai = null) => {
    if (ai) setAiForm({ id: ai.id, name: ai.name, label: ai.label, model: ai.model, order: ai.order });
    else setAiForm({ id: '', name: '', label: '', model: '', order: aiModels.length });
    setActiveModal('aiModel');
  };

  const saveAiModel = async (e) => {
    e.preventDefault();
    const method = aiForm.id ? 'PUT' : 'POST';
    await fetch('/api/admin/ai_models', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiForm)
    });
    setActiveModal(null);
    fetchAllData();
  };

  const renderAiTab = () => (
    <div className="mob-admin-tab-content">
      <div className="mob-admin-header-row">
        <h2>🤖 AI 모델 설정</h2>
        <p className="desc">예측에 참여할 모델들을 관리합니다.</p>
      </div>
      {aiModels.map(ai => (
        <div key={ai.id} className="mob-admin-card ai-card">
          <div className="ai-card-main">
            <h3>{ai.label} <span className="ai-name-badge">({ai.name})</span></h3>
            <div className="ai-model-name">{ai.model}</div>
          </div>
          <div className="mob-admin-actions">
            <button className="mob-admin-btn" onClick={() => openAiModal(ai)}>수정</button>
            <button className="mob-admin-btn danger" onClick={() => deleteItem('ai_models', ai.id)}>삭제</button>
          </div>
        </div>
      ))}
      <div className="mob-fab-container">
        <button className="mob-fab" style={{background:'var(--purple)'}} onClick={() => openAiModal(null)}>+</button>
      </div>
    </div>
  );

  // ===================== 3. 시스템 제어 (System) =====================
  const handleForceSync = async () => {
    if (!window.confirm('지금 즉시 KBO 결과와 AI 예측을 강제 실행할까요?\n(Cron 스케줄과 동일하게 동작합니다)')) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/admin/force-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`[동기화 완료]\n${data.message || '예측이 성공적으로 갱신되었습니다.'}`);
      fetchAllData();
    } catch(e) {
      alert('오류가 발생했습니다: ' + e.message);
    }
    setIsSyncing(false);
  };

  const renderSystemTab = () => {
    const groupedGames = Object.values(games.reduce((acc, g) => {
      if (!acc[g.date]) acc[g.date] = { date: g.date, items: [] };
      acc[g.date].items.push(g);
      return acc;
    }, {})).sort((a,b) => b.date.localeCompare(a.date));

    return (
      <div className="mob-admin-tab-content">
         <div className="mob-admin-header-row">
          <h2>⚙️ 시스템 조종실</h2>
        </div>
        
        <div className="mob-admin-card" style={{borderColor:'var(--purple)', background:'rgba(168, 85, 247, 0.05)'}}>
          <h3 style={{marginTop:0, marginBottom:8, fontSize:15}}>수동 동기화</h3>
          <p style={{fontSize:12, color:'var(--gray)', marginBottom:12}}>KBO 경기 결과를 불러오고 내일 경기 예측을 새로 생성합니다.</p>
          <button 
            onClick={handleForceSync} 
            disabled={isSyncing}
            style={{width:'100%', padding:'14px', borderRadius:'8px', background:'var(--purple)', color:'white', border:'none', fontWeight:700, fontSize:15}}>
            {isSyncing ? '⏳ 동기화 진행 중...' : '🔄 지금 강제 동기화 실행'}
          </button>
        </div>

        <h3 style={{marginTop: 20, fontSize:14, paddingLeft: 4}}>원시 데이터 교정 (오류 수정용)</h3>
        {groupedGames.map((day, i) => (
          <div key={i} className="mob-admin-card">
            <div className="mob-admin-card-header">
              <span className="mob-admin-date">{day.date}</span>
            </div>
            {day.items.map(g => (
              <div key={g.id} className="mob-admin-row">
                <div className="mob-admin-matchup">
                  <span>{g.awayTeam} <span style={{color:'var(--red)'}}>{g.awayScore}</span> vs <span style={{color:'var(--blue)'}}>{g.homeScore}</span> {g.homeTeam}</span>
                  <span className="mob-admin-result" style={{color:'var(--yellow)'}}>{g.winner} 승</span>
                </div>
                <div className="mob-admin-actions">
                  <button className="mob-admin-btn danger" onClick={() => deleteItem('games', g.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mob-admin-container">
      <header className="mob-admin-header">
        <div className="logo">👑 Admin<em>Mobile</em></div>
      </header>

      <div className="mob-admin-content">
        {loading && <div style={{textAlign:'center', padding: '20px', color:'var(--gray)'}}>로딩 중...</div>}
        {!loading && activeTab === 'bets' && renderBetsTab()}
        {!loading && activeTab === 'ai' && renderAiTab()}
        {!loading && activeTab === 'system' && renderSystemTab()}
      </div>

      {/* 하단 네비게이션 */}
      <nav className="mob-nav">
        <button className={`mob-tab-btn ${activeTab === 'bets' ? 'active' : ''}`} onClick={() => setActiveTab('bets')}>
          <span className="mob-tab-icon">🧾</span>
          <span className="mob-tab-label">베팅장부</span>
        </button>
        <button className={`mob-tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
          <span className="mob-tab-icon">🤖</span>
          <span className="mob-tab-label">AI설정</span>
        </button>
        <button className={`mob-tab-btn ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>
          <span className="mob-tab-icon">⚙️</span>
          <span className="mob-tab-label">조종실</span>
        </button>
      </nav>

      {/* 영수증 스캔 모달 */}
      {activeModal === 'parseBet' && (
        <div className="mob-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="mob-modal-content" onClick={e => e.stopPropagation()}>
             <div className="mob-modal-header">
              <h2>📸 영수증 업로드</h2>
              <button className="mob-admin-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            
            <div className="scan-tabs">
              <button className={betParseInput === 'image' ? 'active' : ''} onClick={() => setBetParseInput('image')}>이미지 스캔</button>
              <button className={betParseInput === 'text' ? 'active' : ''} onClick={() => setBetParseInput('text')}>텍스트 복붙</button>
            </div>

            {betParseInput === 'image' ? (
              <div className="scan-body">
                <input type="file" accept="image/*" onChange={handleBetImageSelect} ref={betFileInputRef} style={{display:'none'}} id="bet-file" />
                <label htmlFor="bet-file" className="file-upload-label">
                  {betImagePreview ? '이미지 변경' : '사진 앨범에서 선택'}
                </label>
                {betImagePreview && <img src={betImagePreview} alt="preview" style={{width:'100%', borderRadius:8, marginTop:12}} />}
              </div>
            ) : (
              <div className="scan-body">
                <textarea 
                  className="mob-admin-input" 
                  rows="6" 
                  placeholder="베팅 내역을 복사해서 붙여넣으세요..."
                  value={betRawText}
                  onChange={e => setBetRawText(e.target.value)}
                />
              </div>
            )}

            {!parsedBet ? (
              <button onClick={parseBetReceipt} className="mob-admin-submit-btn" style={{background:'var(--green)'}} disabled={isParsingBet}>
                {isParsingBet ? 'AI가 판독 중...' : 'AI 스캔 시작'}
              </button>
            ) : (
              <div className="parsed-result-box" style={{background:'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, marginTop: 12}}>
                <h3 style={{fontSize:14, marginTop:0}}>파싱 결과 확인</h3>
                <div style={{fontSize:13}}>
                  <p>일자: {parsedBet.date}</p>
                  <p>금액: {parsedBet.amount?.toLocaleString()}원</p>
                  <p>배당: {parsedBet.odds}배</p>
                  <ul>
                    {parsedBet.picks?.map((p,i)=><li key={i}>{p.matchup} ({p.pick})</li>)}
                  </ul>
                </div>
                <button onClick={saveParsedBet} className="mob-admin-submit-btn" style={{background:'var(--blue)', marginTop: 12}}>장부에 등록하기</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI 설정 폼 모달 */}
      {activeModal === 'aiModel' && (
        <div className="mob-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="mob-modal-content" onClick={e => e.stopPropagation()}>
            <div className="mob-modal-header">
              <h2>{aiForm.id ? '🤖 AI 수정' : '🤖 새 AI 추가'}</h2>
              <button className="mob-admin-btn" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <form onSubmit={saveAiModel}>
              <label className="input-label">식별자 (예: ai4)</label>
              <input type="text" className="mob-admin-input" value={aiForm.name} onChange={e => setAiForm({...aiForm, name: e.target.value})} required />
              
              <label className="input-label">출력 이름 (예: 구름이)</label>
              <input type="text" className="mob-admin-input" value={aiForm.label} onChange={e => setAiForm({...aiForm, label: e.target.value})} required />
              
              <label className="input-label">실제 모델명 (Gemini API)</label>
              <input type="text" className="mob-admin-input" value={aiForm.model} onChange={e => setAiForm({...aiForm, model: e.target.value})} placeholder="gemini-1.5-pro" required />
              
              <label className="input-label">정렬 순서</label>
              <input type="number" className="mob-admin-input" value={aiForm.order} onChange={e => setAiForm({...aiForm, order: Number(e.target.value)})} required />
              
              <button type="submit" className="mob-admin-submit-btn" style={{background:'var(--purple)'}}>저장</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileAdminDashboard;
