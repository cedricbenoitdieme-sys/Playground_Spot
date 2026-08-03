import React, { useState, useMemo } from 'react';
import { 
  IconCalendar, 
  IconChevronLeft, 
  IconChevronRight, 
  IconX 
} from '@tabler/icons-react';
import { Modal } from './Modal';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/**
 * Formate une chaîne YYYY-MM-DD en DD/MM/YYYY pour l'affichage
 */
const formatDateFR = (isoString) => {
  if (!isoString) return '';
  const parts = isoString.split('-');
  if (parts.length !== 3) return isoString;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export const CustomDatePicker = ({
  value = '',
  onChange,
  min = '',
  max = '',
  placeholder = 'Choisir une date',
  className = '',
  disabled = false,
  title = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Date actuellement affichée dans le calendrier (mois/année)
  const [currentViewDate, setCurrentViewDate] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  const viewYear = currentViewDate.getFullYear();
  const viewMonth = currentViewDate.getMonth();

  // Génération des jours pour le mois affiché
  const monthDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

    // Décalage pour commencer le lundi (0=Lun, 6=Dim)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysCount = lastDayOfMonth.getDate();
    const days = [];

    // Cases vides précédant le 1er du mois
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // Jours réels du mois
    for (let day = 1; day <= daysCount; day++) {
      const monthStr = String(viewMonth + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const isoDate = `${viewYear}-${monthStr}-${dayStr}`;

      const isDisabled = (min && isoDate < min) || (max && isoDate > max);
      days.push({ day, isoDate, isDisabled });
    }

    return days;
  }, [viewYear, viewMonth, min, max]);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCurrentViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCurrentViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleSelectDay = (isoDate) => {
    if (onChange) {
      onChange(isoDate);
    }
    setIsOpen(false);
  };

  const handleTodayClick = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayIso = `${y}-${m}-${d}`;

    if ((!min || todayIso >= min) && (!max || todayIso <= max)) {
      if (onChange) onChange(todayIso);
      setCurrentViewDate(new Date(y, today.getMonth(), 1));
      setIsOpen(false);
    }
  };

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <>
      {/* Bouton de déclenchement (Trigger) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        title={title}
        className={`inline-flex items-center gap-2 transition-all cursor-pointer text-left focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
          className || 'w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-800'
        }`}
      >
        <IconCalendar size={14} className="shrink-0 text-primary" />
        <span className="truncate flex-1">
          {value ? formatDateFR(value) : placeholder}
        </span>
      </button>

      {/* Pop-up Modale du Calendrier (createPortal) */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        center={true}
        className="flex items-center justify-center p-4"
        overlayClassName="bg-black/70 backdrop-blur-md"
      >
        <div className="bg-[#0F2318] border border-white/10 text-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
          
          {/* Header du Calendrier */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                <IconCalendar size={18} />
              </div>
              <span className="font-display font-bold text-base text-white capitalize">
                {MONTHS_FR[viewMonth]} {viewYear}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <IconChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <IconChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors cursor-pointer ml-1"
              >
                <IconX size={18} />
              </button>
            </div>
          </div>

          {/* Jours de la semaine */}
          <div className="grid grid-cols-7 text-center">
            {DAYS_FR.map((d) => (
              <span key={d} className="text-[10px] font-bold text-white/50 uppercase tracking-wider py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Grille des Jours du Mois */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {monthDays.map((item, idx) => {
              if (!item) {
                return <div key={`empty-${idx}`} className="h-9" />;
              }

              const isSelected = item.isoDate === value;
              const isToday = item.isoDate === todayStr;

              return (
                <button
                  key={item.isoDate}
                  type="button"
                  disabled={item.isDisabled}
                  onClick={() => handleSelectDay(item.isoDate)}
                  className={`h-9 w-full rounded-xl text-xs font-bold transition-all flex items-center justify-center relative cursor-pointer ${
                    item.isDisabled
                      ? 'text-white/20 cursor-not-allowed bg-transparent'
                      : isSelected
                      ? 'bg-primary text-white shadow-glow border border-primary-light scale-105'
                      : isToday
                      ? 'bg-white/10 text-primary border border-primary/40 hover:bg-primary/20'
                      : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  {item.day}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Pied du Calendrier */}
          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs">
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-primary hover:underline font-bold cursor-pointer transition-colors"
            >
              Aujourd'hui
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-semibold cursor-pointer transition-colors"
            >
              Fermer
            </button>
          </div>

        </div>
      </Modal>
    </>
  );
};
