import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CustomSelect } from '../components/CustomSelect';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { CustomAlertModal } from '../components/CustomAlertModal';
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
  IconInfoCircle,
  IconLoader2
} from '@tabler/icons-react';

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export const GerantPlanning = () => {
  const { currentUser } = useUser();
  const [terrain, setTerrain] = useState(null);
  const [loadingTerrain, setLoadingTerrain] = useState(true);
  const [alertConfig, setAlertConfig] = useState(null);

  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
  };

  const showConfirm = (title, message, onConfirm) => {
    setAlertConfig({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm: () => {
        setAlertConfig(null);
        onConfirm();
      },
      onClose: () => setAlertConfig(null)
    });
  };
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [currentMonthIdx, setCurrentMonthIdx] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [selectedSlotForEdit, setSelectedSlotForEdit] = useState(null);
  
  // Custom slot creation form state
  const [newSlotStart, setNewSlotStart] = useState('08:00');
  const [newSlotEnd, setNewSlotEnd] = useState('09:00');
  const [newSlotType, setNewSlotType] = useState('open'); // 'open' or 'blocked'
  const [newSlotReason, setNewSlotReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Bulk generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [showBulkGenerate, setShowBulkGenerate] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [bulkEndDate, setBulkEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [bulkDays, setBulkDays] = useState({
    1: true, // Lun
    2: true, // Mar
    3: true, // Mer
    4: true, // Jeu
    5: true, // Ven
    6: true, // Sam
    0: true, // Dim
  });
  const [bulkStartTime, setBulkStartTime] = useState('08:00');
  const [bulkEndTime, setBulkEndTime] = useState('22:00');
  const [bulkDuration, setBulkDuration] = useState('1 hour');
  const [bulkPriceOverride, setBulkPriceOverride] = useState('');

  // Fetch terrain owned by the logged-in gérant
  useEffect(() => {
    const loadTerrain = async () => {
      if (!currentUser?.id) return;
      try {
        setLoadingTerrain(true);
        const { data, error } = await supabase
          .from('terrains')
          .select('id, nom')
          .eq('gerant_id', currentUser.id)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        setTerrain(data);
      } catch (err) {
        console.error('Error fetching terrain:', err.message);
      } finally {
        setLoadingTerrain(false);
      }
    };
    loadTerrain();
  }, [currentUser]);

  // Format date string for Supabase query
  const dateString = useMemo(() => {
    const monthStr = String(currentMonthIdx + 1).padStart(2, '0');
    const dayStr = String(selectedDay).padStart(2, '0');
    return `${currentYear}-${monthStr}-${dayStr}`;
  }, [selectedDay, currentMonthIdx, currentYear]);

  // Fetch slots for the selected day
  const fetchSlots = async () => {
    if (!terrain?.id) return;
    try {
      setLoadingSlots(true);
      const { data, error } = await supabase
        .from('creneaux')
        .select(`
          id,
          date,
          heure_debut,
          heure_fin,
          statut,
          motif_blocage,
          reservations (
            joueur_nom,
            statut
          )
        `)
        .eq('terrain_id', terrain.id)
        .eq('date', dateString)
        .order('heure_debut');

      if (error) throw error;

      const formatted = data.map(c => {
        // Filter out cancelled reservations
        const activeRes = (c.reservations || []).find(r => r.statut !== 'annulee');
        return {
          id: c.id,
          time: `${c.heure_debut.slice(0, 5)} - ${c.heure_fin.slice(0, 5)}`,
          open: c.statut === 'disponible',
          booker: activeRes ? activeRes.joueur_nom : null,
          reason: c.motif_blocage
        };
      });

      setSlots(formatted);
    } catch (err) {
      console.error('Error fetching slots:', err.message);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [terrain, dateString]);

  // Generate day list for navigation (centered around selected date)
  const daysInMonth = useMemo(() => {
    const list = [];
    const date = new Date(currentYear, currentMonthIdx, selectedDay);
    const names = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    
    // Generate 11 days (5 before, current, 5 after)
    for (let i = -5; i <= 5; i++) {
      const d = new Date(currentYear, currentMonthIdx, selectedDay + i);
      list.push({
        name: names[d.getDay()],
        date: d.getDate(),
        month: d.getMonth(),
        year: d.getFullYear()
      });
    }
    return list;
  }, [selectedDay, currentMonthIdx, currentYear]);

  const handleDaySelect = (dayObj) => {
    setSelectedDay(dayObj.date);
    setCurrentMonthIdx(dayObj.month);
    setCurrentYear(dayObj.year);
  };

  const handleMonthChange = (direction) => {
    if (direction === 'prev') {
      if (currentMonthIdx === 0) {
        setCurrentMonthIdx(11);
        setCurrentYear(prev => prev - 1);
      } else {
        setCurrentMonthIdx(prev => prev - 1);
      }
    } else {
      if (currentMonthIdx === 11) {
        setCurrentMonthIdx(0);
        setCurrentYear(prev => prev + 1);
      } else {
        setCurrentMonthIdx(prev => prev + 1);
      }
    }
  };

  // Add individual slot
  const handleAddCustomSlot = async (e) => {
    e.preventDefault();
    if (!terrain?.id) return;
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from('creneaux')
        .insert({
          terrain_id: terrain.id,
          date: dateString,
          heure_debut: newSlotStart,
          heure_fin: newSlotEnd,
          statut: newSlotType === 'open' ? 'disponible' : 'bloque',
          motif_blocage: newSlotType === 'blocked' ? (newSlotReason || 'Fermé temporairement') : null
        });

      if (error) throw error;
      
      setShowAddSlot(false);
      setNewSlotReason('');
      await fetchSlots();
    } catch (err) {
      showAlert("Erreur de création", `Erreur lors de la création du créneau : ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Update existing slot status
  const handleUpdateSlot = async (updatedSlot) => {
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from('creneaux')
        .update({
          statut: updatedSlot.open ? 'disponible' : 'bloque',
          motif_blocage: updatedSlot.reason
        })
        .eq('id', updatedSlot.id);

      if (error) throw error;
      setSelectedSlotForEdit(null);
      await fetchSlots();
    } catch (err) {
      showAlert("Erreur de modification", `Erreur lors de la modification : ${err.message}`, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete existing slot
  const handleDeleteSlot = (id) => {
    showConfirm(
      "Suppression du créneau",
      "Voulez-vous vraiment supprimer ce créneau ?",
      async () => {
        try {
          setActionLoading(true);
          const { error } = await supabase
            .from('creneaux')
            .delete()
            .eq('id', id);

          if (error) throw error;
          setSelectedSlotForEdit(null);
          await fetchSlots();
        } catch (err) {
          showAlert("Erreur de suppression", `Erreur lors de la suppression : ${err.message}`, "error");
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  // Bulk slot generation RPC
  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    if (!terrain?.id) return;
    
    // Map selected days to integer array
    const daysArray = Object.keys(bulkDays)
      .filter(k => bulkDays[k])
      .map(Number);

    if (daysArray.length === 0) {
      showAlert("Sélection requise", "Veuillez sélectionner au moins un jour de la semaine.", "info");
      return;
    }

    try {
      setIsGenerating(true);
      const { data, error } = await supabase.rpc('generate_weekly_slots', {
        p_terrain_id: terrain.id,
        p_start_date: bulkStartDate,
        p_end_date: bulkEndDate,
        p_days_of_week: daysArray,
        p_start_time: bulkStartTime,
        p_end_time: bulkEndTime,
        p_slot_duration: bulkDuration,
        p_price_override: bulkPriceOverride ? parseInt(bulkPriceOverride) : null
      });

      if (error) throw error;

      showAlert("Génération réussie", `Succès ! ${data} créneau(x) ont été générés.`, "success");
      setShowBulkGenerate(false);
      await fetchSlots();
    } catch (err) {
      showAlert("Erreur de génération", `Erreur lors de la génération en masse : ${err.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleBulkDay = (dayNum) => {
    setBulkDays(prev => ({
      ...prev,
      [dayNum]: !prev[dayNum]
    }));
  };

  if (loadingTerrain) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full">
        <IconLoader2 size={40} className="animate-spin text-primary" />
        <p className="text-xs font-bold text-gray-400 mt-3">Chargement de votre complexe...</p>
      </div>
    );
  }

  if (!terrain) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <IconInfoCircle size={48} className="text-amber-500 mb-3" />
        <h3 className="font-bold text-primary-dark">Aucun terrain assigné</h3>
        <p className="text-xs text-gray-500 max-w-xs mt-1">Vous devez être associé à un terrain par l'administrateur pour planifier des créneaux.</p>
      </div>
    );
  }

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
            {MONTH_NAMES[currentMonthIdx]} {currentYear}
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
              onClick={() => handleDaySelect(d)}
              className={`flex flex-col items-center justify-center p-3 rounded-2xl w-14 transition-all cursor-pointer active:scale-95 shrink-0 ${
                selectedDay === d.date && currentMonthIdx === d.month && currentYear === d.year
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
            <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">
              Créneaux horaires — {selectedDay} {MONTH_NAMES[currentMonthIdx]}
            </h3>
            <p className="text-[10px] font-bold text-gray-400 mt-1">Personnalisez, bloquez ou générez en masse vos horaires de match</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <button 
              onClick={() => setShowBulkGenerate(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
            >
              <IconCalendar size={16} /> Générer en masse
            </button>
            <button 
              onClick={() => setShowAddSlot(true)}
              className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10"
            >
              <IconPlus size={16} /> Ajouter un créneau
            </button>
          </div>
        </div>

        {loadingSlots ? (
          <div className="flex justify-center py-12">
            <IconLoader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <IconClock size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-400">Aucun créneau ouvert pour cette journée</p>
            <button 
              onClick={() => setShowAddSlot(true)}
              className="text-xs font-black text-primary hover:underline mt-2 inline-block"
            >
              Créer le premier créneau
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slots.map((slot, index) => (
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
                      {slot.booker ? `Réservé par ${slot.booker}` : slot.open ? 'Créneau Libre' : slot.reason || 'Créneau Fermé'}
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
        )}
      </div>

      {/* Modal - Add custom Slot */}
      {showAddSlot && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" onClick={() => setShowAddSlot(false)}></div>
          <form onSubmit={handleAddCustomSlot} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar z-10">
            <button type="button" onClick={() => setShowAddSlot(false)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={20} />
            </button>
            
            <h3 className="text-xl font-display font-bold text-primary-dark mb-6 pr-10 min-w-0 truncate whitespace-normal break-words">Ajouter un créneau</h3>

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
                    placeholder="Ex: Entretien technique, Réservé club..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                  />
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={actionLoading}
              className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {actionLoading ? <IconLoader2 className="animate-spin" size={18} /> : <IconPlus size={18} />}
              Créer le créneau
            </button>
          </form>
        </div>
      , document.body)}

      {/* Modal - Slot Edit / Details option */}
      {selectedSlotForEdit && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" onClick={() => setSelectedSlotForEdit(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar z-10">
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
                      Ce créneau est réservé par <span className="font-bold text-primary-dark">{selectedSlotForEdit.booker}</span>.
                      Pour modifier ou libérer ce créneau, veuillez gérer la réservation depuis l'onglet Réservations.
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
                    disabled={actionLoading}
                    className="w-full py-4 text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all mt-4 disabled:opacity-50"
                  >
                    {actionLoading ? <IconLoader2 className="animate-spin" size={16} /> : <IconTrash size={16} />}
                    Supprimer ce créneau
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

      {/* Modal - Bulk Generate Slots */}
      {showBulkGenerate && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" onClick={() => setShowBulkGenerate(false)}></div>
          <form onSubmit={handleBulkGenerate} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-lg mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar z-10">
            <button type="button" onClick={() => setShowBulkGenerate(false)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={20} />
            </button>
            
            <h3 className="text-xl font-display font-bold text-primary-dark mb-6 pr-10">Génération récurrente (En masse)</h3>

            <div className="space-y-4 text-left">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Date de début</label>
                  <input 
                    type="date" 
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Date de fin</label>
                  <input 
                    type="date" 
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Jours de la semaine</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { num: 1, label: 'Lun' },
                    { num: 2, label: 'Mar' },
                    { num: 3, label: 'Mer' },
                    { num: 4, label: 'Jeu' },
                    { num: 5, label: 'Ven' },
                    { num: 6, label: 'Sam' },
                    { num: 0, label: 'Dim' }
                  ].map((day) => (
                    <button
                      type="button"
                      key={day.num}
                      onClick={() => toggleBulkDay(day.num)}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer active:scale-95 ${
                        bulkDays[day.num]
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-gray-100'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Heure d'ouverture</label>
                  <input 
                    type="time" 
                    value={bulkStartTime}
                    onChange={(e) => setBulkStartTime(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Heure de fermeture</label>
                  <input 
                    type="time" 
                    value={bulkEndTime}
                    onChange={(e) => setBulkEndTime(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Durée du créneau</label>
                  <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus-within:ring-2 ring-primary/20 font-bold text-primary-dark min-h-[48px] flex items-center">
                    <CustomSelect
                      value={bulkDuration}
                      onChange={(val) => setBulkDuration(val)}
                      options={[
                        { label: "1 heure", value: "1 hour" },
                        { label: "1h30", value: "1.5 hours" },
                        { label: "2 heures", value: "2 hours" }
                      ]}
                      theme="light"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Prix personnalisé (FCFA)</label>
                  <input 
                    type="number" 
                    value={bulkPriceOverride}
                    onChange={(e) => setBulkPriceOverride(e.target.value)}
                    placeholder="Optionnel (ex: 20000)"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isGenerating}
              className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {isGenerating ? <IconLoader2 className="animate-spin" size={18} /> : <IconCalendar size={18} />}
              Générer les créneaux
            </button>
          </form>
        </div>
      , document.body)}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};

