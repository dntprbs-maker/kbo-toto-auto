import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import MainDashboard from './components/MainDashboard';
import MobileDashboard from './components/MobileDashboard';
import AdminDashboard from './components/admin/AdminDashboard';

import MobileAdminDashboard from './components/admin/MobileAdminDashboard';

// 화면 너비 768px 기준으로 모바일/데스크탑 분기
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
};

const App = () => {
  const isMobile = useIsMobile();

  return (
    <Routes>
      {/* 메인 화면 — 모바일/PC 자동 분기 */}
      <Route path="/" element={isMobile ? <MobileDashboard /> : <MainDashboard />} />

      {/* 관리자 모드 — 모바일/PC 자동 분기 */}
      <Route path="/admin" element={isMobile ? <MobileAdminDashboard /> : <AdminDashboard />} />
    </Routes>
  );
};

export default App;
