import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconCalendar, 
  IconTrendingUp, 
  IconClock, 
  IconCreditCard, 
  IconMapPin, 
  IconCheck, 
  IconChevronRight,
  IconX,
  IconWallet,
  IconBallFootball,
  IconActivity,
  IconScan,
  IconLoader2,
  IconFileTypePdf,
  IconDownload
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { updateReservationStatut } from '../services/reservations';
import { exportCSV, exportPDFReport } from '../utils/exportReports';
import { CustomAlertModal } from '../components/CustomAlertModal';
import { QuotaLimitBanner } from '../components/QuotaLimitBanner';
import { GerantVersementsSection } from '../components/GerantVersementsSection';


export const GerantDashboard = ({ setView }) => {
  const { currentUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [terrains, setTerrains] = useState([]);
  const [alertConfig, setAlertConfig] = useState(null);

  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
  };
  const [reservations, setReservations] = useState([]);
  const [stats, setStats] = useState([
    { label: "Réservations ce jour", value: "0", change: "Aujourd'hui", icon: IconCalendar, color: "primary" },
    { label: "Revenus (Mai)", value: "0 FCFA", change: "Mois en cours", icon: IconCreditCard, color: "secondary" },
    { label: "Taux d'occupation", value: "0%", change: "Mois en cours", icon: IconTrendingUp, color: "primary" },
  ]);
  const [upcomingReservations, setUpcomingReservations] = useState([]);
  const [liveSlots, setLiveSlots] = useState([]);

  const [activeSlot, setActiveSlot] = useState(null);
  const [selectedStat, setSelectedStat] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [selectedSlotDetail, setSelectedSlotDetail] = useState(null);

  const loadDashboardData = async () => {
    if (!currentUser?.id) return;
    try {
      setLoading(true);
      // 1. Charger les terrains gérés
      const { data: myTerrains, error: terrainsErr } = await supabase
        .from('terrains')
        .select('*')
        .eq('gerant_id', currentUser.id);
      if (terrainsErr) throw terrainsErr;
      setTerrains(myTerrains || []);

      if (myTerrains && myTerrains.length > 0) {
        const terrainIds = myTerrains.map(t => t.id);

        // 2. Charger les réservations associées
        const { data: resData, error: resErr } = await supabase
          .from('reservations')
          .select(`
            *,
            profiles!joueur_id ( nom, tel )
          `)
          .in('terrain_id', terrainIds)
          .order('date_slot', { ascending: false })
          .order('heure_slot', { ascending: false });
        if (resErr) throw resErr;

        const mappedRes = (resData || []).map(r => ({
          id: r.id,
          player: r.joueur_nom || r.profiles?.nom || 'Joueur',
          time: `${r.date_slot} • ${r.heure_slot?.slice(0, 5)}`,
          amount: `${r.montant?.toLocaleString('fr-FR')} FCFA`,
          status: r.statut === 'confirmee' ? 'Confirmé' : r.statut === 'en_attente' ? 'En attente' : r.statut === 'terminee' ? 'Terminé' : 'Annulé',
          rawStatus: r.statut,
          tel: r.profiles?.tel || '',
          terrain_nom: r.terrain_nom,
          terrain_id: r.terrain_id,
          date_slot: r.date_slot,
          heure_slot: r.heure_slot,
          montant: r.montant,
        }));

        setReservations(mappedRes);

        // 3. Calculer les statistiques
        const today = new Date().toISOString().split('T')[0];
        const todayRes = mappedRes.filter(r => r.date_slot === today);
        
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthRes = mappedRes.filter(r => {
          const d = new Date(r.date_slot);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        const totalRevenues = monthRes
          .filter(r => r.rawStatus === 'confirmee' || r.rawStatus === 'terminee')
          .reduce((sum, r) => sum + r.montant, 0);

        // Taux d'occupation estimé
        const { count: totalSlots, error: slotsCountErr } = await supabase
          .from('creneaux')
          .select('*', { count: 'exact', head: true })
          .in('terrain_id', terrainIds)
          .gte('date', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`);
        
        const occupiedCount = monthRes.filter(r => r.rawStatus === 'confirmee' || r.rawStatus === 'terminee').length;
        const occupancyRate = totalSlots && totalSlots > 0 ? Math.round((occupiedCount / totalSlots) * 100) : 0;

        // Formater le mois actuel en français
        const monthLabel = new Date().toLocaleString('fr-FR', { month: 'long' });
        const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

        setStats([
          { label: "Réservations ce jour", value: String(todayRes.length), change: `${todayRes.filter(r => r.status === 'Confirmé').length} confirmés`, icon: IconCalendar, color: "primary" },
          { label: `Revenus (${capitalizedMonth})`, value: `${totalRevenues.toLocaleString('fr-FR')} FCFA`, change: "Mois en cours", icon: IconCreditCard, color: "secondary" },
          { label: "Taux d'occupation", value: `${occupancyRate}%`, change: `${occupiedCount} créneaux réservés`, icon: IconTrendingUp, color: "primary" },
        ]);

        setUpcomingReservations(todayRes.slice(0, 5));

        // 4. Créneaux du jour
        const { data: slotsData, error: slotsErr } = await supabase
          .from('creneaux')
          .select('*')
          .in('terrain_id', terrainIds)
          .eq('date', today)
          .order('heure_debut');
        if (slotsErr) throw slotsErr;

        const mappedSlots = (slotsData || []).map(s => {
          const resForSlot = todayRes.find(r => r.heure_slot === s.heure_debut && r.terrain_id === s.terrain_id);
          const terrain = myTerrains.find(t => t.id === s.terrain_id);
          return {
            id: s.id,
            time: s.heure_debut?.slice(0, 5),
            label: resForSlot ? `Réservé (${resForSlot.player})` : s.statut === 'bloque' ? 'Fermé (Entretien)' : 'Libre',
            status: resForSlot ? 'reserved' : s.statut === 'bloque' ? 'closed' : 'available',
            reservation: resForSlot || null,
            terrain_id: s.terrain_id,
            date: s.date,
            heure_debut: s.heure_debut,
            price: terrain ? terrain.price : 15000,
          };
        });

        setLiveSlots(mappedSlots);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [currentUser]);

  const handleConfirmReservation = async (res) => {
    try {
      await updateReservationStatut(res.id, 'confirmee');
      setSelectedReservation(null);
      loadDashboardData();
    } catch (err) {
      showAlert("Erreur de confirmation", err.message, "error");
    }
  };

  const handleCancelReservation = async (res) => {
    try {
      await updateReservationStatut(res.id, 'annulee');
      setSelectedReservation(null);
      loadDashboardData();
    } catch (err) {
      showAlert("Erreur d'annulation", err.message, "error");
    }
  };

  const handleContact = (res) => {
    if (res.tel) {
      window.open(`https://wa.me/${res.tel.replace(/\s+/g, '')}`, '_blank');
    } else {
      showAlert("Numéro introuvable", "Aucun numéro de téléphone disponible.", "info");
    }
  };

  const handleBlockSlot = async (slot) => {
    try {
      const { error } = await supabase
        .from('creneaux')
        .update({ statut: 'bloque', motif_blocage: 'Entretien gérant' })
        .eq('id', slot.id);
      if (error) throw error;
      setSelectedSlotDetail(null);
      loadDashboardData();
    } catch (err) {
      showAlert("Erreur de blocage", err.message, "error");
    }
  };

  const handleUnblockSlot = async (slot) => {
    try {
      const { error } = await supabase
        .from('creneaux')
        .update({ statut: 'disponible', motif_blocage: null })
        .eq('id', slot.id);
      if (error) throw error;
      setSelectedSlotDetail(null);
      loadDashboardData();
    } catch (err) {
      showAlert("Erreur de déblocage", err.message, "error");
    }
  };

  const getStatDetails = () => {
    if (selectedStat === null) return null;
    const currentMonth = new Date().toLocaleString('fr-FR', { month: 'long' });
    const capitalizedMonth = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);
    
    switch (selectedStat) {
      case 0:
        return {
          title: "Détails des Réservations",
          icon: <IconBallFootball size={24} className="text-primary" />,
          details: [
            { label: "Réservations aujourd'hui", value: `${upcomingReservations.length} matchs` },
            { label: "Confirmées", value: `${upcomingReservations.filter(r => r.status === 'Confirmé').length} matchs` },
            { label: "En attente", value: `${upcomingReservations.filter(r => r.status === 'En attente').length} matchs` },
            { label: "Total gérés", value: `${reservations.length} réservations` },
          ]
        };
      case 1:
        return {
          title: `Répartition des Revenus (${capitalizedMonth})`,
          icon: <IconWallet size={24} className="text-secondary" />,
          details: [
            { label: "Revenu brut ce mois", value: stats[1]?.value || '0 FCFA' },
            { label: "Moyenne par match", value: reservations.length > 0 ? `${Math.round(reservations.reduce((sum, r) => sum + r.montant, 0) / reservations.length).toLocaleString('fr-FR')} FCFA` : '—' },
          ]
        };
      case 2:
        return {
          title: "Analyses de l'Occupation",
          icon: <IconActivity size={24} className="text-primary" />,
          details: [
            { label: "Créneaux totaux configurés", value: stats[2]?.change || '0%' },
            { label: "Taux moyen ce mois", value: stats[2]?.value || '0%' },
          ]
        };
      default:
        return null;
    }
  };

  const currentDetail = getStatDetails();

  const terrainNom = terrains.map(t => t.nom).join(', ') || 'Aucun terrain configuré';

  if (loading) {
    return (
      <div className="flex-1 bg-background flex flex-col items-center justify-center p-12 text-gray-400 gap-3 min-h-[400px]">
        <IconLoader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm font-semibold font-sans">Chargement du tableau de bord...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto overflow-x-hidden px-6 lg:px-8 py-6 font-sans">
      {/* Welcome Banner */}
      <div 
        className="relative bg-[#0F2318] text-white p-6 rounded-[2rem] overflow-hidden border border-white/5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Gestionnaire Terrain</p>
          <h2 className="text-xl md:text-2xl font-display font-bold">Tableau de bord Terrain</h2>
          <p className="text-xs text-white/60 flex items-center gap-1"><IconMapPin size={12} className="text-primary" /> {terrainNom}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <button
            onClick={() => {
              const headers = ['Joueur', 'Terrain', 'Date', 'Heure', 'Montant FCFA', 'Statut'];
              const rows = reservations.map(r => [
                r.joueur || r.joueur_nom || 'N/A',
                r.terrain || r.terrain_nom || terrainNom,
                r.date || 'N/A',
                r.slot || r.heure || 'N/A',
                (r.montant || 0).toLocaleString('fr-FR'),
                r.status || r.statut || 'N/A'
              ]);
              exportCSV(`gerant_dashboard_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
            }}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-full transition-all border border-white/10 cursor-pointer"
          >
            <IconDownload size={15} /> CSV
          </button>
          <button
            onClick={() => {
              exportPDFReport({
                title: 'Bilan Activité Terrain — Gérant',
                subtitle: `Terrain: ${terrainNom} | ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
                onPopupBlocked: () => showAlert('Popups bloqués', "Veuillez autoriser les fenêtres surgissantes (popups) pour télécharger le rapport PDF.", 'error'),
                metadata: [
                  { label: stats[0]?.label || 'Réservations', value: stats[0]?.value || '0' },
                  { label: stats[1]?.label || 'Revenus', value: stats[1]?.value || '0 FCFA' },
                  { label: stats[2]?.label || 'Occupation', value: stats[2]?.value || '0%' }
                ],
                headers: ['Joueur', 'Terrain', 'Date', 'Heure', 'Montant FCFA', 'Statut'],
                rows: reservations.map(r => [
                  r.joueur || r.joueur_nom || 'N/A',
                  r.terrain || r.terrain_nom || terrainNom,
                  r.date || 'N/A',
                  r.slot || r.heure || 'N/A',
                  (r.montant || 0).toLocaleString('fr-FR') + ' FCFA',
                  r.status || r.statut || 'N/A'
                ]),
                summaryFooter: `Bilan PlaygroundSpot — ${terrainNom}`
              });
            }}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2 rounded-full transition-all shadow-lg shadow-primary/20 cursor-pointer"
          >
            <IconFileTypePdf size={15} /> PDF 📄
          </button>
          <button 
            onClick={() => window.location.search = '?view=scan'} 
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all border border-white/10 cursor-pointer"
          >
            <IconScan size={18} />
            Scanner
          </button>
          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full uppercase tracking-wider hidden md:inline-block">
            Gérant Connecté
          </span>
        </div>
      </div>

      {/* Quota Alert Banner */}
      <QuotaLimitBanner quotaType="reservations" setView={setView} />

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <div 
            key={index} 
            onClick={() => setSelectedStat(index)}
            className="bg-white p-5 rounded-card shadow-subtle border border-black/5 flex items-center justify-between group hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
            style={{ 
              animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
              animationDelay: `${index * 0.08 + 0.05}s`
            }}
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <h3 className="text-2xl font-bold text-primary-dark">{stat.value}</h3>
              <p className="text-[10px] font-bold text-primary flex items-center gap-0.5">{stat.change}</p>
            </div>
            <div className="w-12 h-12 bg-primary/5 text-primary rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
              <stat.icon size={22} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Reservations & Quick slots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next Reservations */}
        <div 
          className="lg:col-span-2 bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-4"
          style={{ animation: 'slideUp 0.4s 0.2s cubic-bezier(.22,1,.36,1) both' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Réservations du Jour</h3>
            <span className="text-[10px] font-bold text-gray-400">Aujourd'hui</span>
          </div>

          <div className="divide-y divide-gray-50">
            {upcomingReservations.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucune réservation aujourd'hui.</p>
            ) : (
              upcomingReservations.map((res, index) => (
                <button 
                  key={res.id} 
                  onClick={() => setSelectedReservation(res)}
                  className="w-full text-left py-3 flex items-center justify-between hover:bg-gray-50/50 hover:shadow-sm rounded-xl px-2 transition-all group cursor-pointer"
                  style={{ 
                    animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                    animationDelay: `${index * 0.06 + 0.25}s`
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary-light flex items-center justify-center text-[10px] font-bold text-secondary">
                      {res.player.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="font-bold text-primary-dark text-xs">{res.player}</p>
                      <p className="text-[10px] text-gray-400 font-semibold flex items-center gap-1 mt-0.5"><IconClock size={10} /> {res.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold text-xs text-primary-dark">{res.amount}</p>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        res.status === 'Confirmé' 
                          ? 'bg-status-confirmed/10 text-status-confirmed border border-status-confirmed/25' 
                          : 'bg-status-pending/10 text-status-pending border border-status-pending/25'
                      }`}>
                        {res.status}
                      </span>
                    </div>
                    <IconChevronRight size={14} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Live Occupancy Status widget */}
        <div 
          className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-4"
          style={{ animation: 'slideUp 0.4s 0.25s cubic-bezier(.22,1,.36,1) both' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Créneaux Live</h3>
            <span className="w-2.5 h-2.5 bg-status-confirmed rounded-full animate-ping"></span>
          </div>

          <div className="space-y-3">
            {liveSlots.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">Aucun créneau configuré pour aujourd'hui.</p>
            ) : (
              liveSlots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlotDetail(slot)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer gap-2 ${
                    slot.status === 'available'
                      ? 'bg-green-50/50 hover:bg-green-50 border-green-100 text-primary'
                      : slot.status === 'reserved'
                      ? 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                      : 'bg-red-50/30 border-red-50 text-red-500 hover:bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-bold shrink-0">{slot.time}</span>
                    <span className="text-[10px] font-semibold truncate min-w-0">{slot.label}</span>
                  </div>
                  {slot.status === 'available' ? (
                    <IconCheck size={14} className="text-primary shrink-0" />
                  ) : (
                    <IconChevronRight size={14} className="opacity-50 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Section Versements & Revenus Net SenePay */}
      <GerantVersementsSection gerantId={currentUser?.id} />

      {/* Analytics Modal */}
      {selectedStat !== null && currentDetail && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div 
            className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" 
            onClick={() => setSelectedStat(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] no-scrollbar outline-none focus:outline-none animate-in zoom-in-95 duration-200 z-10"
          >
            <button 
              onClick={() => setSelectedStat(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
            >
              <IconX size={20} />
            </button>

            <div className="flex items-center gap-3 mb-6 pr-10">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                {currentDetail.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">{currentDetail.title}</h3>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mt-0.5">Analyses Directes</span>
              </div>
            </div>

            <div className="space-y-4">
              {currentDetail.details.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-gray-100/50 transition-colors">
                  <span className="text-xs font-semibold text-gray-500">{item.label}</span>
                  <span className="text-sm font-bold text-primary-dark">{item.value}</span>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setSelectedStat(null)} 
              className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20"
            >
              <IconCheck size={18} /> Fermer
            </button>
          </div>
        </div>
      , document.body)}

      {/* Reservation Detail Modal */}
      {selectedReservation && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div 
            className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" 
            onClick={() => setSelectedReservation(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] no-scrollbar outline-none focus:outline-none animate-in zoom-in-95 duration-200 z-10"
          >
            <button 
              onClick={() => setSelectedReservation(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
            >
              <IconX size={20} />
            </button>
            <div className="mb-6 pr-10 min-w-0">
              <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">Détails Réservation</h3>
              <p className="text-xs text-gray-500 mt-1 truncate">{selectedReservation.player}</p>
            </div>
            <div className="space-y-4 mb-6 font-sans">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 text-sm">Heure</span>
                <span className="font-bold text-primary-dark text-sm">{selectedReservation.time}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 text-sm">Montant</span>
                <span className="font-bold text-primary-dark text-sm">{selectedReservation.amount}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 text-sm">Statut</span>
                <span className={`font-bold text-sm ${selectedReservation.status === 'Confirmé' ? 'text-status-confirmed' : 'text-status-pending'}`}>{selectedReservation.status}</span>
              </div>
            </div>
            <div className="space-y-3">
              {selectedReservation.status === 'En attente' && (
                <button 
                  onClick={() => handleConfirmReservation(selectedReservation)}
                  className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20"
                >
                  <IconCheck size={18} /> Confirmer la réservation
                </button>
              )}
              <button 
                onClick={() => handleContact(selectedReservation)}
                className="w-full bg-gray-100 text-gray-700 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 cursor-pointer"
              >
                Contacter le joueur
              </button>
              {selectedReservation.status !== 'Terminé' && selectedReservation.status !== 'Annulé' && (
                <button 
                  onClick={() => handleCancelReservation(selectedReservation)}
                  className="w-full bg-red-50 text-red-500 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 cursor-pointer"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Live Slot Detail Modal */}
      {selectedSlotDetail && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div 
            className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" 
            onClick={() => setSelectedSlotDetail(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] no-scrollbar outline-none focus:outline-none animate-in zoom-in-95 duration-200 z-10"
          >
            <button 
              onClick={() => setSelectedSlotDetail(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
            >
              <IconX size={20} />
            </button>
            <div className="mb-6 pr-10 min-w-0">
              <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words font-serif">Créneau Live : {selectedSlotDetail.time}</h3>
              <p className="text-xs text-gray-500 mt-1 font-semibold">État actuel: {selectedSlotDetail.label}</p>
            </div>

            {/* Profitability breakdown for the slot */}
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 mb-6 space-y-3">
              <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                ⚽ Gestion des créneaux
              </h4>
              <div className="space-y-1.5 text-xs text-primary-dark font-medium">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Prix public :</span>
                  <span className="font-bold font-mono">{(selectedSlotDetail.price || 15000).toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Frais Unitech Pay (1,5%) :</span>
                  <span className="font-bold font-mono text-gray-400">-{Math.round((selectedSlotDetail.price || 15000) * 0.015).toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-black/5 font-bold">
                  <span className="text-primary">Votre gain net :</span>
                  <span className="font-mono text-primary">{( (selectedSlotDetail.price || 15000) - Math.round((selectedSlotDetail.price || 15000) * 0.015) ).toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 italic mt-2">
                Le saviez-vous ? Vous pouvez ajuster vos prix à tout moment pour optimiser vos revenus.
              </p>
            </div>

            <div className="space-y-3">
              {selectedSlotDetail.status === 'available' ? (
                <>
                  <button 
                    onClick={() => handleBlockSlot(selectedSlotDetail)}
                    className="w-full bg-orange-50 text-orange-600 border border-orange-100 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-orange-100 cursor-pointer"
                  >
                    Bloquer ce créneau
                  </button>
                </>
              ) : selectedSlotDetail.status === 'reserved' ? (
                <>
                  <button 
                    onClick={() => { setSelectedReservation(slot.reservation); setSelectedSlotDetail(null); }}
                    className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20"
                  >
                    Voir détails réservation
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => handleUnblockSlot(selectedSlotDetail)}
                  className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20"
                >
                  Débloquer le créneau
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};
