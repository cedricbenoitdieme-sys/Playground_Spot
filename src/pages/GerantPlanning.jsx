import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconCalendar, 
  IconCheck, 
  IconLock, 
  IconClock, 
  IconChevronLeft, 
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconX,
  IconEdit,
  IconInfoCircle
} from '@tabler/icons-react';

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export const GerantPlanning = () => {
  const [selectedDay, setSelectedDay] = useState(19);
  const [currentMonthIdx, setCurrentMonthIdx] = useState(4); // Mai
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [selectedSlotForEdit, setSelectedSlotForEdit] = useState(null);
  
  // Custom slot creation form state
  const [newSlotStart, setNewSlotStart] = useState('08:00');
  const [newSlotEnd, setNewSlotEnd] = useState('09:00');
  const [newSlotType, setNewSlotType] = useState('open'); // 'open' or 'blocked'
  const [newSlotReason, setNewSlotReason] = useState('');

  // Slots indexed by Day-Month to be fully persistent during interaction
  const [plannerData, setPlannerData] = useState({
    '19-4': [
      { id: 1, time: '08:00 - 09:00', open: true, booker: null },
      { id: 2, time: '09:00 - 10:00', open: true, booker: null },
      { id: 3, time: '10:00 - 11:00', open: false, booker: null, reason: 'Maintenance pelouse' },
      { id: 4, time: '11:00 - 12:00', open: true, booker: null },
      { id: 5, time: '14:00 - 15:00', open: true, booker: null },
      { id: 6, time: '15:00 - 16:00', open: true, booker: null },
      { id: 7, time: '16:00 - 17:00', open: true, booker: null },
      { id: 8, time: '17:00 - 18:00', open: true, booker: 'Malik Sy' },
      { id: 9, time: '18:00 - 19:00', open: true, booker: 'Abdoulaye Ndiaye' },
      { id: 10, time: '19:30 - 20:30', open: true, booker: 'Cheikh Tidiane (Attente)' },
      { id: 11, time: '21:00 - 22:00', open: true, booker: 'Omar Sarr' },
    ]
  });

  const activeKey = `${selectedDay}-${currentMonthIdx}`;

  const currentSlots = useMemo(() => {
    return plannerData[activeKey] || [
      { id: 1, time: '08:00 - 09:00', open: true, booker: null },
      { id: 2, time: '09:00 - 10:00', open: true, booker: null },
      { id: 3, time: '10:00 - 11:00', open: true, booker: null },
      { id: 4, time: '14:00 - 15:00', open: true, booker: null },
      { id: 5, time: '16:00 - 17:00', open: true, booker: null },
      { id: 6, time: '18:00 - 19:00', open: true, booker: null },
      { id: 7, time: '20:00 - 21:00', open: true, booker: null },
    ];
  }, [plannerData, activeKey]);

  // Generate days dynamically based on month
  const daysInMonth = useMemo(() => {
    // Just a mocked list of days for premium layout
    const names = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const list = [];
    for (let d = 15; d <= 25; d++) {
      list.push({
        name: names[(d + currentMonthIdx) % 7],
        date: d
      });
    }
    return list;
  }, [currentMonthIdx]);

  const handleMonthChange = (direction) => {
    if (direction === 'prev') {
      setCurrentMonthIdx(prev => (prev === 0 ? 11 : prev - 1));
    } else {
      setCurrentMonthIdx(prev => (prev === 11 ? 0 : prev + 1));
    }
  };

  const handleAddCustomSlot = (e) => {
    e.preventDefault();
    const newSlot = {
      id: Date.now(),
      time: `${newSlotStart} - ${newSlotEnd}`,
      open: newSlotType === 'open',
      booker: null,
      reason: newSlotType === 'blocked' ? (newSlotReason || 'Fermé temporairement') : null
    };

    setPlannerData(prev => ({
      ...prev,
      [activeKey]: [...currentSlots, newSlot].sort((a, b) => a.time.localeCompare(b.time))
    }));

    setShowAddSlot(false);
    setNewSlotReason('');
  };

  const handleUpdateSlot = (updatedSlot) => {
    setPlannerData(prev => ({
      ...prev,
      [activeKey]: currentSlots.map(s => s.id === updatedSlot.id ? updatedSlot : s)
    }));
    setSelectedSlotForEdit(null);
  };

  const handleDeleteSlot = (id) => {
    setPlannerData(prev => ({
      ...prev,
      [activeKey]: currentSlots.filter(s => s.id !== id)
    }));
    setSelectedSlotForEdit(null);
  };

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
      {/* Calendar Header selector */}
      <div 
        className="bg-white p-5 rounded-[2rem] shadow-subtle border border-black/5 flex flex-col md:flex-row items-center justify-between gap-6"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex items-center gap-3 select-none">
          <button 
            onClick={() => handleMonthChange('prev')} 
            className="p-2 hover:bg-gray-50 rounded-full active:scale-95 transition-transform cursor-pointer"
          >
            <IconChevronLeft size={20} className="text-gray-500" />
          </button>
          <span className="font-display font-bold text-primary-dark text-base min-w-[120px] text-center">
            {MONTH_NAMES[currentMonthIdx]} 2026
          </span>
          <button 
            onClick={() => handleMonthChange('next')} 
            className="p-2 hover:bg-gray-50 rounded-full active:scale-95 transition-transform cursor-pointer"
          >
            <IconChevronRight size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Days carousel */}
        <div className="flex gap-2 overflow-x-auto w-full md:w-auto no-scrollbar py-1">
          {daysInMonth.map((d, index) => (
            <button
              key={index}
              onClick={() => setSelectedDay(d.date)}
              className={`flex flex-col items-center justify-center p-3 rounded-2xl w-14 transition-all cursor-pointer active:scale-95 ${
                selectedDay === d.date 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                  : 'bg-gray-50 border border-gray-100 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className="text-[10px] uppercase font-bold tracking-widest">{d.name}</span>
              <span className="text-base font-black mt-0.5">{d.date}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive slots planner */}
      <div 
        className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-6"
        style={{ animation: 'slideUp 0.4s 0.1s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-50 pb-4">
          <div>
            <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Créneaux horaires — {selectedDay} {MONTH_NAMES[currentMonthIdx]}</h3>
            <p className="text-[10px] font-bold text-gray-400 mt-1">Personnalisez, bloquez ou ajoutez de nouveaux horaires librement</p>
          </div>
          <button 
            onClick={() => setShowAddSlot(true)}
            className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 self-start sm:self-auto"
          >
            <IconPlus size={16} /> Ajouter un créneau
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentSlots.map((slot, index) => (
            <div
              key={slot.id}
              onClick={() => setSelectedSlotForEdit(slot)}
              className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all active:scale-[0.99] hover:shadow-md cursor-pointer ${
                slot.booker
                  ? 'bg-primary-dark/5 border-primary-dark/15 text-primary-dark'
                  : slot.open
                  ? 'bg-white border-primary/20 hover:border-primary text-primary'
                  : 'bg-red-50/50 border-red-100 text-red-500 hover:border-red-200'
              }`}
              style={{ 
                animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                animationDelay: `${index * 0.05}s`
              }}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  slot.booker 
                    ? 'bg-primary-dark/10 text-primary-dark' 
                    : slot.open 
                    ? 'bg-primary/10 text-primary' 
                    : 'bg-red-50 text-red-500'
                }`}>
                  {slot.booker ? <IconCalendar size={18} /> : slot.open ? <IconClock size={18} /> : <IconLock size={18} />}
                </div>
                <div>
                  <p className="font-bold text-xs text-primary-dark">{slot.time}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-0.5">
                    {slot.booker ? `Réservé par ${slot.booker}` : slot.open ? 'Créneau Libre (Disponible)' : slot.reason || 'Créneau Fermé'}
                  </p>
                </div>
              </div>

              {slot.open && !slot.booker && (
                <span className="text-[9px] font-black uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">Ouvert</span>
              )}
              {!slot.open && !slot.booker && (
                <span className="text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-500 px-2.5 py-1 rounded-full">Bloqué</span>
              )}
              {slot.booker && (
                <span className="text-[9px] font-black uppercase tracking-wider bg-status-confirmed/15 text-status-confirmed px-2.5 py-1 rounded-full">Réservé</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal - Add custom Slot */}
      {showAddSlot && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAddSlot(false)}></div>
          <form onSubmit={handleAddCustomSlot} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar">
            <button type="button" onClick={() => setShowAddSlot(false)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={20} />
            </button>
            
            <h3 className="text-xl font-display font-bold text-primary-dark mb-6 pr-10 min-w-0 truncate whitespace-normal break-words">Ajouter un créneau horaire</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Heure de début</label>
                  <input 
                    type="time" 
                    value={newSlotStart}
                    onChange={(e) => setNewSlotStart(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Heure de fin</label>
                  <input 
                    type="time" 
                    value={newSlotEnd}
                    onChange={(e) => setNewSlotEnd(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Type de créneau</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setNewSlotType('open')}
                    className={`py-3 rounded-2xl font-bold text-xs border cursor-pointer transition-all ${
                      newSlotType === 'open' 
                        ? 'bg-primary/10 border-primary text-primary' 
                        : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    Disponible / Libre
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewSlotType('blocked')}
                    className={`py-3 rounded-2xl font-bold text-xs border cursor-pointer transition-all ${
                      newSlotType === 'blocked' 
                        ? 'bg-red-50 border-red-200 text-red-500' 
                        : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    Bloqué / Indisponible
                  </button>
                </div>
              </div>

              {newSlotType === 'blocked' && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Raison du blocage</label>
                  <input 
                    type="text" 
                    value={newSlotReason}
                    onChange={(e) => setNewSlotReason(e.target.value)}
                    placeholder="Ex: Entretien technique, Réservé club privé..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                  />
                </div>
              )}
            </div>

            <button type="submit" className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
              <IconPlus size={18} /> Créer le créneau
            </button>
          </form>
        </div>
      , document.body)}

      {/* Modal - Slot Edit / Details option */}
      {selectedSlotForEdit && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedSlotForEdit(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar">
            <button onClick={() => setSelectedSlotForEdit(null)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={20} />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
                <IconClock size={24} />
              </div>
              <div className="min-w-0 pr-10">
                <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">{selectedSlotForEdit.time}</h3>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mt-0.5">Options du créneau</span>
              </div>
            </div>

            <div className="space-y-4">
              {selectedSlotForEdit.booker ? (
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                  <IconInfoCircle className="text-primary shrink-0" size={20} />
                  <div>
                    <h4 className="font-bold text-xs text-primary-dark">Créneau réservé</h4>
                    <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">
                      Ce créneau est actuellement réservé par <span className="font-bold text-primary-dark">{selectedSlotForEdit.booker}</span>.
                      Pour modifier ou libérer ce créneau, veuillez d'abord gérer la réservation depuis l'onglet Réservations.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 font-medium">Modifiez le statut de ce créneau pour le jour en cours :</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleUpdateSlot({ ...selectedSlotForEdit, open: true, reason: null })}
                      className={`py-3 rounded-2xl font-bold text-xs border cursor-pointer transition-all ${
                        selectedSlotForEdit.open 
                          ? 'bg-primary/10 border-primary text-primary' 
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                      }`}
                    >
                      Rendre Libre
                    </button>
                    <button
                      onClick={() => handleUpdateSlot({ ...selectedSlotForEdit, open: false, reason: 'Fermé temporairement' })}
                      className={`py-3 rounded-2xl font-bold text-xs border cursor-pointer transition-all ${
                        !selectedSlotForEdit.open 
                          ? 'bg-red-50 border-red-200 text-red-500' 
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                      }`}
                    >
                      Bloquer / Fermer
                    </button>
                  </div>

                  <button
                    onClick={() => handleDeleteSlot(selectedSlotForEdit.id)}
                    className="w-full py-4 text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all mt-4"
                  >
                    <IconTrash size={16} /> Supprimer ce créneau
                  </button>
                </>
              )}
            </div>

            <button onClick={() => setSelectedSlotForEdit(null)} className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
              <IconCheck size={18} /> Confirmer
            </button>
          </div>
        </div>
      , document.body)}
    </div>
  );
};
