import React, { useState } from 'react';
import { IconCalendar } from '@tabler/icons-react';

export const PRESET_OPTIONS = [
  { key: '24h', label: '24h' },
  { key: '48h', label: '48h' },
  { key: '3d', label: '3 jours' },
  { key: '1w', label: '1 sem.' },
  { key: '2w', label: '2 sem.' },
  { key: '1m', label: '1 mois' },
  { key: '3m', label: '3 mois' },
  { key: '1y', label: '1 an' },
  { key: 'all', label: 'Depuis toujours' },
];

export const PeriodSelector = ({ value, onChange, className = '' }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const currentMode = typeof value === 'object' && value !== null ? (value.mode || 'preset') : 'preset';
  const currentPreset = typeof value === 'object' && value !== null ? (value.preset || '1m') : (typeof value === 'string' ? (value === 'week' ? '1w' : value === 'quarter' ? '3m' : value === 'month' ? '1m' : '1m') : '1m');
  
  const startDate = (typeof value === 'object' && value?.startDate) || defaultStart;
  const endDate = (typeof value === 'object' && value?.endDate) || todayStr;

  const handleSelectPreset = (presetKey) => {
    onChange({ mode: 'preset', preset: presetKey });
  };

  const handleCustomToggle = () => {
    onChange({ mode: 'custom', startDate, endDate });
  };

  const handleDateChange = (field, val) => {
    const nextStart = field === 'startDate' ? val : startDate;
    const nextEnd = field === 'endDate' ? val : endDate;
    onChange({ mode: 'custom', startDate: nextStart, endDate: nextEnd });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Barre de boutons préréglages */}
      <div className="flex bg-gray-100/90 p-1 rounded-2xl border border-gray-200/80 overflow-x-auto max-w-full no-scrollbar items-center gap-1">
        {PRESET_OPTIONS.map((p) => {
          const isActive = currentMode === 'preset' && currentPreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handleSelectPreset(p.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[36px] cursor-pointer ${
                isActive
                  ? 'bg-white text-primary-dark shadow-sm scale-105 border border-gray-200/60'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              {p.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleCustomToggle}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 min-h-[36px] cursor-pointer ${
            currentMode === 'custom'
              ? 'bg-[#1A7A4A] text-white shadow-sm scale-105'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <IconCalendar size={14} />
          <span>Sur-mesure</span>
        </button>
      </div>

      {/* Date Pickers pour le mode sur-mesure */}
      {currentMode === 'custom' && (
        <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Du</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>
          <span className="text-gray-300 font-bold text-xs">—</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Au</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
