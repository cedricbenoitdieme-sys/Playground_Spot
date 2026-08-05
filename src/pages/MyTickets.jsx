import React, { useState, useMemo } from 'react';
import { CustomSelect } from '../components/CustomSelect';
import { 
  IconTicket, 
  IconMapPin, 
  IconCalendar, 
  IconClock, 
  IconChevronRight,
  IconSearch,
  IconSortAscending,
  IconSortDescending
} from '@tabler/icons-react';

import { TerrainImage } from '../components/TerrainImage';

export const MyTickets = ({ reservations, onViewDetail }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest', 'oldest', 'az', 'za'

  const activeTickets = useMemo(() => {
    let filtered = reservations.filter(r => r.status === 'À venir');
    
    // Search
    if (searchQuery.trim()) {
      filtered = filtered.filter(t => 
        t.terrain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.quartier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    return filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        // Convert dates like "15/05/2026" for proper sorting
        const dateA = new Date(a.date.split('/').reverse().join('-'));
        const dateB = new Date(b.date.split('/').reverse().join('-'));
        return dateB - dateA;
      } else if (sortOrder === 'oldest') {
        const dateA = new Date(a.date.split('/').reverse().join('-'));
        const dateB = new Date(b.date.split('/').reverse().join('-'));
        return dateA - dateB;
      } else if (sortOrder === 'az') {
        return a.terrain.localeCompare(b.terrain);
      } else if (sortOrder === 'za') {
        return b.terrain.localeCompare(a.terrain);
      }
      return 0;
    });
  }, [reservations, searchQuery, sortOrder]);

  return (
    <div className="flex-1 bg-background overflow-y-auto px-6 lg:px-8 py-8 pb-24 lg:pb-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 text-center lg:text-left flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary-dark mb-2">Mes Tickets</h1>
            <p className="text-gray-500 font-medium">Retrouvez ici tous vos accès pour vos prochains matchs.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            {/* Search */}
            <div className="bg-white border border-gray-100 rounded-full px-4 py-2 flex-1 shadow-sm flex items-center gap-2 focus-within:ring-2 ring-primary/20 transition-all">
              <IconSearch size={18} className="text-gray-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un ticket..." 
                className="bg-transparent border-none focus:outline-none text-sm w-full" 
              />
            </div>
            
            {/* Sort Toggle */}
            <div className="bg-white border border-gray-100 rounded-full px-4 py-2 shadow-sm text-sm font-bold text-gray-600 focus:outline-none cursor-pointer flex items-center min-w-[180px] min-h-[38px]">
              <CustomSelect
                value={sortOrder}
                onChange={(val) => setSortOrder(val)}
                options={[
                  { label: "Plus récents d'abord", value: "newest" },
                  { label: "Plus anciens d'abord", value: "oldest" },
                  { label: "A - Z", value: "az" },
                  { label: "Z - A", value: "za" }
                ]}
                theme="light"
              />
            </div>
          </div>
        </header>

        {activeTickets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {activeTickets.map((ticket) => (
              <button 
                key={ticket.id}
                onClick={() => onViewDetail(ticket)}
                className="relative bg-white rounded-[2.5rem] shadow-subtle border border-black/5 overflow-hidden flex flex-col group hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 text-left outline-none"
              >
                {/* Visual Ticket Header */}
                <div className="h-40 relative">
                  <TerrainImage 
                    terrainId={ticket.raw?.terrain_id || ticket.terrain_id} 
                    fallbackUrl={ticket.image} 
                    alt={ticket.terrain} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/90 via-primary-dark/40 to-transparent"></div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <span className="bg-secondary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-3 inline-block shadow-lg shadow-secondary/20">
                      Match Confirmé
                    </span>
                    <h3 className="text-white font-bold text-2xl font-display tracking-tight group-hover:translate-x-1 transition-transform">{ticket.terrain}</h3>
                    <p className="text-white/60 text-xs flex items-center gap-1 mt-1"><IconMapPin size={12} /> {ticket.quartier}</p>
                  </div>
                </div>

                {/* Perforation Effect */}
                <div className="relative h-6 flex items-center px-6">
                  <div className="absolute -left-3.5 w-7 h-7 bg-background rounded-full border border-black/5 shadow-inner"></div>
                  <div className="absolute -right-3.5 w-7 h-7 bg-background rounded-full border border-black/5 shadow-inner"></div>
                  <div className="w-full border-t-2 border-dashed border-gray-100"></div>
                </div>

                {/* Ticket Body */}
                <div className="p-8 pt-2 space-y-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</p>
                      <div className="flex items-center gap-2 text-primary-dark font-bold text-base">
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                          <IconCalendar size={18} />
                        </div>
                        {ticket.date}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Heure</p>
                      <div className="flex items-center gap-2 text-primary-dark font-bold text-base justify-end">
                        {ticket.slot}
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                          <IconClock size={18} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                    <div className="group-hover:translate-x-1 transition-transform">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Code Validation</p>
                      <p className="text-2xl font-display font-bold text-primary tracking-wider">{ticket.id}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 group-hover:rotate-12 transition-all">
                      <IconChevronRight size={24} />
                    </div>
                  </div>
                </div>
                
                {/* Decorative Elements - High Visibility */}
                <div className="absolute top-6 right-6 text-white/40 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20">
                  <IconTicket size={32} stroke={2} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 shadow-sm">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-100">
              <IconSearch size={48} className="text-gray-300" />
            </div>
            <h3 className="text-2xl font-bold text-primary-dark mb-2">Aucun ticket trouvé</h3>
            <p className="text-gray-400 max-w-xs mx-auto mb-10 font-medium">Modifiez votre recherche ou supprimez vos filtres pour voir plus de tickets.</p>
          </div>
        )}
      </div>
    </div>
  );
};
