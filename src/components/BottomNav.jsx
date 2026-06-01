import React from 'react';
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
  IconTicket
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';

export const BottomNav = ({ currentView, setView }) => {
  const { currentUser } = useUser();

  const getNavItems = () => {
    switch (currentUser.role) {
      case 'admin':
        return [
          { id: 'dashboard', icon: IconLayoutDashboard, label: 'Dashboard' },
          { id: 'discovery', icon: IconBallFootball, label: 'Terrains' },
          { id: 'reservations', icon: IconCalendarEvent, label: 'Réservations', isFloating: true },
          { id: 'gerants', icon: IconUsersGroup, label: 'Gérants' },
          { id: 'menu', icon: IconMenu2, label: 'Menu' }
        ];
      case 'gerant':
        return [
          { id: 'gerant-dashboard', icon: IconLayoutDashboard, label: 'Dashboard' },
          { id: 'gerant-planning', icon: IconCalendar, label: 'Planning' },
          { id: 'gerant-reservations', icon: IconCalendarEvent, label: 'Réservations', isFloating: true },
          { id: 'gerant-stats', icon: IconBuildingStore, label: 'Terrain' },
          { id: 'gerant-parametres', icon: IconMenu2, label: 'Menu' }
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

  const navItems = getNavItems();

  return (
    <div 
      className="lg:hidden fixed left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-around z-50 h-[60px] shadow-lg"
      style={{
        bottom: 'env(safe-area-inset-bottom)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {navItems.map((item, index) => {
        const Icon = item.icon;
        const isActive = currentView === item.id || (item.id === 'menu' && ['gerants', 'utilisateurs', 'parametres'].includes(currentView));
        
        if (item.isFloating) {
          return (
            <div key={index} className="flex-1 flex justify-center items-center relative -top-4 h-full">
              <button 
                onClick={() => setView(item.id)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-background transition-transform active:scale-95 cursor-pointer ${
                  isActive 
                    ? 'bg-primary-dark text-white shadow-primary-dark/30' 
                    : 'bg-primary text-white shadow-primary/30'
                }`}
              >
                <Icon size={24} />
              </button>
            </div>
          );
        }

        return (
          <button 
            key={index}
            onClick={() => setView(item.id)}
            className={`flex-1 h-full relative flex flex-col justify-center items-center gap-1 transition-colors cursor-pointer ${isActive ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            {isActive && (
              <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full animate-ping"></span>
            )}
          </button>
        );
      })}
    </div>
  );
};
