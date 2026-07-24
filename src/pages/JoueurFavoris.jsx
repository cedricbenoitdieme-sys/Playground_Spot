import React, { useState, useEffect } from 'react';
import { 
  IconHeart, 
  IconMapPin, 
  IconStar, 
  IconBallFootball,
  IconLoader2
} from '@tabler/icons-react';
import { fetchTopTerrains } from '../services/terrains';
import { formatAmountAbbreviated } from '../services/stats';
import { TerrainImage } from '../components/TerrainImage';

export const JoueurFavoris = ({ setView, setSelectedTerrain }) => {
  const [favoriteTerrains, setFavoriteTerrains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // TODO: remplacer par une vraie table favoris quand elle existe
        const data = await fetchTopTerrains(2);
        setFavoriteTerrains(data.map((t, i) => ({
          ...t,
          bookings: [34, 28][i] || 20,
        })));
      } catch (err) {
        console.error('Erreur chargement favoris:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
      <div 
        className="space-y-1"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <h2 className="text-xl lg:text-2xl font-display font-bold text-primary-dark">Mes Terrains Favoris</h2>
        <p className="text-xs text-gray-500 font-medium">Tes complexes sportifs préférés à Dakar pour réserver plus rapidement.</p>
      </div>

      {favoriteTerrains.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {favoriteTerrains.map((terrain, index) => (
            <div 
              key={terrain.id} 
              onClick={() => {
                setSelectedTerrain(terrain);
                setView('terrain-detail');
              }}
              className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden group hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col md:flex-row cursor-pointer"
              style={{ 
                animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                animationDelay: `${index * 0.08 + 0.05}s`
              }}
            >
              <div className="h-40 md:h-auto md:w-48 relative overflow-hidden flex-shrink-0">
                <TerrainImage
                  terrainId={terrain.id}
                  fallbackUrl={terrain.image || terrain.image_url}
                  alt={terrain.name}
                  iconSize={24}
                  className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md p-1.5 rounded-full shadow-sm cursor-pointer hover:scale-110 text-red-500">
                  <IconHeart size={16} fill="currentColor" />
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20">Dakar</span>
                  <h4 className="font-bold text-sm text-primary-dark truncate mt-1">{terrain.name}</h4>
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
                    className="btn-primary py-2 px-4 rounded-xl text-xs font-bold transition-transform flex items-center gap-1"
                  >
                    <IconBallFootball size={14} /> Réserver
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-12 rounded-[2rem] text-center border border-black/5 max-w-md mx-auto space-y-4 shadow-subtle">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto">
            <IconHeart size={32} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-primary-dark text-base">Aucun favori pour l'instant</p>
            <p className="text-xs text-gray-400">Parcours la découverte pour ajouter des terrains en favoris.</p>
          </div>
          <button onClick={() => setView('discovery')} className="btn-primary py-2.5 px-6 rounded-xl text-xs font-bold cursor-pointer">Parcourir</button>
        </div>
      )}
    </div>
  );
};
