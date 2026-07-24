import React from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ChatWidget } from './ChatWidget';

export const Layout = ({ children, currentView, setView }) => {
  const isDetailView = ['terrain-detail', 'booking-flow', 'reservation-detail'].includes(currentView);
  const isFullPageView = ['landing', 'login', 'register'].includes(currentView);

  const isAdminDashboard = currentView === 'dashboard';

  if (isFullPageView) {
    return (
      <div className="min-h-screen w-full bg-[#0F2318] text-white overflow-x-hidden">
        {children}
        <ChatWidget />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F4F6F4] text-primary-dark">
      {!isAdminDashboard && <Sidebar currentView={currentView} setView={setView} />}
      
      <main className={`flex-1 flex flex-col h-full min-h-0 overflow-y-auto ${
        isAdminDashboard ? 'lg:ml-0' : 'lg:ml-64'
      } lg:pb-0 ${
        isDetailView ? 'pb-0' : 'pb-[60px] pb-safe'
      }`}>
        {children}
      </main>

      {!isDetailView && !isAdminDashboard && (
        <BottomNav currentView={currentView} setView={setView} />
      )}
      <ChatWidget />
    </div>
  );
};
