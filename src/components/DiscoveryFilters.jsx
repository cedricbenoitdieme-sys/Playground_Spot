import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconSearch, IconAdjustmentsHorizontal, IconCurrentLocation, IconX } from '@tabler/icons-react';

const FILTER_TOOLTIPS = {
  'Synthétique': 'Type de surface du terrain (gazon synthétique)',
  'Naturel': 'Terrain en gazon naturel',
  'Béton': 'Terrain à surface bétonnée',
  '5v5': 'Format de match (5 joueurs par équipe)',
  '7v7': 'Format de match (7 joueurs par équipe)',
  '11v11': 'Format de match (11 joueurs par équipe)',
  'Éclairage': 'Terrain équipé pour jouer en soirée/nuit',
  'Parking': 'Présence d\'un parking à proximité du terrain',
};

export const DiscoveryFilters = ({ viewMode, setViewMode, searchQuery, setSearchQuery, activeFilters, onToggleFilter, onNearby }) => {
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [pressingFilter, setPressingFilter] = useState(null);
  const filterContainerRef = useRef(null);
  const buttonRefs = useRef({});
  const hoverTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const isLongPressRef = useRef(false);

  const calculateTooltipPosition = (filterName) => {
    const btn = buttonRefs.current[filterName];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const tooltipWidth = 224; // w-56 = 14rem = 224px
    let left = rect.left + rect.width / 2;

    // Clamp horizontal pour les écrans étroits
    const padding = 12;
    const minLeft = tooltipWidth / 2 + padding;
    const maxLeft = window.innerWidth - tooltipWidth / 2 - padding;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    setTooltipPos({
      top: rect.bottom + 8,
      left: left,
      arrowLeft: rect.left + rect.width / 2 - (left - tooltipWidth / 2),
    });
  };

  const openTooltip = (filterName) => {
    calculateTooltipPosition(filterName);
    setActiveTooltip(filterName);
  };

  // Fermer le tooltip en tapant n'importe où en dehors ou lors du scroll
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterContainerRef.current && !filterContainerRef.current.contains(e.target)) {
        setActiveTooltip(null);
      }
    };
    const handleScroll = () => {
      if (activeTooltip) {
        calculateTooltipPosition(activeTooltip);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeTooltip]);

  // ── Gestion du survol desktop (hover 250ms) ──
  const handleMouseEnter = (filter) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      openTooltip(filter);
    }, 250);
  };

  const handleMouseLeave = (filter) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setActiveTooltip(prev => (prev === filter ? null : prev));
  };

  // ── Gestion du tactile mobile (Appui long 600ms) ──
  const handleTouchStart = (filter) => {
    isLongPressRef.current = false;
    setPressingFilter(filter);

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      openTooltip(filter);
      setPressingFilter(null);
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressingFilter(null);
  };

  const handleClick = (filter) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    onToggleFilter(filter);
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

      {/* Quick Filter Chips avec Tooltips d'information contextuelle */}
      <div 
        ref={filterContainerRef}
        className="flex items-center gap-2 overflow-x-auto py-1.5 no-scrollbar relative"
      >
        {['Synthétique', 'Naturel', 'Béton', '5v5', '7v7', '11v11', 'Éclairage', 'Parking'].map((filter) => {
          const isSelected = activeFilters.includes(filter);
          const isPressing = pressingFilter === filter;

          return (
            <div 
              key={filter} 
              className="relative inline-block shrink-0"
              onMouseEnter={() => handleMouseEnter(filter)}
              onMouseLeave={() => handleMouseLeave(filter)}
            >
              <button 
                ref={(el) => (buttonRefs.current[filter] = el)}
                type="button"
                onClick={() => handleClick(filter)}
                onTouchStart={() => handleTouchStart(filter)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className={`whitespace-nowrap relative overflow-hidden px-4 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer select-none ${
                  isSelected 
                    ? 'bg-primary border-primary text-white shadow-md' 
                    : 'border-gray-100 text-gray-600 hover:border-primary/30 hover:text-primary hover:bg-primary/5'
                }`}
              >
                {/* Feedback visuel lors de l'appui long (remplissage progressif 600ms) */}
                {isPressing && (
                  <span 
                    className="absolute inset-0 bg-primary/30 pointer-events-none rounded-full animate-pulse"
                    style={{
                      animationDuration: '600ms',
                    }}
                  />
                )}

                <span className="relative z-10">{filter}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Box d'info Tooltip rendu via React Portal dans document.body */}
      {activeTooltip && FILTER_TOOLTIPS[activeTooltip] && tooltipPos && createPortal(
        <div 
          className="fixed w-56 bg-[#0F2318] text-white p-2.5 rounded-xl shadow-2xl border border-white/10 text-[11px] font-medium leading-tight z-[9999] animate-in fade-in zoom-in-95 duration-150 flex items-start justify-between gap-2 pointer-events-auto"
          style={{
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            transform: 'translateX(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span>{FILTER_TOOLTIPS[activeTooltip]}</span>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTooltip(null);
            }}
            className="text-white/50 hover:text-white p-0.5 rounded transition-colors shrink-0 cursor-pointer"
            title="Fermer"
          >
            <IconX size={13} />
          </button>

          {/* Flèche indicatrice orientée vers le haut */}
          <div 
            className="absolute bottom-full border-4 border-transparent border-b-[#0F2318]"
            style={{
              left: `${tooltipPos.arrowLeft}px`,
              transform: 'translateX(-50%)',
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};
