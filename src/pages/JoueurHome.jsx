import React, { useState } from 'react';
import { 
  IconSearch, 
  IconBallFootball, 
  IconTicket, 
  IconTrendingUp, 
  IconMapPin, 
  IconHeart, 
  IconStar, 
  IconCalendar,
  IconArrowRight
} from '@tabler/icons-react';
import { TOP_TERRAINS, formatAmountAbbreviated } from '../data/mockData';
import { useUser } from '../context/UserContext';

export const JoueurHome = ({ setView, setSelectedTerrain }) => {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');

  const featuredTerrains = TOP_TERRAINS.slice(0, 3);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setView('discovery');
  };

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto overflow-x-hidden px-6 lg:px-8 py-6">
      {/* Welcome & Search Banner */}
      <div 
        className="relative bg-[#0F2318] text-white p-6 md:p-8 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl space-y-6"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">Joueur VIP 🥇</span>
          <h2 className="text-2xl md:text-3xl font-display font-bold leading-tight">
            Trouve ton terrain <br />
            & réserve à Dakar
          </h2>
          <p className="text-xs text-white/50">Rejoins plus de 5000 joueurs actifs sur la plateforme.</p>
        </div>

        {/* Search button redirecting to discovery */}
        <button 
          onClick={() => setView('discovery')}
          className="w-full max-w-md bg-primary hover:bg-primary-dark text-white font-bold h-14 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all duration-300 group cursor-pointer"
        >
          <IconSearch size={20} className="group-hover:rotate-12 transition-transform" />
          <span>Chercher mon terrain 🔍</span>
        </button>
      </div>

      {/* Promos slider */}
      <div 
        className="bg-gradient-to-r from-secondary/15 to-primary/5 border border-secondary/20 p-5 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ animation: 'slideUp 0.4s 0.05s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="space-y-1 text-center sm:text-left">
          <span className="text-[9px] font-bold text-secondary uppercase tracking-widest bg-secondary/10 px-2 py-0.5 rounded-full">Offre Flash</span>
          <h3 className="font-bold text-primary-dark text-sm">Promotion Ramadan : -20% sur les créneaux du matin !</h3>
          <p className="text-[10px] text-gray-500 font-semibold">Valable sur tous les terrains de Dakar de 08:00 à 12:00.</p>
        </div>
        <button onClick={() => setView('discovery')} className="bg-[#0F2318] text-white hover:bg-primary py-2.5 px-5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap flex items-center gap-2">
          Réserver maintenant <IconArrowRight size={14} />
        </button>
      </div>

      {/* Recommended Terrains horizontal cards grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Terrains Recommandés</h3>
          <button onClick={() => setView('discovery')} className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer">
            Voir tout <IconArrowRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredTerrains.map((terrain, index) => (
            <div 
              key={terrain.id} 
              onClick={() => {
                setSelectedTerrain(terrain);
                setView('terrain-detail');
              }}
              className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden group hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col cursor-pointer"
              style={{ 
                animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                animationDelay: `${index * 0.08 + 0.1}s`
              }}
            >
              <div className="h-36 relative overflow-hidden">
                <img 
                  src={terrain.image} 
                  alt={terrain.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md p-1.5 rounded-full shadow-sm cursor-pointer hover:bg-white hover:scale-110 active:scale-90 transition-all text-red-500">
                  <IconHeart size={16} fill="currentColor" />
                </div>
                <div className="absolute bottom-3 left-3 bg-primary-dark/80 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-bold text-white flex items-center gap-0.5">
                  <IconMapPin size={10} className="text-primary" /> Dakar
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-primary-dark truncate">{terrain.name}</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 text-secondary">
                      <IconStar size={12} fill="currentColor" />
                      <span className="text-[10px] font-bold text-primary-dark">4.9</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-semibold">• {terrain.bookings} réservations</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">À partir de</p>
                    <p className="font-bold text-xs text-primary">{formatAmountAbbreviated(terrain.price)} FCFA/h</p>
                  </div>
                  <button 
                    className="btn-primary py-2 px-3 rounded-lg text-[10px] font-bold transition-transform"
                  >
                    Réserver
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prochains Matchs Active Tickets widget */}
      <div 
        className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-4"
        style={{ animation: 'slideUp 0.4s 0.25s cubic-bezier(.22,1,.36,1) both' }}
      >
        <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Mon Prochain Match</h3>
        
        <div 
          onClick={() => setView('tickets')}
          className="flex flex-col md:flex-row items-center justify-between p-4 bg-gray-50 hover:bg-primary/5 rounded-2xl border border-gray-100 hover:border-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer gap-4 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
              <IconTicket size={24} />
            </div>
            <div>
              <p className="font-bold text-sm text-primary-dark">Match amical — City Sport</p>
              <p className="text-xs text-gray-400 font-semibold flex items-center gap-1 mt-0.5"><IconCalendar size={12} /> Vendredi 22 Mai • 18:00</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400 font-semibold">Statut Ticket</p>
              <span className="text-[10px] font-bold bg-green-50 text-green-500 border border-green-200 px-2 py-0.5 rounded-full">Confirmé</span>
            </div>
            <button className="bg-[#0F2318] text-white hover:bg-primary py-2 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer">
              Voir Billet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
