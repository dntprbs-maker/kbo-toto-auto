import React, { useState } from 'react';
import { Trophy, BarChart3, TrendingUp, Search, Calendar, ChevronRight } from 'lucide-react';

const DesktopView = () => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center py-12 px-6">
      {/* Main Container for PC */}
      <div className="w-full max-w-5xl bg-slate-900/30 border border-slate-800 rounded-3xl p-10 relative overflow-hidden shadow-2xl flex flex-col items-center">
        
        {/* Background glow effects */}
      <div className="fixed top-0 inset-x-0 h-96 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative w-full max-w-4xl text-center mb-16 space-y-6">
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md mb-4">
          <Trophy className="text-yellow-500" size={20} />
          <span className="text-sm font-semibold tracking-wider text-slate-300">KBO TOTO ANALYTICS</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 text-transparent bg-clip-text drop-shadow-sm">
          KBO 승부예측의 모든 것
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          고급 통계와 머신러닝 데이터를 활용한 완벽한 KBO 리그 분석. 지금 바로 스마트한 승부예측을 시작하세요.
        </p>

        {/* Search Input */}
        <div className="max-w-2xl mx-auto mt-8 relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative flex items-center bg-slate-900/90 border border-slate-700/50 rounded-2xl p-2 shadow-2xl backdrop-blur-xl">
            <Search className="text-slate-500 ml-4 mr-3" size={24} />
            <input 
              type="text" 
              placeholder="팀명, 선수명, 날짜 검색..."
              className="flex-1 bg-transparent border-none text-lg text-slate-200 placeholder-slate-500 focus:outline-none py-3"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25 active:scale-95">
              분석하기
            </button>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <main className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
        <div className="group bg-slate-900/50 backdrop-blur-md border border-slate-800 p-8 rounded-3xl hover:bg-slate-800/50 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-blue-900/20 hover:border-blue-500/30">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-6 group-hover:scale-110 transition-transform">
            <TrendingUp className="text-blue-400" size={28} />
          </div>
          <h3 className="text-xl font-bold mb-3 text-slate-200">실시간 배당 흐름</h3>
          <p className="text-slate-400 leading-relaxed text-sm mb-6">
            실시간 오즈메이커 데이터와 국내외 배당 흐름을 한눈에 비교 분석합니다.
          </p>
          <div className="flex items-center text-blue-400 text-sm font-semibold">
            자세히 보기 <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        <div className="group bg-slate-900/50 backdrop-blur-md border border-slate-800 p-8 rounded-3xl hover:bg-slate-800/50 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-purple-900/20 hover:border-purple-500/30">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 mb-6 group-hover:scale-110 transition-transform">
            <BarChart3 className="text-purple-400" size={28} />
          </div>
          <h3 className="text-xl font-bold mb-3 text-slate-200">고급 세이버메트릭스</h3>
          <p className="text-slate-400 leading-relaxed text-sm mb-6">
            WAR, OPS, FIP 등 현대 야구 통계를 기반으로 팀의 실질적 전력을 평가합니다.
          </p>
          <div className="flex items-center text-purple-400 text-sm font-semibold">
            자세히 보기 <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        <div className="group bg-slate-900/50 backdrop-blur-md border border-slate-800 p-8 rounded-3xl hover:bg-slate-800/50 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-emerald-900/20 hover:border-emerald-500/30">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-6 group-hover:scale-110 transition-transform">
            <Calendar className="text-emerald-400" size={28} />
          </div>
          <h3 className="text-xl font-bold mb-3 text-slate-200">오늘의 픽 & 결장 정보</h3>
          <p className="text-slate-400 leading-relaxed text-sm mb-6">
            선발 투수 매치업, 부상자 명단, 최근 5경기 상대 전적을 종합한 추천 픽.
          </p>
          <div className="flex items-center text-emerald-400 text-sm font-semibold">
            자세히 보기 <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </main>
      </div>
    </div>
  );
};

export default DesktopView;
