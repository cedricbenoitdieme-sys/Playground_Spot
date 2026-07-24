import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { signOut } from '../../services/auth';
import { 
  IconLayoutDashboard, 
  IconBuildingStore, 
  IconUsers, 
  IconCreditCard, 
  IconShieldCheck, 
  IconArrowLeft, 
  IconLogout,
  IconBallFootball
} from '@tabler/icons-react';

import { AdminDashboard } from './AdminDashboard';
import { AdminTerrains } from './AdminTerrains';
import { AdminUsers } from './AdminUsers';
import { AdminSubscriptions } from './AdminSubscriptions';
import { AdminLogs } from './AdminLogs';

export const AdminLayout = ({ onExit }) => {
  const { currentUser, setCurrentUser } = useUser();

  // 1. Synchronisation avec le Hash URL (#admin-tab) et localStorage
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('admin-')) {
      const tab = hash.replace('admin-', '');
      if (['dashboard', 'terrains', 'users', 'subscriptions', 'logs'].includes(tab)) {
        return tab;
      }
    }
    return localStorage.getItem('admin_active_tab') || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('admin_active_tab', activeTab);
    if (window.location.hash !== `#admin-${activeTab}`) {
      window.history.pushState(null, '', `#admin-${activeTab}`);
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('admin-')) {
        const tab = hash.replace('admin-', '');
        if (['dashboard', 'terrains', 'users', 'subscriptions', 'logs'].includes(tab)) {
          setActiveTab(tab);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      setCurrentUser(null);
      window.location.href = '/';
    } catch (err) {
      console.error('Erreur lors de la déconnexion:', err);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
    { id: 'terrains', label: 'Terrains', icon: IconBuildingStore },
    { id: 'users', label: 'Utilisateurs', icon: IconUsers },
    { id: 'subscriptions', label: 'Abonnements', icon: IconCreditCard },
    { id: 'logs', label: 'Audit Logs', icon: IconShieldCheck },
  ];

  // Garde d'accès Super Admin
  if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
    return (
      <div className="min-h-screen bg-[#0F2318] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white/5 border border-white/10 p-8 rounded-3xl space-y-4">
          <h2 className="text-xl font-bold font-display text-red-400">Accès Refusé</h2>
          <p className="text-sm text-gray-300">Vous devez avoir le rôle Super Admin pour accéder à cette interface.</p>
          {onExit && (
            <button 
              onClick={onExit}
              className="w-full bg-primary py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Retour à l'application
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F4] text-primary-dark flex flex-col md:flex-row font-sans">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0F2318] text-white p-5 gap-6 shrink-0 border-r border-white/5 h-screen sticky top-0">
        
        {/* Logo PlaygroundSpot */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <IconBallFootball className="text-white" size={24} />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-black tracking-tight text-white uppercase font-display">PlaygroundSpot</span>
            <span className="text-[9px] font-black uppercase text-primary tracking-widest leading-none">Super Admin</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex flex-col gap-1.5 flex-1 pt-4">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`h-11 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-3 transition-all active:scale-[0.98] cursor-pointer ${
                activeTab === item.id
                  ? 'bg-primary text-white shadow-md'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Back to App */}
        {onExit && (
          <button
            onClick={onExit}
            className="h-11 px-3.5 border border-white/10 hover:bg-white/5 text-xs font-bold uppercase tracking-wide rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] cursor-pointer text-white/70 hover:text-white"
          >
            <IconArrowLeft size={18} />
            Retour App
          </button>
        )}

        {/* Footer Logout */}
        <button
          onClick={handleLogout}
          className="h-11 px-3.5 border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-bold uppercase tracking-wide rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] cursor-pointer"
        >
          <IconLogout size={18} />
          Déconnexion
        </button>
      </aside>

      {/* Header - Mobile */}
      <header className="md:hidden bg-[#0F2318] text-white border-b border-white/10 h-16 px-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white">
            <IconBallFootball size={18} />
          </div>
          <span className="text-sm font-black uppercase tracking-tight text-white font-display">Super Admin</span>
        </div>
        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="text-white/70 hover:text-white p-1.5 cursor-pointer"
              title="Retour App"
            >
              <IconArrowLeft size={20} />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-red-400 p-1.5 cursor-pointer"
            title="Se déconnecter"
          >
            <IconLogout size={20} />
          </button>
        </div>
      </header>

      {/* Main Panel Content */}
      <main className="flex-1 p-4 sm:p-6 md:p-10 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10 overflow-y-auto overflow-x-hidden max-w-7xl mx-auto w-full min-w-0">
        {activeTab === 'dashboard' && <AdminDashboard onNavigate={setActiveTab} />}
        {activeTab === 'terrains' && <AdminTerrains />}
        {activeTab === 'users' && <AdminUsers />}
        {activeTab === 'subscriptions' && <AdminSubscriptions />}
        {activeTab === 'logs' && <AdminLogs />}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0F2318] border-t border-white/10 pb-[env(safe-area-inset-bottom)] h-[calc(4rem+env(safe-area-inset-bottom))] flex justify-around items-center z-50">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
              activeTab === item.id ? 'text-primary font-bold' : 'text-white/50'
            }`}
          >
            <item.icon size={20} />
            <span className="text-[9px] uppercase tracking-wider font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
};
