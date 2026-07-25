import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { TerrainImage } from './TerrainImage';
import { formatAmountAbbreviated } from '../services/stats';
import { IconTrophy, IconChevronRight, IconX, IconTrendingUp, IconUsers, IconLoader2 } from '@tabler/icons-react';

export const TopTerrains = () => {
  const [terrains, setTerrains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerrain, setSelectedTerrain] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('get_terrains_populaires', { p_limit: 3 });
        if (error) throw error;

        const list = data || [];
        setTerrains(list.map((t) => {
          const count = t.reservations_recentes || 0;
          return {
            ...t,
            name: t.nom,
            bookings: count,
            revenue: formatAmountAbbreviated((t.price || 15000) * count),
          };
        }));
      } catch (err) {
        console.error('Erreur chargement top terrains:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-gray-400 gap-2">
        <IconLoader2 size={16} className="animate-spin" />
        <span className="text-xs">Chargement...</span>
      </div>
    );
  }

  return (
    <>
      {terrains.map((terrain, index) => (
        <button 
          key={terrain.id} 
          onClick={() => setSelectedTerrain(terrain)}
          className="bg-background p-3 rounded-card border border-black/5 flex items-center gap-3 group hover:border-primary/20 hover:bg-white hover:shadow-md transition-all text-left w-full cursor-pointer"
          style={{ 
            animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
            animationDelay: `${index * 0.08}s`
          }}
        >
          <div className="relative flex-shrink-0">
            <TerrainImage 
              terrainId={terrain.id}
              fallbackUrl={terrain.image || terrain.image_url}
              alt={terrain.name || terrain.nom} 
              className="w-12 h-12 rounded-lg object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all"
              iconSize={20}
            />
            <div className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-secondary text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm border border-white">
              {index + 1}
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-primary-dark truncate text-xs">{terrain.name || terrain.nom}</h4>
              <IconChevronRight size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] text-gray-500 font-medium">{terrain.bookings} bookings</span>
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] font-bold text-primary">{terrain.revenue}</span>
                <IconTrophy size={10} className="text-secondary" />
              </div>
            </div>
          </div>
        </button>
      ))}

      {/* Modal Performance Terrain */}
      {selectedTerrain && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" onClick={() => setSelectedTerrain(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar z-10">
            <div className="h-32 relative">
               <TerrainImage terrainId={selectedTerrain.id} fallbackUrl={selectedTerrain.image || selectedTerrain.image_url} alt={selectedTerrain.name || selectedTerrain.nom} iconSize={28} className="w-full h-full" />
               <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/90 to-transparent"></div>
               <button onClick={() => setSelectedTerrain(null)} className="absolute top-4 right-4 text-white/50 hover:text-white bg-black/20 p-2 rounded-full backdrop-blur-md cursor-pointer">
                 <IconX size={20} />
               </button>
               <h3 className="absolute bottom-4 left-6 text-white font-bold text-xl">{selectedTerrain.name || selectedTerrain.nom}</h3>
            </div>
            <div className="p-6 space-y-6">
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                   <div className="flex items-center gap-2 text-gray-500 mb-1">
                     <IconTrendingUp size={16} className="text-primary" />
                     <p className="text-[10px] font-bold uppercase tracking-widest">Revenus</p>
                   </div>
                   <p className="text-lg font-bold text-primary-dark">{selectedTerrain.revenue}</p>
                 </div>
                 <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                   <div className="flex items-center gap-2 text-gray-500 mb-1">
                     <IconUsers size={16} className="text-primary" />
                     <p className="text-[10px] font-bold uppercase tracking-widest">Réservations</p>
                   </div>
                   <p className="text-lg font-bold text-primary-dark">{selectedTerrain.bookings}</p>
                 </div>
               </div>
               
               <div>
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Taux de remplissage (Est.)</p>
                 <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                   <div className="h-full bg-secondary w-[85%] rounded-full"></div>
                 </div>
                 <p className="text-right text-xs font-bold text-primary-dark mt-1">85%</p>
               </div>

               <button onClick={() => setSelectedTerrain(null)} className="w-full btn-primary h-12">Fermer</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
