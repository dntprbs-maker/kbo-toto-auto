import React, { useState, useEffect } from 'react';
import DesktopView from './DesktopView';
import MobileView from './MobileView';

const Home = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // 화면 너비를 체크하여 모바일 여부 판단 (기준: 768px)
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIsMobile(); // 초기 렌더링 시 체크

    // 화면 크기 변경 시 이벤트 리스너 등록
    window.addEventListener('resize', checkIsMobile);
    
    // 컴포넌트 언마운트 시 리스너 해제
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // 화면 크기에 따라 다른 컴포넌트 렌더링
  return isMobile ? <MobileView /> : <DesktopView />;
};

export default Home;
