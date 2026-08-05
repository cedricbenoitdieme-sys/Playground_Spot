import React, { useState } from 'react';
import { IconCalendar } from '@tabler/icons-react';
import { CustomDatePicker } from './CustomDatePicker';

export const PRESET_OPTIONS = [
  { key: '24h', label: '24h' },
  { key: '72h', label: '72h' },
  { key: '7d',  label: '7j' },
  { key: '14d', label: '14j' },
  { key: '31d', label: '31j' },
  { key: '45d', label: '45j' },
  { key: '3m',  label: '3 mois' },
  { key: '6m',  label: '6 mois' },
  { key: '1y',  label: '1 an' },
  { key: 'all', label: 'Depuis toujours' },
];

export const PeriodSelector = ({ value, onChange, className = '' }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const currentMode = typeof value === 'object' && value !== null ? (value.mode || 'preset') : 'preset';
  const currentPreset = typeof value === 'object' && value !== null ? (value.preset || '31d') : (typeof value === 'string' ? (value === 'week' ? '7d' : value === 'quarter' ? '3m' : value === 'month' ? '31d' : '31d') : '31d');
  
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
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 max-w-full min-w-0 ${className}`}>
      {/* Barre de boutons préréglages */}
      <div 
        className="flex bg-gray-100/90 p-1 rounded-xl border border-gray-200/80 overflow-x-auto max-w-full no-scrollbar items-center gap-1 shrink-0"
      >
        {PRESET_OPTIONS.map((p) => {
          const isActive = currentMode === 'preset' && currentPreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handleSelectPreset(p.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-white text-primary-dark shadow-xs border border-gray-200/60'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              {p.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleCustomToggle}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer shrink-0 ${
            currentMode === 'custom'
              ? 'bg-[#1A7A4A] text-white shadow-xs'
              : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
          }`}
        >
          <IconCalendar size={13} />
          <span>Sur-mesure</span>
        </button>
      </div>

      {/* Date Pickers pour le mode sur-mesure */}
      {currentMode === 'custom' && (
        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-xs animate-in fade-in duration-200 shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Du</span>
            <CustomDatePicker
              value={startDate}
              max={endDate}
              onChange={(newDate) => handleDateChange('startDate', newDate)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>
          <span className="text-gray-300 font-bold text-xs">—</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Au</span>
            <CustomDatePicker
              value={endDate}
              min={startDate}
              onChange={(newDate) => handleDateChange('endDate', newDate)}
              className="text-xs font-bold text-gray-800 bg-transparent border-none focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
