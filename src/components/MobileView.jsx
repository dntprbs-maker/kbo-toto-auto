import React from 'react';
import { Home, Calendar, User, AlignJustify, Search, Flame } from 'lucide-react';

const MobileView = () => {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Flame className="text-blue-500" size={24} />
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">KBO TOTO</h1>
        </div>
        <button className="p-2 rounded-full hover:bg-slate-800 text-slate-300">
          <Search size={20} />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 space-y-6">
        {/* Highlight Banner */}
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-700 rounded-2xl p-5 shadow-lg shadow-blue-900/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-10 -translate-y-10"></div>
          <h2 className="text-lg font-bold mb-1">오늘의 승부예측 픽!</h2>
          <p className="text-blue-100 text-sm mb-4">빅데이터가 분석한 오늘의 KBO 승리팀은?</p>
          <button className="bg-white text-blue-900 px-4 py-2 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-transform">
            지금 확인하기
          </button>
        </div>

        {/* Today's Matches List (Mock) */}
        <div>
          <div className="flex justify-between items-end mb-4">
            <h3 className="text-lg font-bold">오늘의 경기</h3>
            <span className="text-xs text-slate-400">18:30 시작</span>
          </div>
          
          <div className="space-y-3">
            {/* Match Card 1 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 active:bg-slate-800 transition-colors">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold px-2 py-1 bg-slate-800 rounded-md text-slate-300">잠실</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <div className="text-lg font-bold">LG</div>
                  <div className="text-xs text-slate-400 mt-1">임찬규</div>
                </div>
                <div className="px-4 py-1 bg-slate-800 rounded-full text-sm font-bold text-slate-300">
                  VS
                </div>
                <div className="text-center flex-1">
                  <div className="text-lg font-bold">KIA</div>
                  <div className="text-xs text-slate-400 mt-1">양현종</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <button className="bg-slate-800 hover:bg-blue-600/50 py-2 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">승</span>
                  <span>1.85</span>
                </button>
                <button className="bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">무</span>
                  <span>4.20</span>
                </button>
                <button className="bg-slate-800 hover:bg-red-600/50 py-2 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">패</span>
                  <span>2.10</span>
                </button>
              </div>
            </div>

            {/* Match Card 2 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 active:bg-slate-800 transition-colors">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold px-2 py-1 bg-slate-800 rounded-md text-slate-300">사직</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <div className="text-lg font-bold">롯데</div>
                  <div className="text-xs text-slate-400 mt-1">반즈</div>
                </div>
                <div className="px-4 py-1 bg-slate-800 rounded-full text-sm font-bold text-slate-300">
                  VS
                </div>
                <div className="text-center flex-1">
                  <div className="text-lg font-bold">두산</div>
                  <div className="text-xs text-slate-400 mt-1">알칸타라</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <button className="bg-slate-800 hover:bg-blue-600/50 py-2 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">승</span>
                  <span>2.05</span>
                </button>
                <button className="bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">무</span>
                  <span>4.00</span>
                </button>
                <button className="bg-slate-800 hover:bg-red-600/50 py-2 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400">패</span>
                  <span>1.95</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex justify-around items-center p-2 pb-safe z-50">
        <button className="flex flex-col items-center p-2 text-blue-500">
          <Home size={24} />
          <span className="text-[10px] mt-1 font-medium">홈</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500 hover:text-slate-300 transition-colors">
          <Calendar size={24} />
          <span className="text-[10px] mt-1 font-medium">일정</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500 hover:text-slate-300 transition-colors">
          <AlignJustify size={24} />
          <span className="text-[10px] mt-1 font-medium">기록</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500 hover:text-slate-300 transition-colors">
          <User size={24} />
          <span className="text-[10px] mt-1 font-medium">MY</span>
        </button>
      </nav>
    </div>
  );
};

export default MobileView;
