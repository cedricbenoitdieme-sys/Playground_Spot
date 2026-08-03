import React, { useState } from 'react';
import { IconClock, IconX, IconCheck } from '@tabler/icons-react';
import { Modal } from './Modal';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

// Heures les plus courantes pour le foot (créneaux rapides)
const QUICK_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
  '20:00', '21:00', '22:00', '23:00'
];

export const CustomTimePicker = ({
  value = '',
  onChange,
  placeholder = 'HH:mm',
  className = '',
  disabled = false,
  title = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const [selectedHour, selectedMinute] = (value && value.includes(':'))
    ? value.split(':')
    : ['08', '00'];

  const handleSelectTime = (h, m) => {
    const timeStr = `${h}:${m}`;
    if (onChange) onChange(timeStr);
    setIsOpen(false);
  };

  return (
    <>
      {/* Bouton Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        title={title}
        className={`inline-flex items-center gap-2 transition-all cursor-pointer text-left focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          className || 'w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800'
        }`}
      >
        <IconClock size={14} className="shrink-0 text-primary" />
        <span className="truncate flex-1">
          {value || placeholder}
        </span>
      </button>

      {/* Pop-up Modale TimePicker (createPortal) */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        center={true}
        className="flex items-center justify-center p-4"
        overlayClassName="bg-black/70 backdrop-blur-md"
      >
        <div className="bg-[#0F2318] border border-white/10 text-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                <IconClock size={18} />
              </div>
              <div>
                <h4 className="font-display font-bold text-sm text-white">Choisir l'heure</h4>
                <p className="text-[11px] text-white/50">Sélectionnez une heure et une minute</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors cursor-pointer"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Affichage de l'heure courante choisie */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
            <span className="font-display text-2xl font-extrabold tracking-wider text-primary">
              {selectedHour}:{selectedMinute}
            </span>
          </div>

          {/* Sélecteur 2 Colonnes (Heure / Minute) */}
          <div className="grid grid-cols-2 gap-3">
            
            {/* Colonne Heures */}
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5 text-center">
                Heures
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {HOURS.map((h) => {
                  const isHSelected = h === selectedHour;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleSelectTime(h, selectedMinute)}
                      className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        isHSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-white/5 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      <span>{h}h</span>
                      {isHSelected && <IconCheck size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Colonne Minutes */}
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5 text-center">
                Minutes
              </label>
              <div className="space-y-1">
                {MINUTES.map((m) => {
                  const isMSelected = m === selectedMinute;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectTime(selectedHour, m)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        isMSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-white/5 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      <span>:{m}</span>
                      {isMSelected && <IconCheck size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Créneaux rapides */}
          <div className="pt-2 border-t border-white/10">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-2">
              Créneaux rapides
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_SLOTS.slice(0, 8).map((slot) => {
                const isSelected = slot === value;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      const [h, m] = slot.split(':');
                      handleSelectTime(h, m);
                    }}
                    className={`py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pied */}
          <div className="pt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold cursor-pointer transition-colors"
            >
              Fermer
            </button>
          </div>

        </div>
      </Modal>
    </>
  );
};
