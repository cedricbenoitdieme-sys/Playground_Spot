import React, { useState, useRef, useEffect } from 'react';
import { IconBell, IconSearch, IconX, IconCheck, IconHome, IconBallFootball } from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
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

  // Ajouter le rapport hebdomadaire aux notifications pour les gérants / admins
  useEffect(() => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'gerant') {
      const lastMonday = new Date();
      const day = lastMonday.getDay();
      const diff = lastMonday.getDate() - day + (day === 0 ? -6 : 1);
      lastMonday.setDate(diff);
      const lastMondayStr = lastMonday.toLocaleDateString('fr-FR');

      // Éviter de dupliquer la notification
      setNotifications(prev => {
        if (prev.some(n => n.id === 'weekly-report-notif')) return prev;
        return [
          {
            id: 'weekly-report-notif',
            text: `Le rapport hebdomadaire (${lastMondayStr}) est disponible.`,
            time: "Rapport PDF",
            read: false,
            isReport: true,
            downloadUrl: `${import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3000')}/api/reports/weekly`
          },
          ...prev
        ];
      });
    }
  }, [currentUser]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      showToast(`Recherche pour: "${search}"`);
    }
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
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
          sub: `Quartier ${currentUser.quartier}`,
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
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${!n.read ? 'bg-secondary' : 'bg-transparent'}`}></div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.read ? 'font-bold text-primary-dark' : 'text-gray-600'}`}>{n.text}</p>
                        <p className="text-xs text-gray-400 mt-1">{n.time}</p>
                        {n.isReport && (
                          <a 
                            href={n.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-bold rounded-lg mt-2.5 hover:bg-primary hover:text-white transition-all duration-300"
                          >
                            Télécharger le PDF 📥
                          </a>
                        )}
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
          className="lg:hidden w-10 h-10 rounded-full border-2 border-primary/20 flex-shrink-0 flex items-center justify-center bg-primary text-white font-black text-sm cursor-pointer hover:scale-105 active:scale-95 transition-transform overflow-hidden"
        >
          {currentUser.avatar && (currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('/')) ? (
            <img src={currentUser.avatar} alt={currentUser.nom} className="w-full h-full object-cover" />
          ) : (
            currentUser.initiales || (currentUser.nom || '').substring(0, 2).toUpperCase()
          )}
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
