import React, { useState, useEffect, useRef } from 'react';
import { IconSearch, IconAdjustmentsHorizontal, IconCurrentLocation, IconX } from '@tabler/icons-react';

const FILTER_TOOLTIPS = {
  'Synthétique': 'Type de surface du terrain (gazon synthétique)',
  'Naturel': 'Terrain en gazon naturel',
  'Béton': 'Terrain à surface bétonnée (futsal)',
  '5v5': 'Format de match à 5 contre 5 (10 joueurs)',
  '7v7': 'Format de match à 7 contre 7 (14 joueurs)',
  '11v11': 'Format de match officiel à 11 contre 11',
  'Éclairage': 'Terrain équipé pour jouer en soirée ou de nuit',
  'Parking': 'Présence d\'un parking à proximité du terrain',
};

export const DiscoveryFilters = ({ viewMode, setViewMode, searchQuery, setSearchQuery, activeFilters, onToggleFilter, onNearby }) => {
  const [activeTooltip, setActiveTooltip] = useState(null);
  const filterContainerRef = useRef(null);
  const timerRef = useRef(null);

  // Tap outside to dismiss tooltip on mobile & desktop
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleMouseEnter = (filter) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActiveTooltip(filter);
    }, 200);
  };

  const handleMouseLeave = (filter) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveTooltip(prev => (prev === filter ? null : prev));
  };

  const handleChipClick = (filter) => {
    onToggleFilter(filter);
    // Option A: Le clic/tap sélectionne le filtre ET affiche l'information contextuelle
    setActiveTooltip(filter);
  };

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
            className="flex items-center justify-center w-11 h-11 bg-white border border-gray-100 rounded-full text-primary-dark hover:bg-gray-50 shadow-sm transition-all cursor-pointer" title="Près de moi"
          >
            <IconCurrentLocation size={20} />
          </button>

          {/* View Toggle */}
          <div className="flex bg-background p-1 rounded-full border border-gray-100">
            <button 
              onClick={() => setViewMode('list')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Liste
            </button>
            <button 
              onClick={() => setViewMode('map')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${viewMode === 'map' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Carte
            </button>
          </div>
        </div>
      </div>

      {/* Quick Filter Chips avec Tooltips contextuels d'information */}
      <div 
        ref={filterContainerRef}
        className="flex items-center gap-2 overflow-x-auto py-1.5 no-scrollbar relative"
      >
        {['Synthétique', 'Naturel', 'Béton', '5v5', '7v7', '11v11', 'Éclairage', 'Parking'].map((filter) => {
          const isSelected = activeFilters.includes(filter);
          const isTooltipOpen = activeTooltip === filter;
          const tooltipText = FILTER_TOOLTIPS[filter];

          return (
            <div 
              key={filter} 
              className="relative inline-block shrink-0"
              onMouseEnter={() => handleMouseEnter(filter)}
              onMouseLeave={() => handleMouseLeave(filter)}
            >
              <button 
                type="button"
                onClick={() => handleChipClick(filter)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-primary border-primary text-white shadow-md' 
                    : 'border-gray-100 text-gray-600 hover:border-primary/30 hover:text-primary hover:bg-primary/5'
                }`}
              >
                {filter}
              </button>

              {/* Tooltip d'information contextuelle */}
              {isTooltipOpen && tooltipText && (
                <div 
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-[#0F2318] text-white p-2.5 rounded-xl shadow-2xl border border-white/10 text-[11px] font-medium leading-tight z-[60] animate-in fade-in zoom-in-95 duration-150 flex items-start justify-between gap-1.5 pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>{tooltipText}</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTooltip(null);
                    }}
                    className="text-white/50 hover:text-white p-0.5 rounded transition-colors shrink-0 cursor-pointer"
                    title="Fermer l'information"
                  >
                    <IconX size={13} />
                  </button>

                  {/* Flèche indicatrice orientée vers le haut */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#0F2318]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
