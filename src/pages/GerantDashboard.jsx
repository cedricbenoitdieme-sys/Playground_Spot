import React, { useState } from 'react';
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
  IconScan
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';

export const GerantDashboard = () => {
  const { currentUser } = useUser();
  const [activeSlot, setActiveSlot] = useState(null);
  const [selectedStat, setSelectedStat] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [selectedSlotDetail, setSelectedSlotDetail] = useState(null);

  const stats = [
    { label: "Réservations ce jour", value: "8", change: "+2 aujourd'hui", icon: IconCalendar, color: "primary" },
    { label: "Revenus (Mai)", value: "380K FCFA", change: "+14.2% vs Avril", icon: IconCreditCard, color: "secondary" },
    { label: "Taux d'occupation", value: "82%", change: "+5% cette semaine", icon: IconTrendingUp, color: "primary" },
  ];

  const upcomingReservations = [
    { id: '1', player: 'Malik Sy', time: '17:00 - 18:00', amount: '15.000 FCFA', status: 'Confirmé' },
    { id: '2', player: 'Abdoulaye Ndiaye', time: '18:00 - 19:00', amount: '15.000 FCFA', status: 'Confirmé' },
    { id: '3', player: 'Cheikh Tidiane', time: '19:30 - 20:30', amount: '20.000 FCFA', status: 'En attente' },
    { id: '4', player: 'Omar Sarr', time: '21:00 - 22:00', amount: '20.000 FCFA', status: 'Confirmé' },
  ];

  const getStatDetails = () => {
    if (selectedStat === null) return null;
    switch (selectedStat) {
      case 0:
        return {
          title: "Détails des Réservations",
          icon: <IconBallFootball size={24} className="text-primary" />,
          details: [
            { label: "Réservations terminées aujourd'hui", value: "3 matchs" },
            { label: "Réservations à venir", value: "5 matchs" },
            { label: "Réservations annulées", value: "0 match" },
            { label: "Total joueurs attendus", value: "48 joueurs" },
          ]
        };
      case 1:
        return {
          title: "Répartition des Revenus",
          icon: <IconWallet size={24} className="text-secondary" />,
          details: [
            { label: "Paiements Mobile Wave/OM", value: "280 000 FCFA" },
            { label: "Paiements sur place", value: "100 000 FCFA" },
            { label: "Frais de service (5% déduits)", value: "19 000 FCFA" },
            { label: "Revenu net estimé", value: "361 000 FCFA" },
          ]
        };
      case 2:
        return {
          title: "Analyses de l'Occupation",
          icon: <IconActivity size={24} className="text-primary" />,
          details: [
            { label: "Créneaux de pointe (17h - 22h)", value: "100% occupés" },
            { label: "Créneaux matinaux (08h - 12h)", value: "45% occupés" },
            { label: "Taux d'occupation weekends", value: "95%" },
            { label: "Heures jouées ce mois", value: "128 heures" },
          ]
        };
      default:
        return null;
    }
  };

  const currentDetail = getStatDetails();

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto overflow-x-hidden px-6 lg:px-8 py-6">
      {/* Welcome Banner */}
      <div 
        className="relative bg-[#0F2318] text-white p-6 rounded-[2rem] overflow-hidden border border-white/5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Gestionnaire Terrain</p>
          <h2 className="text-xl md:text-2xl font-display font-bold">Tableau de bord Terrain</h2>
          <p className="text-xs text-white/60 flex items-center gap-1"><IconMapPin size={12} className="text-primary" /> {currentUser.terrain}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <button 
            onClick={() => window.location.search = '?view=scan'} 
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-primary/20"
          >
            <IconScan size={18} />
            Scanner un Ticket
          </button>
          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full uppercase tracking-wider hidden md:inline-block">
            Gérant Connecté
          </span>
        </div>
      </div>

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
            {upcomingReservations.map((res, index) => (
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
            ))}
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
            {[
              { id: '1', time: '16:00', label: 'Libre', status: 'available' },
              { id: '2', time: '17:00', label: 'Réservé (Malik Sy)', status: 'reserved' },
              { id: '3', time: '18:00', label: 'Réservé (Abdoulaye)', status: 'reserved' },
              { id: '4', time: '19:00', label: 'Fermé (Entretien)', status: 'closed' },
              { id: '5', time: '20:00', label: 'Libre', status: 'available' },
            ].map((slot) => (
              <button
                key={slot.id}
                onClick={() => setSelectedSlotDetail(slot)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                  slot.status === 'available'
                    ? 'bg-green-50/50 hover:bg-green-50 border-green-100 text-primary'
                    : slot.status === 'reserved'
                    ? 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                    : 'bg-red-50/30 border-red-50 text-red-500 hover:bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{slot.time}</span>
                  <span className="text-[10px] font-semibold">{slot.label}</span>
                </div>
                {slot.status === 'available' ? (
                  <IconCheck size={14} className="text-primary" />
                ) : (
                  <IconChevronRight size={14} className="opacity-50" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics Modal */}
      {/* Analytics Modal */}
      {selectedStat !== null && currentDetail && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div 
            className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedStat(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] no-scrollbar outline-none focus:outline-none animate-in zoom-in-95 duration-200"
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
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div 
            className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedReservation(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] no-scrollbar outline-none focus:outline-none animate-in zoom-in-95 duration-200"
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
            <div className="space-y-4 mb-6">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 text-sm">Heure</span>
                <span className="font-bold text-primary-dark">{selectedReservation.time}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 text-sm">Montant</span>
                <span className="font-bold text-primary-dark">{selectedReservation.amount}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 text-sm">Statut</span>
                <span className={`font-bold ${selectedReservation.status === 'Confirmé' ? 'text-status-confirmed' : 'text-status-pending'}`}>{selectedReservation.status}</span>
              </div>
            </div>
            <div className="space-y-3">
              {selectedReservation.status === 'En attente' && (
                <button className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
                  <IconCheck size={18} /> Confirmer la réservation
                </button>
              )}
              <button className="w-full bg-gray-100 text-gray-700 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 cursor-pointer">
                Contacter le joueur
              </button>
              <button className="w-full bg-red-50 text-red-500 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 cursor-pointer">
                Annuler
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Live Slot Detail Modal */}
      {selectedSlotDetail && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div 
            className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedSlotDetail(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] no-scrollbar outline-none focus:outline-none animate-in zoom-in-95 duration-200"
          >
            <button 
              onClick={() => setSelectedSlotDetail(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
            >
              <IconX size={20} />
            </button>
            <div className="mb-6 pr-10 min-w-0">
              <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">Créneau Live : {selectedSlotDetail.time}</h3>
              <p className="text-xs text-gray-500 mt-1">État actuel: {selectedSlotDetail.label}</p>
            </div>
            <div className="space-y-3">
              {selectedSlotDetail.status === 'available' ? (
                <>
                  <button className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
                    Assigner un joueur (Sur place)
                  </button>
                  <button className="w-full bg-gray-100 text-gray-700 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 cursor-pointer">
                    Bloquer ce créneau
                  </button>
                </>
              ) : selectedSlotDetail.status === 'reserved' ? (
                <>
                  <button className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
                    Voir détails réservation
                  </button>
                  <button className="w-full bg-red-50 text-red-500 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 cursor-pointer">
                    Libérer / Terminer
                  </button>
                </>
              ) : (
                <button className="w-full btn-primary h-12 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
                  Débloquer le créneau
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};
