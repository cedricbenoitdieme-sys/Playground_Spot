import React, { useState } from 'react';
import { 
  IconLayoutDashboard, 
  IconBallFootball, 
  IconCalendarEvent, 
  IconUsersGroup, 
  IconHome,
  IconCalendar,
  IconBuildingStore,
  IconUser,
  IconMenu2,
  IconTicket,
  IconX,
  IconChartBar,
  IconCreditCard,
  IconRocket,
  IconScan,
  IconSettings,
  IconTrendingUp,
  IconUsers,
  IconChevronRight,
  IconSparkles
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';

export const BottomNav = ({ currentView, setView }) => {
  const { currentUser } = useUser();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!currentUser) return null;

  const getNavItems = () => {
    switch (currentUser.role) {
      case 'admin':
      case 'super_admin':
        return [
          { id: 'dashboard', icon: IconLayoutDashboard, label: 'Dashboard' },
          { id: 'discovery', icon: IconBuildingStore, label: 'Terrains' },
          { id: 'scan', icon: IconScan, label: 'Scanner', isFloating: true },
          { id: 'gerants', icon: IconUsersGroup, label: 'Gérants' },
          { id: 'menu', icon: IconMenu2, label: 'Menu ☰' }
        ];
      case 'gerant':
        return [
          { id: 'gerant-dashboard', icon: IconLayoutDashboard, label: 'Dashboard' },
          { id: 'gerant-planning', icon: IconCalendar, label: 'Planning' },
          { id: 'scan', icon: IconScan, label: 'Scanner', isFloating: true },
          { id: 'gerant-terrain', icon: IconBuildingStore, label: 'Terrain' },
          { id: 'menu', icon: IconMenu2, label: 'Menu ☰' }
        ];
      case 'joueur':
      default:
        return [
          { id: 'joueur-home', icon: IconHome, label: 'Accueil' },
          { id: 'discovery', icon: IconBallFootball, label: 'Découverte' },
          { id: 'joueur-reservations', icon: IconCalendarEvent, label: 'Réservations', isFloating: true },
          { id: 'tickets', icon: IconTicket, label: 'Tickets' },
          { id: 'joueur-profile', icon: IconUser, label: 'Profil' }
        ];
    }
  };

  const getDrawerItems = () => {
    switch (currentUser.role) {
      case 'gerant':
        return [
          { id: 'gerant-dashboard', label: 'Dashboard', sub: 'Vue d\'ensemble & réservations du jour', icon: IconLayoutDashboard, color: 'bg-primary/10 text-primary' },
          { id: 'gerant-stats', label: 'Analyses & Stats', sub: 'Chiffre d\'affaires, taux d\'occupation & pic', icon: IconChartBar, color: 'bg-blue-50 text-blue-600' },
          { id: 'gerant-tarifs', label: 'Abonnement & Tarifs', sub: 'Offres Starter, Pro, Entreprise & factures', icon: IconCreditCard, color: 'bg-amber-50 text-amber-600' },
          { id: 'gerant-boost', label: 'Budget Visibilité', sub: 'Mise en avant sponsorisée sur Dakar', icon: IconRocket, color: 'bg-purple-50 text-purple-600' },
          { id: 'scan', label: 'Scanner un Ticket', sub: 'Validation QR Code à l\'entrée du terrain', icon: IconScan, color: 'bg-emerald-50 text-emerald-600' },
          { id: 'gerant-planning', label: 'Planning & Horaires', sub: 'Ouvrir, bloquer ou modifier des créneaux', icon: IconCalendar, color: 'bg-sky-50 text-sky-600' },
          { id: 'gerant-terrain', label: 'Mon Terrain', sub: 'Fiche technique, surface, équipements & photos', icon: IconBuildingStore, color: 'bg-teal-50 text-teal-600' },
          { id: 'gerant-parametres', label: 'Paramètres & Sécurité', sub: 'Informations du gérant, mot de passe & alertes', icon: IconSettings, color: 'bg-gray-100 text-gray-700' },
        ];
      case 'admin':
      case 'super_admin':
        return [
          { id: 'dashboard', label: 'Super Admin Dashboard', sub: 'Statistiques globales du réseau Dakar', icon: IconLayoutDashboard, color: 'bg-primary/10 text-primary' },
          { id: 'discovery', label: 'Terrains & Homologation', sub: 'Consulter le réseau de terrains', icon: IconBuildingStore, color: 'bg-teal-50 text-teal-600' },
          { id: 'gerant-tarifs', label: 'Gestion des Abonnements', sub: 'Suivi des souscriptions SaaS gérants', icon: IconCreditCard, color: 'bg-amber-50 text-amber-600' },
          { id: 'telemetrie', label: 'Télémétrie & Logs', sub: 'Activité en temps réel & logs système', icon: IconTrendingUp, color: 'bg-purple-50 text-purple-600' },
          { id: 'scan', label: 'Scanner un Ticket', sub: 'Validation QR Code joueur', icon: IconScan, color: 'bg-emerald-50 text-emerald-600' },
          { id: 'gerants', label: 'Gérants du Parc', sub: 'CRUD, suspensions & approbations', icon: IconUsersGroup, color: 'bg-blue-50 text-blue-600' },
          { id: 'utilisateurs', label: 'Liste Utilisateurs', sub: 'Joueurs, historiques & blocages', icon: IconUsers, color: 'bg-indigo-50 text-indigo-600' },
          { id: 'parametres', label: 'Paramètres Système', sub: 'Sécurité, commissions & notifications', icon: IconSettings, color: 'bg-gray-100 text-gray-700' },
        ];
      case 'joueur':
      default:
        return [
          { id: 'joueur-home', label: 'Accueil', sub: 'Prochain match & terrains à la une', icon: IconHome, color: 'bg-primary/10 text-primary' },
          { id: 'discovery', label: 'Découvrir les Terrains', sub: 'Carte interactive & réservation direct', icon: IconBallFootball, color: 'bg-blue-50 text-blue-600' },
          { id: 'joueur-reservations', label: 'Mes Réservations', sub: 'Historique et matchs à venir', icon: IconCalendarEvent, color: 'bg-teal-50 text-teal-600' },
          { id: 'tickets', label: 'Mes Tickets QR', sub: 'Tickets de terrain scannables', icon: IconTicket, color: 'bg-amber-50 text-amber-600' },
          { id: 'joueur-profile', label: 'Mon Profil', sub: 'Favoris, paramètres & notifications', icon: IconUser, color: 'bg-gray-100 text-gray-700' },
        ];
    }
  };

  const navItems = getNavItems();
  const drawerItems = getDrawerItems();

  const handleNavClick = (id) => {
    if (id === 'menu') {
      setIsMenuOpen(true);
    } else {
      setIsMenuOpen(false);
      setView(id);
    }
  };

  return (
    <>
      {/* Barre de navigation du bas (Bottom Navigation Bar) */}
      <div 
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 sm:px-4 flex items-center justify-around z-50 h-[64px] shadow-2xl backdrop-blur-lg bg-white/95"
        style={{
          paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
        }}
      >
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentView === item.id || (item.id === 'menu' && isMenuOpen);
          
          if (item.isFloating) {
            return (
              <div key={index} className="flex-1 flex justify-center items-center relative h-full pointer-events-none">
                <button 
                  onClick={() => handleNavClick(item.id)}
                  className={`pointer-events-auto -top-5 relative w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-xl border-[3px] border-white transition-all active:scale-90 cursor-pointer ${
                    isActive 
                      ? 'bg-primary-dark text-white shadow-primary-dark/40 ring-2 ring-primary-dark/20' 
                      : 'bg-primary text-white shadow-primary/30 hover:bg-primary-dark'
                  }`}
                  title={item.label}
                >
                  <Icon size={22} className="sm:w-6 sm:h-6" />
                </button>
              </div>
            );
          }

          return (
            <button 
              key={index}
              onClick={() => handleNavClick(item.id)}
              className={`flex-1 h-full min-w-0 px-1 relative flex flex-col justify-center items-center gap-0.5 transition-colors cursor-pointer ${isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
              <span className="text-[9.5px] sm:text-[10px] font-bold tracking-tight truncate w-full text-center">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full animate-ping"></span>
              )}
            </button>
          );
        })}
      </div>

      {/* Menu Tiroir Mobile (Mobile Navigation Sheet / Drawer) */}
      {isMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[9999] flex flex-col justify-end">
          {/* Overlay Flouté */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setIsMenuOpen(false)}
          ></div>

          {/* Tiroir Conteneur */}
          <div className="relative bg-white w-full rounded-t-[2.5rem] p-6 pb-12 space-y-6 z-10 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
            {/* Poignée de drag */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2"></div>

            {/* En-tête Tiroir */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-sm shadow-md shadow-primary/20 overflow-hidden shrink-0">
                  {currentUser.avatar && (currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('/')) ? (
                    <img src={currentUser.avatar} alt={currentUser.nom} className="w-full h-full object-cover" />
                  ) : (
                    currentUser.initiales || currentUser.nom?.substring(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-primary-dark">{currentUser.nom}</h3>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    {currentUser.role === 'admin' ? 'Super Admin' : currentUser.role === 'gerant' ? 'Gérant de Terrain' : 'Joueur'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="p-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors cursor-pointer"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Titre de section */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Toutes les fonctionnalités
              </span>
              <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                <IconSparkles size={14} /> PlaygroundSpot
              </span>
            </div>

            {/* Liste des modules */}
            <div className="grid grid-cols-1 gap-2.5">
              {drawerItems.map((item) => {
                const ItemIcon = item.icon;
                const isSelected = currentView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setIsMenuOpen(false);
                      setView(item.id);
                    }}
                    className={`w-full p-4 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary/5 border-primary text-primary-dark shadow-sm'
                        : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                        <ItemIcon size={20} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm font-display truncate">{item.label}</h4>
                        <p className="text-xs text-gray-400 font-medium truncate">{item.sub}</p>
                      </div>
                    </div>
                    <IconChevronRight size={18} className="text-gray-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
