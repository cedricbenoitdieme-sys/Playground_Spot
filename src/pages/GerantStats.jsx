import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconTrendingUp, IconCalendarEvent, IconStarFilled, IconPercentage, IconX, IconBell, IconGift, IconChevronDown, IconLoader2 } from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { fetchGerantKpis, fetchRepartitionPaiements } from '../services/stats';
import { supabase } from '../lib/supabase';
import { GERANT_KPIS, GERANT_TERRAINS, REVENUS_PAR_JOUR, RESERVATIONS_PAR_CRENEAU, REPARTITION_PAIEMENT, TOP_JOUEURS } from '../data/mockData';
import './gerantStats.css';

/* ── Animated counter hook ── */
const useCounter = (target, duration = 900) => {
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
      const ease = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(start + diff * ease));
      if (i >= steps) { clearInterval(timer); prev.current = target; }
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return count;
};

const fmtCompact = (n) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M FCFA';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K FCFA';
  return n.toLocaleString('fr-FR') + ' FCFA';
};
const fmt = fmtCompact;
const maxVal = (arr) => Math.max(...arr);

/* ── Bottom Sheet ── */
const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 lg:left-64 z-[9999]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 outline-none focus:outline-none">
        <div className="flex items-start justify-between p-6 border-b border-gray-50 gap-4">
          <h3 className="font-display font-bold text-lg text-primary-dark flex-1 min-w-0 truncate whitespace-normal break-words leading-tight mt-0.5">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer text-gray-400 hover:text-primary-dark shrink-0"><IconX size={18} /></button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </div>
  , document.body);
};

/* ── StatCard cliquable ── */
const StatCard = ({ icon: Icon, label, value, sub, accent, onClick }) => (
  <button
    onClick={onClick}
    className="bg-white rounded-2xl shadow-subtle border border-black/5 p-4 flex items-center gap-3 w-full text-left cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all min-h-[80px]"
  >
    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accent + '18' }}>
      <Icon size={22} style={{ color: accent }} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-lg font-display font-bold text-primary-dark truncate">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 font-medium">{sub}</p>}
    </div>
  </button>
);

/* ── Graphique SVG courbe interactif ── */
const RevenusChart = ({ data, terrainId }) => {
  const [tooltip, setTooltip] = useState(null);
  const W = 560, H = 170, pad = { t: 16, r: 16, b: 36, l: 56 };
  const vals = data.map(d => terrainId === 'all' ? d.all : d.montant);
  const max = Math.max(...vals) * 1.15;
  const toY = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const toX = (i) => pad.l + i * ((W - pad.l - pad.r) / (vals.length - 1));
  const area = `M${toX(0)},${toY(vals[0])} ` + vals.map((v,i) => `L${toX(i)},${toY(v)}`).join(' ') + ` L${toX(vals.length-1)},${H-pad.b} L${toX(0)},${H-pad.b} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A7A4A" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#1A7A4A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0,0.25,0.5,0.75,1].map((p,i) => {
          const y = pad.t + p*(H-pad.t-pad.b);
          return <g key={i}>
            <line x1={pad.l} y1={y} x2={W-pad.r} y2={y} stroke="#f0f0f0" strokeWidth="1"/>
            <text x={pad.l-6} y={y+4} textAnchor="end" fontSize="9" fill="#bbb">{((max*(1-p))/1000).toFixed(0)}k</text>
          </g>;
        })}
        <path d={area} fill="url(#rg)" />
        <polyline fill="none" stroke="#1A7A4A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={vals.map((v,i)=>`${toX(i)},${toY(v)}`).join(' ')} />
        {vals.map((v,i) => (
          <g key={i} className="cursor-pointer" onMouseEnter={() => setTooltip({i,v,jour:data[i].jour})} onMouseLeave={() => setTooltip(null)}>
            <circle cx={toX(i)} cy={toY(v)} r="18" fill="transparent" />
            <circle cx={toX(i)} cy={toY(v)} r={tooltip?.i===i ? 6 : 4} fill="#1A7A4A" stroke="white" strokeWidth="2" />
            <text x={toX(i)} y={H-pad.b+14} textAnchor="middle" fontSize="9" fill="#bbb">{data[i].jour}</text>
            {tooltip?.i===i && (
              <g>
                <rect x={toX(i)-44} y={toY(v)-34} width="88" height="26" rx="6" fill="#0F2318" />
                <text x={toX(i)} y={toY(v)-17} textAnchor="middle" fontSize="10" fill="white" fontWeight="700">{(v/1000).toFixed(1)}k FCFA</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

/* ── Graphique créneaux ── */
const CreneauChart = ({ data, onBarClick }) => {
  const W = 560, H = 160, pad = { t: 20, r: 16, b: 36, l: 32 };
  const mv = maxVal(data.map(d => d.nb));
  const bw = Math.floor((W - pad.l - pad.r) / data.length) - 8;
  const toH = v => (v / mv) * (H - pad.t - pad.b);
  const bx = i => pad.l + i * ((W - pad.l - pad.r) / data.length) + 4;
  const heat = (nb) => nb >= mv * 0.9 ? '#1A7A4A' : nb >= mv * 0.6 ? '#34d399' : '#E8F5EE';

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 300 }}>
        {data.map((d,i) => {
          const bh = toH(d.nb), by = H - pad.b - bh;
          return (
            <g key={i} className="cursor-pointer" onClick={() => onBarClick(d)}>
              <rect x={bx(i)} y={by} width={bw} height={bh} rx="5" fill={heat(d.nb)} />
              {d.nb >= mv * 0.6 && <text x={bx(i)+bw/2} y={by-5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1A7A4A">{d.nb}</text>}
              <text x={bx(i)+bw/2} y={H-pad.b+14} textAnchor="middle" fontSize="8.5" fill="#aaa">{d.heure}</text>
              {d.nb === mv && (
                <text x={bx(i)+bw/2} y={by-16} textAnchor="middle" fontSize="9" fill="#F97316">🔥</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ── Donut paiements ── */
const DonutChart = ({ data, onSliceClick }) => {
  const R = 56, cx = 72, cy = 72, sw = 20;
  const circ = 2 * Math.PI * R;
  let off = 0;
  const segs = data.map(d => { const dash = (d.value/100)*circ; const s = {...d,dash,off}; off+=dash; return s; });
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg viewBox="0 0 144 144" className="w-32 h-32 flex-shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
        {segs.map((s,i) => (
          <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${s.dash} ${circ-s.dash}`} strokeDashoffset={-s.off+circ*0.25}
            className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onSliceClick(s)} />
        ))}
        <text x={cx} y={cx-5} textAnchor="middle" fontSize="10" fill="#9ca3af" fontWeight="600">Total</text>
        <text x={cx} y={cx+10} textAnchor="middle" fontSize="12" fill="#0F2318" fontWeight="800">100%</text>
      </svg>
      <div className="space-y-2 w-full">
        {data.map((d,i) => (
          <button key={i} onClick={() => onSliceClick(d)} className="w-full flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-sm font-semibold text-gray-700 flex-1 text-left">{d.label}</span>
            <span className="text-sm font-bold text-primary-dark">{d.value}%</span>
            {d.trend && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.trend?.startsWith('+') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{d.trend}</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ── Statut badge ── */
const StatusBadge = ({ s }) => {
  const map = { 'Confirmée':'bg-green-50 text-green-700', 'Terminée':'bg-gray-100 text-gray-600', 'Annulée':'bg-red-50 text-red-600', 'En attente':'bg-yellow-50 text-yellow-700' };
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${map[s]||'bg-gray-100 text-gray-500'}`}>{s}</span>;
};

/* ── PERIODS ── */
const PERIODES = [
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'quarter', label: '3 mois' },
];

export const GerantStats = () => {
  const { currentUser } = useUser();
  const [periode, setPeriode]       = useState('month');
  const [terrain, setTerrain]       = useState('all');
  const [showTerrainDD, setDD]      = useState(false);
  const [kpiSheet, setKpiSheet]     = useState(null);
  const [creneauSheet, setCreSheet] = useState(null);
  const [paySheet, setPaySheet]     = useState(null);
  const [joueurSheet, setJouSheet]  = useState(null);
  const [toast, setToast]           = useState(null);
  const [animKey, setAnimKey]       = useState(0);

  const [kpi, setKpi]               = useState({ revenus: 0, reservations: 0, tauxOccupation: 0, noteMoyenne: 4.8 });
  const [terrains, setTerrains]     = useState([{ id: 'all', label: 'Tous les terrains' }]);
  const [repartPay, setRepartPay]   = useState(REPARTITION_PAIEMENT);
  const [loading, setLoading]       = useState(true);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Load terrains list
  useEffect(() => {
    if (!currentUser?.id) return;
    const loadTerrains = async () => {
      try {
        const { data, error } = await supabase
          .from('terrains')
          .select('id, nom')
          .eq('gerant_id', currentUser.id);
        if (error) throw error;
        if (data) {
          setTerrains([
            { id: 'all', label: 'Tous les terrains' },
            ...data.map(t => ({ id: t.id, label: t.nom }))
          ]);
        }
      } catch (err) {
        console.error("Error loading terrains:", err);
      }
    };
    loadTerrains();
  }, [currentUser]);

  // Load KPIs and payment methods
  useEffect(() => {
    if (!currentUser?.id) return;
    const loadStats = async () => {
      try {
        setLoading(true);
        const tId = terrain === 'all' ? null : terrain;
        const liveKpi = await fetchGerantKpis(currentUser.id, tId, periode);
        setKpi({
          ...liveKpi,
          noteMoyenne: liveKpi.noteMoyenne || 4.8
        });

        const livePay = await fetchRepartitionPaiements(currentUser.id);
        if (livePay && livePay.length > 0) {
          setRepartPay(livePay);
        }
      } catch (err) {
        console.error("Error loading statistics:", err);
        // Safe fallback mock in case RPC / DB is empty during testing
        const kpiByTerrain = GERANT_KPIS[terrain] || GERANT_KPIS['all'];
        setKpi(kpiByTerrain[periode] || kpiByTerrain['month']);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, [currentUser, terrain, periode]);

  const terrainLabel = terrains.find(t => t.id === terrain)?.label || 'Tous les terrains';

  /* Re-trigger animations on filter change */
  const changeTerrain = (id) => { setTerrain(id); setDD(false); setAnimKey(k => k + 1); };
  const changePeriode = (key) => { setPeriode(key); setAnimKey(k => k + 1); };

  /* Animated KPI numbers */
  const animRevenus      = useCounter(kpi.revenus);
  const animReservations = useCounter(kpi.reservations);
  const animOccupation   = useCounter(kpi.tauxOccupation);
  const animNote         = useCounter(Math.round(kpi.noteMoyenne * 10));

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden pb-28 lg:pb-12">

      {/* Header animé */}
      <div className="px-5 lg:px-8 pt-6 pb-3" style={{ animation: 'slideUp 0.5s cubic-bezier(.22,1,.36,1) both' }}>
        <h1 className="text-2xl font-display font-bold text-primary-dark tracking-tight">Statistiques</h1>
        <p className="text-xs text-gray-400 font-medium mt-0.5">Vue analytique gérant</p>
      </div>

      {/* Filtres */}
      <div className="px-5 lg:px-8 mb-5 flex flex-wrap gap-3 items-center">
        {/* Terrain dropdown */}
        <div className="relative">
          <button onClick={() => setDD(!showTerrainDD)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm text-sm font-bold text-primary-dark min-h-[44px]">
            <span className="max-w-[140px] truncate">{terrainLabel}</span>
            <IconChevronDown size={16} className={`transition-transform ${showTerrainDD ? 'rotate-180' : ''}`} />
          </button>
          {showTerrainDD && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 w-52 overflow-hidden">
              {terrains.map(t => (
                <button key={t.id} onClick={() => changeTerrain(t.id)}
                  className={`w-full text-left px-4 py-3 text-sm font-semibold transition-all min-h-[44px] ${terrain === t.id ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-gray-50 text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Période */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {PERIODES.map(p => (
            <button key={p.key} onClick={() => changePeriode(p.key)}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition-all duration-300 min-h-[40px] ${periode === p.key ? 'bg-white text-primary-dark shadow-sm scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div key={animKey} className="px-5 lg:px-8 space-y-5 gs-fade-key">
        {/* KPIs animés */}
        <div className="grid grid-cols-2 gap-3">
          <div className="gs-card">
            <StatCard icon={IconTrendingUp} label="Revenus" value={fmtCompact(animRevenus)} sub="+12.5% vs préc." accent="#1A7A4A"
              onClick={() => setKpiSheet({ title: 'Détail Revenus', content: [
                { label: 'Revenus totaux', value: fmt(kpi.revenus) },
                { label: 'Variation', value: '+12.5%' },
                { label: 'Meilleur jour', value: 'Vendredi 17/05' },
                { label: 'Revenu moyen/jour', value: fmt(Math.round(kpi.revenus / 30)) },
              ]})} />
          </div>
          <div className="gs-card">
            <StatCard icon={IconCalendarEvent} label="Réservations" value={animReservations} sub="confirmées" accent="#2563EB"
              onClick={() => setKpiSheet({ title: 'Détail Réservations', content: [
                { label: 'Total', value: kpi.reservations },
                { label: 'Confirmées', value: Math.round(kpi.reservations * 0.78) },
                { label: 'Annulées', value: Math.round(kpi.reservations * 0.08) },
                { label: 'En attente', value: Math.round(kpi.reservations * 0.14) },
              ]})} />
          </div>
          <div className="gs-card">
            <StatCard icon={IconPercentage} label="Occupation" value={`${animOccupation}%`} sub="taux moyen" accent="#F97316"
              onClick={() => setKpiSheet({ title: "Taux d'occupation", content: [
                { label: 'Moyen', value: `${kpi.tauxOccupation}%` },
                { label: 'Pic (18h-22h)', value: '94%' },
                { label: 'Creux (08h-12h)', value: '42%' },
                { label: 'Objectif mensuel', value: '85%' },
              ]})} />
          </div>
          <div className="gs-card">
            <StatCard icon={IconStarFilled} label="Note" value={(animNote / 10).toFixed(1) + ' ★'} sub="basée sur les avis" accent="#FBBF24"
              onClick={() => setKpiSheet({ title: 'Note Moyenne', content: [
                { label: 'Note globale', value: `${kpi.noteMoyenne}/5` },
                { label: '5 étoiles', value: '61%' },
                { label: '4 étoiles', value: '28%' },
                { label: 'Inférieur à 3', value: '11%' },
              ]})} />
          </div>
        </div>

        {/* Graphique revenus */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-subtle p-5 gs-section">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-primary-dark">Revenus par jour</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">7 derniers jours · {terrainLabel}</p>
            </div>
            <span className="text-[11px] bg-primary/10 text-primary font-bold px-3 py-1 rounded-full">FCFA</span>
          </div>
          <RevenusChart data={REVENUS_PAR_JOUR} terrainId={terrain} />
        </div>

        {/* Créneaux */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-subtle p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-primary-dark">Réservations par créneau</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Cliquez sur une barre pour voir le détail</p>
            </div>
            <span className="text-[11px] bg-orange-50 text-orange-500 font-bold px-3 py-1 rounded-full">🔥 18h</span>
          </div>
          <CreneauChart data={RESERVATIONS_PAR_CRENEAU} onBarClick={(d) => setCreSheet(d)} />
        </div>

        {/* Paiements + Top joueurs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Donut */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-subtle p-5">
            <h3 className="font-bold text-primary-dark mb-4">Modes de paiement</h3>
            <DonutChart data={repartPay} onSliceClick={(d) => setPaySheet(d)} />
          </div>

          {/* Top joueurs */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-subtle p-5">
            <h3 className="font-bold text-primary-dark mb-4">Top joueurs fidèles</h3>
            <div className="space-y-2">
              {TOP_JOUEURS.map((j, i) => (
                <button key={j.id} onClick={() => setJouSheet(j)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[56px] text-left">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${i===0?'bg-yellow-400 text-yellow-900':i===1?'bg-gray-300 text-gray-700':i===2?'bg-orange-300 text-orange-900':'bg-gray-100 text-gray-500'}`}>{i+1}</span>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary border border-primary/20 flex-shrink-0">{j.initiales}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-primary-dark truncate">{j.nom}</p>
                    <p className="text-[11px] text-gray-400">{j.reservations} réservations</p>
                  </div>
                  <span className="text-sm font-bold text-primary whitespace-nowrap">{j.montant.toLocaleString('fr-FR')} F</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sheet KPI détail */}
      <Sheet open={!!kpiSheet} onClose={() => setKpiSheet(null)} title={kpiSheet?.title || ''}>
        <div className="space-y-3">
          {kpiSheet?.content?.map((row, i) => (
            <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-semibold text-gray-600">{row.label}</span>
              <span className="text-sm font-bold text-primary-dark">{row.value}</span>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Sheet créneau */}
      <Sheet open={!!creneauSheet} onClose={() => setCreSheet(null)} title={creneauSheet ? `Créneau ${creneauSheet.heure} — ${creneauSheet.nb} réservations` : ''}>
        <div className="space-y-2">
          {creneauSheet?.reservations?.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl gap-3">
              <div>
                <p className="text-sm font-bold text-primary-dark">{r.joueur}</p>
                <p className="text-[11px] text-gray-400">{r.terrain}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">{r.montant}</p>
                <StatusBadge s={r.statut} />
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Sheet paiement */}
      <Sheet open={!!paySheet} onClose={() => setPaySheet(null)} title={paySheet?.label || ''}>
        {paySheet && (
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-semibold text-gray-600">Part</span>
              <span className="text-sm font-bold" style={{ color: paySheet.color }}>{paySheet.value}%</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-semibold text-gray-600">Montant total</span>
              <span className="text-sm font-bold text-primary-dark">{paySheet.montant?.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-semibold text-gray-600">Transactions</span>
              <span className="text-sm font-bold text-primary-dark">{paySheet.transactions}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-semibold text-gray-600">Tendance</span>
              <span className={`text-sm font-bold ${paySheet.trend?.startsWith('+') ? 'text-green-600' : 'text-red-500'}`}>{paySheet.trend}</span>
            </div>
          </div>
        )}
      </Sheet>

      {/* Sheet joueur */}
      <Sheet open={!!joueurSheet} onClose={() => setJouSheet(null)} title={joueurSheet?.nom || ''}>
        {joueurSheet && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-2xl">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-black text-primary border-2 border-primary/20">{joueurSheet.initiales}</div>
              <div>
                <p className="font-bold text-primary-dark text-lg">{joueurSheet.nom}</p>
                <p className="text-sm text-gray-500">{joueurSheet.reservations} réservations · {joueurSheet.montant.toLocaleString('fr-FR')} FCFA</p>
              </div>
            </div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Historique</h4>
            <div className="space-y-2">
              {joueurSheet.historique?.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl gap-3">
                  <div>
                    <p className="text-sm font-bold text-primary-dark">{h.terrain}</p>
                    <p className="text-[11px] text-gray-400">{h.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{h.montant}</p>
                    <StatusBadge s={h.statut} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { showToast(`Notification envoyée à ${joueurSheet.nom}`); setJouSheet(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px]">
                <IconBell size={18} /> Notifier
              </button>
              <button onClick={() => { showToast(`Réduction offerte à ${joueurSheet.nom} !`); setJouSheet(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-primary/20 text-primary font-bold rounded-xl min-h-[48px]">
                <IconGift size={18} /> Réduction
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-medium z-[150] animate-in slide-in-from-bottom-5 duration-300 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
};
