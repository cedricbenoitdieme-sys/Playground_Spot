import React, { useState, useEffect } from 'react';
import { DiscoveryFilters } from '../components/DiscoveryFilters';
import { TerrainCard } from '../components/TerrainCard';
import { MapDiscovery } from '../components/MapDiscovery';
import { fetchTerrains } from '../services/terrains';
import { IconCheck, IconLoader2 } from '@tabler/icons-react';

export const Discovery = ({ setView, setSelectedTerrain }) => {
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);
  const [toast, setToast] = useState(null);
  const [terrains, setTerrains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchTerrains();
        setTerrains(data);
      } catch (err) {
        console.error('Erreur chargement terrains:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredTerrains = terrains.filter(terrain => {
    const matchesSearch = (terrain.name || terrain.nom || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (terrain.quartier || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeFilters.length === 0) return matchesSearch;

    const matchesFilters = activeFilters.every(f => 
      terrain.surface === f || 
      terrain.size === f || 
      (terrain.amenities || []).includes(f)
    );
    
    return matchesSearch && matchesFilters;
  });


  const handleToggleFilter = (filter) => {
    setActiveFilters(prev => {
      if (isMultiSelect) {
        if (prev.includes(filter)) {
          return prev.filter(f => f !== filter);
        }
        if (prev.length >= 4) {
          showToast("Maximum 4 filtres simultanés.");
          return prev;
        }
        return [...prev, filter];
      } else {
        // Single select mode
        return prev.includes(filter) ? [] : [filter];
      }
    });
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleNearby = () => {
    showToast("Recherche de votre position...");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          showToast(`Terrains proches de vous trouvés.`);
        },
        (error) => {
          showToast("Erreur de géolocalisation.");
        }
      );
    } else {
      showToast("Géolocalisation non supportée.");
    }
  };

  return (
    <div className="flex-1 space-y-6 pb-12 overflow-y-auto px-6 lg:px-8 py-6 relative">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl text-primary-dark tracking-tight">Découverte des terrains</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Trouvez le meilleur terrain pour votre prochain match à Dakar.
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-400">
            <span className="text-primary">{filteredTerrains.length}</span> terrains trouvés
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isMultiSelect} 
                onChange={(e) => {
                  setIsMultiSelect(e.target.checked);
                  if (!e.target.checked && activeFilters.length > 1) {
                    setActiveFilters([activeFilters[0]]);
                  }
                }}
                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
              />
              Sélection multiple (max 4)
            </label>
          </div>
        </div>
      </div>

      {/* Filters & View Toggle */}
      <DiscoveryFilters 
        viewMode={viewMode} 
        setViewMode={setViewMode} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeFilters={activeFilters}
        onToggleFilter={handleToggleFilter}
        onNearby={handleNearby}
      />

      {/* Content Area */}
      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filteredTerrains.slice(0, visibleCount).map((terrain) => (
            <div key={terrain.id} onClick={() => {
              setSelectedTerrain(terrain);
              setView('terrain-detail');
            }}>
              <TerrainCard terrain={terrain} />
            </div>
          ))}
        </div>
      ) : (
        <MapDiscovery terrains={filteredTerrains} onSelect={(t) => {
          setSelectedTerrain(t);
          setView('terrain-detail');
        }} />
      )}
      
      {/* Load More (for list mode) */}
      {viewMode === 'list' && filteredTerrains.length > visibleCount && (
        <div className="flex justify-center mt-12">
          <button 
            onClick={() => setVisibleCount(prev => prev + 4)}
            className="px-8 py-3 rounded-full border-2 border-gray-200 text-gray-500 font-bold hover:border-primary/30 hover:text-primary transition-all active:scale-95"
          >
            Charger plus de terrains
          </button>
        </div>
      )}

      {/* Simple Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};
