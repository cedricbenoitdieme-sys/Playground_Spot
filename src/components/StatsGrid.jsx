import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconTrendingUp, 
  IconTrendingDown, 
  IconCalendar, 
  IconX, 
  IconWallet, 
  IconBallFootball, 
  IconMapPin, 
  IconUsers,
  IconCheck
} from '@tabler/icons-react';

/* ── Custom Counter Hook ── */
const useCounter = (target, duration = 800) => {
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    const steps = Math.max(30, Math.floor(duration / 16));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      const t = i / steps;
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setCount(Math.round(start + diff * ease));
      if (i >= steps) {
        clearInterval(timer);
        prev.current = target;
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
};

const fmtCompact = (n) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M FCFA';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K FCFA';
  return n.toLocaleString('fr-FR') + ' FCFA';
};

const AnimatedVal = ({ target, isCurrency, isRawInt }) => {
  const animated = useCounter(target);
  if (isCurrency) return <span className="gs-kpi-value">{fmtCompact(animated)}</span>;
  if (isRawInt) return <span className="gs-kpi-value">{animated.toLocaleString('fr-FR')}</span>;
  return <span className="gs-kpi-value">{animated}</span>;
};

export const StatsGrid = () => {
  const [filter, setFilter] = useState('7j');
  const [selectedStat, setSelectedStat] = useState(null);

  const filterOptions = [
    { id: '24h', label: 'Dernières 24h' },
    { id: '48h', label: 'Dernières 48h' },
    { id: '7j', label: 'Cette semaine' },
    { id: '30j', label: 'Ce mois' },
    { id: 'annee', label: 'Cette année' },
  ];

  // Simulated metrics based on period filter
  const metricsMap = {
    '24h':   { revenues: 180000, bookings: 6,   activePitches: 12, users: 1412, changeRev: '+5.4%', changeBook: '+8.1%', isPosRev: true, isPosBook: true },
    '48h':   { revenues: 390000, bookings: 14,  activePitches: 14, users: 1415, changeRev: '+8.2%', changeBook: '+12.5%', isPosRev: true, isPosBook: true },
    '7j':    { revenues: 1250000, bookings: 24,  activePitches: 15, users: 1420, changeRev: '+12.5%', changeBook: '+18.2%', isPosRev: true, isPosBook: true },
    '30j':   { revenues: 4800000, bookings: 112, activePitches: 16, users: 1465, changeRev: '+15.8%', changeBook: '+22.1%', isPosRev: true, isPosBook: true },
    'annee': { revenues: 54200000, bookings: 1240, activePitches: 18, users: 2150, changeRev: '+24.6%', changeBook: '+31.4%', isPosRev: true, isPosBook: true },
  };

  const current = metricsMap[filter];

  const getStatDetailsContent = () => {
    if (selectedStat === null) return null;
    
    switch (selectedStat) {
      case 0:
        return {
          title: "Analyse des Revenus",
          icon: <IconWallet size={24} className="text-primary" />,
          stats: [
            { label: "Moyenne par terrain", value: fmtCompact(Math.round(current.revenues / current.activePitches)) },
            { label: "Paiements mobiles (Wave/OM)", value: "75% (" + fmtCompact(Math.round(current.revenues * 0.75)) + ")" },
            { label: "Paiements sur place", value: "25% (" + fmtCompact(Math.round(current.revenues * 0.25)) + ")" },
            { label: "Commission plateforme (5%)", value: fmtCompact(Math.round(current.revenues * 0.05)) },
          ]
        };
      case 1:
        return {
          title: "Détails des Réservations",
          icon: <IconBallFootball size={24} className="text-primary" />,
          stats: [
            { label: "Nombre total de réservations", value: current.bookings + " matchs" },
            { label: "Réservations confirmées", value: Math.round(current.bookings * 0.75) + " (75%)" },
            { label: "En attente de validation", value: Math.round(current.bookings * 0.17) + " (17%)" },
            { label: "Annulées ou reportées", value: Math.round(current.bookings * 0.08) + " (8%)" },
          ]
        };
      case 2:
        return {
          title: "Rapport Terrains Actifs",
          icon: <IconMapPin size={24} className="text-primary" />,
          stats: [
            { label: "Complexes ouverts", value: current.activePitches + " complexes" },
            { label: "Taux d'occupation global", value: "85% (Heures pleines)" },
            { label: "Quartier le plus demandé", value: "Almadies (Dakar)" },
            { label: "Terrain star de la période", value: "Five Dakar Almadies" },
          ]
        };
      case 3:
        return {
          title: "Démographie des Joueurs",
          icon: <IconUsers size={24} className="text-primary" />,
          stats: [
            { label: "Total joueurs enregistrés", value: current.users.toLocaleString('fr-FR') + " joueurs" },
            { label: "Nouveaux inscrits", value: "+" + Math.round(current.users * 0.02) + " sur la période" },
            { label: "Taux d'activité hebdomadaire", value: "68% de joueurs actifs" },
            { label: "Répartition principale", value: "Médina & Mermoz (48%)" },
          ]
        };
      default:
        return null;
    }
  };

  const detailContent = getStatDetailsContent();

  return (
    <div className="space-y-6">
      {/* Filter Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 lg:px-8" style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
        <h2 className="text-sm font-bold text-primary-dark uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
          <span className="w-2 h-2 bg-primary rounded-full animate-ping"></span>
          Performance Globale
        </h2>
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-1 shadow-sm overflow-x-auto no-scrollbar w-full md:w-auto">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap flex-shrink-0 min-h-[32px] ${
                filter === opt.id 
                  ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[1.02]' 
                  : 'text-gray-400 hover:text-primary-dark hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="ml-2 pl-2 border-l border-gray-100 pr-1 flex-shrink-0">
            <IconCalendar size={16} className="text-gray-400" />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-6 lg:px-8">
        {[
          { label: 'Revenus totaux', value: current.revenues, change: current.changeRev, isPositive: current.isPosRev, isCurrency: true },
          { label: "Réservations", value: current.bookings, change: current.changeBook, isPositive: current.isPosBook, isCurrency: false },
          { label: 'Terrains actifs', value: current.activePitches, change: '+1', isPositive: true, isCurrency: false },
          { label: 'Joueurs inscrits', value: current.users, change: filter === '24h' ? '-0.1%' : '+2.4%', isPositive: filter !== '24h', isCurrency: false, isRawInt: true },
        ].map((stat, index) => (
          <div 
            key={index} 
            onClick={() => setSelectedStat(index)}
            className="stat-card group hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden cursor-pointer"
            style={{ animation: `slideUp 0.45s ${index * 0.08}s cubic-bezier(.22,1,.36,1) both` }}
          >
            <p className="text-sm font-medium text-gray-500 mb-2">{stat.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-bold text-primary-dark flex items-baseline gap-1">
                <AnimatedVal target={stat.value} isCurrency={stat.isCurrency} isRawInt={stat.isRawInt} />
              </h3>
              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border transition-all ${
                stat.isPositive 
                  ? 'bg-status-confirmed/10 text-status-confirmed border-status-confirmed/20' 
                  : 'bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20'
              }`}>
                {stat.isPositive ? <IconTrendingUp size={14} /> : <IconTrendingDown size={14} />}
                {stat.change}
              </div>
            </div>
            
            {/* Dynamic Progress Bar Decoration */}
            <div className="mt-4 h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ease-out ${stat.isPositive ? 'bg-primary' : 'bg-status-cancelled'}`} 
                style={{ 
                  width: filter === '24h' ? '35%' 
                       : filter === '48h' ? '50%' 
                       : filter === '7j' ? '68%' 
                       : filter === '30j' ? '82%' 
                       : '95%' 
                }}
              ></div>
            </div>

            {/* Premium Pulsing decoration */}
            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
               <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-glow"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Premium Detail Modal */}
      {selectedStat !== null && detailContent && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div 
            className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedStat(null)}
          ></div>
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar outline-none focus:outline-none"
          >
            {/* Close */}
            <button 
              onClick={() => setSelectedStat(null)} 
              className="absolute top-6 right-6 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
            >
              <IconX size={20} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 pr-10">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                {detailContent.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">{detailContent.title}</h3>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mt-0.5">Période : {filterOptions.find(o => o.id === filter)?.label}</span>
              </div>
            </div>

            {/* Metrics List */}
            <div className="space-y-4">
              {detailContent.stats.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-gray-100/50 transition-colors">
                  <span className="text-xs font-semibold text-gray-500">{item.label}</span>
                  <span className="text-sm font-bold text-primary-dark">{item.value}</span>
                </div>
              ))}
            </div>

            {/* Action button */}
            <button 
              onClick={() => setSelectedStat(null)} 
              className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20"
            >
              <IconCheck size={18} /> Fermer
            </button>
          </div>
        </div>
      , document.body)}
    </div>
  );
};
