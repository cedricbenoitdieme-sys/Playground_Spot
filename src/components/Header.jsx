import React, { useState, useRef, useEffect } from 'react';
import { IconBell, IconSearch, IconX, IconCheck, IconHome, IconBallFootball } from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { PlanBadge } from './PlanBadge';

export const Header = ({ title: passedTitle, showSearch = false, setView, displayPlan: passedDisplayPlan }) => {
  const { currentUser, displayPlan: contextDisplayPlan } = useUser();
  const displayPlan = passedDisplayPlan !== undefined ? passedDisplayPlan : contextDisplayPlan;
  const [search, setSearch] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);

  const notifRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const today = currentTime.toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });

  const timeString = currentTime.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Écouter et charger les vraies notifications Supabase + Realtime
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;

    const fetchNotifs = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!cancelled && !error && data) {
        setNotifications(data);
      }
    };

    fetchNotifs();

    // Abonnement Realtime Supabase
    const channel = supabase
      .channel(`user_notifs_${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          fetchNotifs();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      showToast(`Recherche pour: "${search}"`);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser?.id || notifications.length === 0) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }
  };

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleProfileClick = () => {
    if (!setView) return;
    if (['admin', 'super_admin'].includes(currentUser.role)) setView('parametres');
    else if (currentUser.role === 'gerant') setView('gerant-parametres');
    else setView('joueur-profile');
  };

  const getHeaderInfo = () => {
    switch (currentUser.role) {
      case 'admin':
      case 'super_admin':
        return {
          title: passedTitle || "Tableau de bord Super Admin",
          sub: "Aujourd'hui, " + today,
          badge: "SUPER ADMIN"
        };
      case 'gerant':
        return {
          title: passedTitle || `Bonjour ${currentUser.nom.split(' ')[0]} 👋`,
          sub: currentUser.quartier ? `Quartier ${currentUser.quartier}` : '',
          badge: "GÉRANT TERRAIN"
        };
      case 'joueur':
      default:
        return {
          title: `Bonjour ${currentUser.nom.split(' ')[0]} 👋`,
          sub: currentUser.quartier ? `Quartier ${currentUser.quartier}` : '',
          badge: "JOUEUR PLATFORM"
        };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <header className="sticky top-0 lg:relative flex-shrink-0 flex items-center justify-between px-4 py-4 lg:px-8 lg:py-6 z-40 bg-[#F4F6F4]/90 backdrop-blur-md lg:bg-transparent border-b border-gray-100 lg:border-none shadow-sm lg:shadow-none transition-all">
      <div className="flex items-center gap-3">
        {/* Brand Icon for Mobile Parity */}
        <div 
          onClick={() => { if (setView) setView('landing'); }}
          className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-md shadow-primary/20 cursor-pointer hover:scale-105 active:scale-95 transition-transform shrink-0"
        >
          <IconBallFootball size={22} />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl lg:text-3xl text-primary-dark tracking-tight font-display font-bold">{headerInfo.title}</h1>
            <span className="text-[9px] font-black tracking-widest text-primary bg-primary/5 border border-primary/20 px-2 py-0.5 rounded-full uppercase">
              {headerInfo.badge}
            </span>
            <PlanBadge displayPlan={displayPlan} />
          </div>
          <div className="flex items-center flex-wrap gap-2 text-xs lg:text-sm text-gray-500 font-medium mt-0.5">
          <span>{headerInfo.sub}</span>
          {['admin', 'super_admin'].includes(currentUser.role) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/5 text-primary text-xs font-mono font-bold border border-primary/10 tabular-nums shadow-sm select-none">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span>{timeString}</span>
            </span>
          )}
        </div>
      </div>
    </div>

      <div className="flex items-center gap-4">
        {/* Search - Hidden on small mobile */}
        {showSearch && (
          <form onSubmit={handleSearch} className="hidden sm:flex items-center bg-white border border-gray-100 rounded-full px-4 py-2 w-64 shadow-sm focus-within:ring-2 ring-primary/20 transition-all">
            <IconSearch size={18} className="text-gray-400" />
            <input 
              type="text" 
              placeholder="Rechercher..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none focus:outline-none ml-2 text-sm w-full"
            />
          </form>
        )}

        {/* Return to Landing Page */}
        <button 
          onClick={() => { if (setView) setView('landing'); }}
          className="p-2 bg-white rounded-full border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors active:scale-95 text-gray-600 hover:text-primary cursor-pointer"
          title="Retourner au Site Vitrine"
        >
          <IconHome size={20} />
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 bg-white rounded-full border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors active:scale-95"
          >
            <IconBell size={20} className={`transition-colors ${unreadCount > 0 ? 'text-primary' : 'text-gray-600'}`} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-secondary rounded-full border-2 border-white animate-pulse"></span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="fixed top-[80px] right-4 left-4 sm:absolute sm:top-full sm:right-0 sm:left-auto sm:mt-2 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
              <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-bold text-primary-dark text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-[10px] text-primary hover:underline font-bold">
                    Tout marquer lu
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className={`p-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!n.read ? 'bg-primary/5' : ''}`}>
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!n.read ? 'bg-secondary' : 'bg-transparent'}`}></div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${!n.read ? 'text-primary-dark' : 'text-gray-700'}`}>{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    Aucune notification
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Avatar */}
        <div 
          onClick={handleProfileClick}
          className="lg:hidden flex-shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
        >
          <Avatar user={currentUser} className="w-10 h-10 rounded-full border-2 border-primary/20" textSize="text-sm" />
        </div>
      </div>

      {/* Simple Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </header>
  );
};
