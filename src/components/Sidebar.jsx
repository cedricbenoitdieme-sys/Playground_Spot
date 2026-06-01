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
  IconUser
} from '@tabler/icons-react';
import { useUser, MOCK_USERS } from '../context/UserContext';

export const Sidebar = ({ currentView, setView }) => {
  const { currentUser, setCurrentUser } = useUser();

  const handleRoleChange = (e) => {
    const roleKey = e.target.value;
    setCurrentUser(MOCK_USERS[roleKey]);
    
    // Automatically redirect to a valid role-appropriate starting view
    if (roleKey === 'admin') {
      setView('dashboard');
    } else if (roleKey === 'gerant') {
      setView('gerant-dashboard');
    } else {
      setView('joueur-home');
    }
  };

  // Define navigation items dynamically per role
  const getNavItems = () => {
    switch (currentUser.role) {
      case 'admin':
        return [
          { id: 'landing', label: 'Site Vitrine', icon: IconHome },
          { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
          { id: 'discovery', label: 'Découverte', icon: IconBallFootball },
          { id: 'reservations', label: 'Réservations', icon: IconCalendarEvent },
          { id: 'gerants', label: 'Gérants', icon: IconUsersGroup },
          { id: 'utilisateurs', label: 'Utilisateurs', icon: IconUsers },
          { id: 'parametres', label: 'Paramètres', icon: IconSettings },
        ];
      case 'gerant':
        return [
          { id: 'landing', label: 'Site Vitrine', icon: IconHome },
          { id: 'gerant-dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
          { id: 'gerant-terrain', label: 'Mon Terrain', icon: IconBuildingStore },
          { id: 'gerant-planning', label: 'Planning', icon: IconCalendar },
          { id: 'gerant-reservations', label: 'Réservations', icon: IconCalendarEvent },
          { id: 'gerant-stats', label: 'Statistiques', icon: IconChartBar },
          { id: 'gerant-parametres', label: 'Paramètres', icon: IconSettings },
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

        {/* Development Role Switcher */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-2">
          <label className="text-[9px] font-bold text-primary uppercase tracking-widest block mb-1">Simulateur Rôle (Dev)</label>
          <select 
            value={currentUser.role}
            onChange={handleRoleChange}
            className="w-full bg-[#0F2318] text-white border-none rounded-lg text-xs font-semibold px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="admin">Administrateur</option>
            <option value="gerant">Gérant Terrain</option>
            <option value="joueur">Joueur</option>
          </select>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-2 sidebar-scroll overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-left cursor-pointer ${
              currentView === item.id 
                ? 'bg-primary/10 text-white border-l-4 border-primary' 
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <item.icon 
              size={22} 
              className={currentView === item.id ? 'text-primary' : 'text-white/60 group-hover:text-white'} 
            />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Profile Indicator */}
      <div className="p-4 mt-auto border-t border-white/5 bg-black/10">
        <div 
          onClick={() => {
            if (currentUser.role === 'admin') setView('parametres');
            else if (currentUser.role === 'gerant') setView('gerant-parametres');
            else setView('joueur-profile');
          }}
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-all active:scale-[0.97] group/profile"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary text-white font-black text-sm flex items-center justify-center border-2 border-primary/20 group-hover/profile:border-primary transition-all duration-300">
              {currentUser.avatar}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-status-confirmed border-2 border-[#0F2318] rounded-full"></div>
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-white text-sm font-semibold truncate group-hover/profile:text-primary transition-colors">{currentUser.nom}</p>
            <div className="flex items-center gap-1 text-[10px] text-primary font-bold uppercase tracking-wider">
              <IconUserShield size={10} />
              {currentUser.role === 'admin' ? 'Admin Platform' : currentUser.role === 'gerant' ? 'Gérant Terrain' : 'Joueur'}
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setCurrentUser(null);
              setView('landing');
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
