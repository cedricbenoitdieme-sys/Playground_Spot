import React, { useState, useRef, useEffect } from 'react';
import { IconChevronDown, IconCheck } from '@tabler/icons-react';

/**
 * CustomSelect — Composant Select Personnalisé Premium (PlaygroundSpot)
 * Remplace tous les <select> HTML natifs pour une cohérence visuelle 100% sur mobile & desktop.
 * - Animation fluide d'ouverture / fermeture
 * - Surbrillance aux couleurs du Vert Terrain (pas le bleu OS natif)
 * - Navigation clavier complète (Flèches, Entrée, Échap, Espace)
 * - Détection des clics extérieurs
 */
export const CustomSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Sélectionner...',
  disabled = false,
  className = '',
  icon: LeftIcon = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);

  // Normaliser les options : accept à la fois ['Option 1', 'Option 2'] et [{ value, label }]
  const normalizedOptions = options.map(opt => {
    if (typeof opt === 'object' && opt !== null) {
      return { value: opt.value, label: opt.label || opt.value };
    }
    return { value: opt, label: opt };
  });

  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value));

  // Fermeture automatique au clic en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Synchroniser l'index mis en surbrillance clavier avec la valeur courante à l'ouverture
  useEffect(() => {
    if (isOpen) {
      const idx = normalizedOptions.findIndex(opt => String(opt.value) === String(value));
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, value]);

  const handleSelect = (optionValue) => {
    if (disabled) return;
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < normalizedOptions.length) {
        handleSelect(normalizedOptions[highlightedIndex].value);
      } else {
        setIsOpen(prev => !prev);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev + 1) % normalizedOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev - 1 + normalizedOptions.length) % normalizedOptions.length);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left font-sans select-none ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Bouton Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        disabled={disabled}
        className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer outline-none focus:ring-2 ring-primary/20 ${
          isOpen
            ? 'border-primary ring-2 bg-white text-primary-dark shadow-sm'
            : 'border-gray-200 text-gray-800 hover:bg-gray-100/70 hover:border-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {LeftIcon && <LeftIcon size={18} className="text-gray-400 shrink-0" />}
          <span className="truncate block font-medium">
            {selectedOption ? selectedOption.label : <span className="text-gray-400">{placeholder}</span>}
          </span>
        </div>
        <IconChevronDown
          size={16}
          className={`text-gray-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
        />
      </button>

      {/* Menu Déroulant Options */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[200] mt-1.5 bg-white border border-gray-100 rounded-2xl shadow-2xl py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto no-scrollbar">
          {normalizedOptions.length === 0 ? (
            <div className="px-4 py-2.5 text-xs text-gray-400 font-medium text-center">
              Aucune option disponible
            </div>
          ) : (
            normalizedOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : isHighlighted
                      ? 'bg-gray-50 text-primary-dark'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate pr-2">{opt.label}</span>
                  {isSelected && <IconCheck size={16} className="text-primary shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
