import React from 'react';
import { 
  IconLayoutDashboard, 
  IconBallFootball, 
  IconTicket,
  IconCalendarEvent, 
  IconUsers, 
  IconUsersGroup, 
  IconSettings,
  IconLogout,
  IconUserShield,
  IconChartBar,
  IconHome,
  IconCalendar,
  IconBuildingStore,
  IconHeart,
  IconUser,
  IconScan,
  IconCreditCard,
  IconRocket
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { Avatar } from './Avatar';
import { signOut } from '../services/auth';

export const Sidebar = ({ currentView, setView }) => {
  const { currentUser, setCurrentUser } = useUser();

  if (!currentUser) return null;

  const handleLogout = async () => {
    try {
      await signOut();
      setCurrentUser(null);
      setView('landing');
    } catch (err) {
      console.error('Erreur déconnexion:', err.message);
    }
  };

  // Define navigation items dynamically per role
  const getNavItems = () => {
    switch (currentUser.role) {
      case 'admin':
      case 'super_admin':
        return [
          { id: 'landing', label: 'Site Vitrine', icon: IconHome },
          { id: 'dashboard', label: 'Espace Admin', icon: IconLayoutDashboard },
          { id: 'telemetrie', label: 'Télémétrie', icon: IconChartBar },
          { id: 'discovery', label: 'Découverte', icon: IconBallFootball },
          { id: 'reservations', label: 'Réservations', icon: IconCalendarEvent },
          { id: 'gerants', label: 'Gérants', icon: IconUsersGroup },
          { id: 'utilisateurs', label: 'Utilisateurs', icon: IconUsers },
          { id: 'parametres', label: 'Paramètres', icon: IconSettings },
          { id: 'scan', label: 'Scanner un ticket', icon: IconScan },
        ];
      case 'gerant':
        return [
          { id: 'landing', label: 'Site Vitrine', icon: IconHome },
          { id: 'gerant-dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
          { id: 'gerant-terrain', label: 'Mon Terrain', icon: IconBuildingStore },
          { id: 'gerant-planning', label: 'Planning', icon: IconCalendar },
          { id: 'gerant-reservations', label: 'Réservations', icon: IconCalendarEvent },
          { id: 'gerant-stats', label: 'Statistiques', icon: IconChartBar },
          { id: 'gerant-tarifs', label: 'Abonnement & Tarifs', icon: IconCreditCard },
          { id: 'gerant-boost', label: 'Budget Visibilité', icon: IconRocket },
          { id: 'gerant-parametres', label: 'Paramètres', icon: IconSettings },
          { id: 'scan', label: 'Scanner un ticket', icon: IconScan },
        ];
      case 'joueur':
      default:
        return [
          { id: 'landing', label: 'Site Vitrine', icon: IconHome },
          { id: 'joueur-home', label: 'Accueil', icon: IconLayoutDashboard },
          { id: 'discovery', label: 'Découverte', icon: IconBallFootball },
          { id: 'joueur-reservations', label: 'Mes Réservations', icon: IconCalendarEvent },
          { id: 'tickets', label: 'Mes Tickets', icon: IconTicket },
          { id: 'joueur-favoris', label: 'Mes Favoris', icon: IconHeart },
          { id: 'joueur-profile', label: 'Mon Profil', icon: IconUser },
        ];
    }
  };

  const navItems = getNavItems();

  // Détection dynamique de l'onglet actif (incluant les sous-vues)
  const isItemActive = (itemId) => {
    if (currentView === itemId) return true;
    
    // Vues filles de détails de réservations
    if (itemId === 'reservations' && currentView === 'reservation-detail' && ['admin', 'super_admin'].includes(currentUser.role)) return true;
    if (itemId === 'gerant-reservations' && currentView === 'reservation-detail' && currentUser.role === 'gerant') return true;
    if (itemId === 'joueur-reservations' && currentView === 'reservation-detail' && currentUser.role === 'joueur') return true;
    
    // Vues filles de terrain
    if (itemId === 'discovery' && ['terrain-detail', 'booking-flow'].includes(currentView)) return true;

    return false;
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-[#0F2318] h-screen fixed top-0 left-0 border-r border-white/5 z-40">
      {/* Logo & Switcher */}
      <div className="p-6 space-y-4">
        <div 
          onClick={() => setView('landing')}
          className="flex items-center gap-3 cursor-pointer hover:opacity-85 active:scale-95 transition-all w-fit"
          title="Retourner au Site Vitrine"
        >
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <IconBallFootball className="text-white" size={24} />
          </div>
          <span className="text-white font-display text-xl font-bold tracking-tight">
            Playground<span className="text-primary">Spot</span>
          </span>
        </div>

        {/* Rôle badge */}
        <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <span className="text-[9px] font-bold text-primary uppercase tracking-widest">
            {['admin', 'super_admin'].includes(currentUser.role) ? '🛡️ Super Administrateur' : currentUser.role === 'gerant' ? '🏟️ Gérant Terrain' : '⚽ Joueur'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-1.5 sidebar-scroll overflow-y-auto">
        {navItems.map((item) => {
          const active = isItemActive(item.id);

          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-left cursor-pointer border-l-4 ${
                active 
                  ? 'bg-primary/15 text-white border-primary font-bold shadow-xs' 
                  : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white font-medium'
              }`}
            >
              <item.icon 
                size={22} 
                className={active ? 'text-primary' : 'text-white/60 group-hover:text-white'} 
              />
              <span className={active ? 'font-bold text-white' : 'font-medium'}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Profile Indicator */}
      <div className="p-4 mt-auto border-t border-white/5 bg-black/10">
        <div 
          onClick={() => {
            if (['admin', 'super_admin'].includes(currentUser.role)) setView('parametres');
            else if (currentUser.role === 'gerant') setView('gerant-parametres');
            else setView('joueur-profile');
          }}
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-all active:scale-[0.97] group/profile"
        >
          <div className="relative shrink-0">
            <Avatar user={currentUser} className="w-10 h-10 rounded-full border-2 border-primary/20 group-hover/profile:border-primary transition-all duration-300" textSize="text-sm" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-status-confirmed border-2 border-[#0F2318] rounded-full"></div>
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-white text-sm font-semibold truncate group-hover/profile:text-primary transition-colors">{currentUser.nom}</p>
            <div className="flex items-center gap-1 text-[10px] text-primary font-bold uppercase tracking-wider">
              <IconUserShield size={10} />
              {['admin', 'super_admin'].includes(currentUser.role) ? 'Super Admin' : currentUser.role === 'gerant' ? 'Gérant Terrain' : 'Joueur'}
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleLogout();
            }}
            className="text-white/40 hover:text-red-400 hover:bg-white/10 p-1 rounded transition-all cursor-pointer"
          >
            <IconLogout size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
};
