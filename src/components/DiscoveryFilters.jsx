import React from 'react';
import { IconSearch, IconAdjustmentsHorizontal, IconCurrentLocation } from '@tabler/icons-react';

export const DiscoveryFilters = ({ viewMode, setViewMode, searchQuery, setSearchQuery, activeFilters, onToggleFilter, onNearby }) => {
  return (
    <div className="bg-white p-4 rounded-card shadow-subtle border border-black/5 space-y-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-4 items-center">
        {/* Search */}
        <div className="flex-1 w-full relative">
          <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom ou quartier (ex: Almadies, Five...)" 
            className="w-full bg-background border border-gray-100 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20 transition-all"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button className="flex-1 lg:flex-none btn-primary gap-2 h-11 px-4 text-sm whitespace-nowrap">
            <IconAdjustmentsHorizontal size={18} />
            Filtres
          </button>
          
          <button 
            onClick={onNearby}
            className="flex items-center justify-center w-11 h-11 bg-white border border-gray-100 rounded-full text-primary-dark hover:bg-gray-50 shadow-sm transition-all" title="Près de moi"
          >
            <IconCurrentLocation size={20} />
          </button>

          {/* View Toggle */}
          <div className="flex bg-background p-1 rounded-full border border-gray-100">
            <button 
              onClick={() => setViewMode('list')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Liste
            </button>
            <button 
              onClick={() => setViewMode('map')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'map' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Carte
            </button>
          </div>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {['Synthétique', 'Naturel', 'Béton', '5v5', '7v7', '11v11', 'Éclairage', 'Parking'].map((filter) => (
          <button 
            key={filter} 
            onClick={() => onToggleFilter(filter)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full border text-xs font-semibold transition-all ${
              activeFilters.includes(filter) 
                ? 'bg-primary border-primary text-white shadow-md' 
                : 'border-gray-100 text-gray-600 hover:border-primary/30 hover:text-primary hover:bg-primary/5'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
};
