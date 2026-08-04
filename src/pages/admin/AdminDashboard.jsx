import React, { useState, useEffect } from 'react';
import { callRpc } from '../../lib/supabaseRpc';
import {
  IconBuildingStore, 
  IconCalendarEvent, 
  IconCash, 
  IconChartBar, 
  IconRefresh,
  IconTrendingUp,
  IconClock,
  IconFileTypePdf,
  IconDownload,
  IconReportMoney,
  IconChartPie,
  IconFilter,
  IconUserCheck,
  IconExternalLink,
  IconInfoCircle
} from '@tabler/icons-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip as RechartsTooltip, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  BarChart, 
  Bar, 
  Legend 
} from 'recharts';
import { exportCSV, exportPDFReport } from '../../utils/exportReports';
import { CustomAlertModal } from '../../components/CustomAlertModal';
import { PeriodSelector } from '../../components/PeriodSelector';
import { KpiDetailModal } from '../../components/admin/KpiDetailModal';

const formatFCFA = (amount) => {
  if (amount === null || amount === undefined) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
};

const PLAN_COLORS = ['#1A7A4A', '#F59E0B', '#3B82F6', '#10B981', '#6366F1'];

export const AdminDashboard = ({ onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Nouveaux états analytics (RPCs indépendantes)
  const [revenueKpis, setRevenueKpis] = useState(null);
  const [ltvFunnel, setLtvFunnel] = useState(null);
  const [churn, setChurn] = useState(null);
  const [signupsTrend, setSignupsTrend] = useState(null);
  const [signupsPeriod, setSignupsPeriod] = useState({ mode: 'preset', preset: '31d' });

  // ── Modales et Périodes de Détail (Cartes cliquables) ──
  const [activeModal, setActiveModal] = useState(null); // 'occupation' | 'revenue' | 'ltv' | 'churn'

  // 1. Taux Occupation Detail
  const [occupationPeriode, setOccupationPeriode] = useState({ mode: 'preset', preset: '31d' });
  const [occupationDetail, setOccupationDetail] = useState(null);

  // 2. Revenue Detail (MRR / ARR)
  const [revenueDetailPeriode, setRevenueDetailPeriode] = useState({ mode: 'preset', preset: '31d' });
  const [revenueDetail, setRevenueDetail] = useState(null);

  // 3. LTV Detail
  const [ltvDetailPeriode, setLtvDetailPeriode] = useState({ mode: 'preset', preset: 'all' });
  const [ltvDetail, setLtvDetail] = useState(null);

  // 4. Churn Detail
  const [churnDetailPeriode, setChurnDetailPeriode] = useState({ mode: 'preset', preset: '31d' });
  const [churnDetail, setChurnDetail] = useState(null);

  // ── Périodes de Sections ──
  // 5. Funnel d'activation
  const [funnelPeriode, setFunnelPeriode] = useState({ mode: 'preset', preset: 'all' });

  // 6. Volume de réservations
  const [reservationsPeriode, setReservationsPeriode] = useState({ mode: 'preset', preset: '31d' });
  const [reservationsTrend, setReservationsTrend] = useState(null);

  // 7. Évolution du MRR
  const [mrrTrendPeriode, setMrrTrendPeriode] = useState({ mode: 'preset', preset: '1y' });
  const [mrrTrendData, setMrrTrendData] = useState(null);

  // Alert modal
  const [alertConfig, setAlertConfig] = useState(null);
  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
  };

  const buildRpcParams = (periodObj) => {
    if (!periodObj) return {};
    if (periodObj.mode === 'preset') {
      return { p_preset: periodObj.preset };
    }
    if (periodObj.mode === 'custom') {
      return { p_date_debut: periodObj.startDate, p_date_fin: periodObj.endDate };
    }
    return {};
  };

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callRpc('get_admin_dashboard_stats');
      setStats(data);
    } catch (err) {
      console.error('Erreur get_admin_dashboard_stats:', err);
      setError(err.message || 'Impossible de charger les statistiques.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Chargement initial des vues par défaut
    callRpc('admin_get_revenue_kpis').then(setRevenueKpis).catch(err => console.error('admin_get_revenue_kpis:', err));
    callRpc('admin_get_churn_rate').then(setChurn).catch(err => console.error('admin_get_churn_rate:', err));
  }, []);

  // Effet Funnel
  useEffect(() => {
    const params = buildRpcParams(funnelPeriode);
    callRpc('admin_get_ltv_funnel', params).then(setLtvFunnel).catch(err => console.error('admin_get_ltv_funnel:', err));
  }, [funnelPeriode]);

  // Effet Inscriptions
  useEffect(() => {
    let days = 31;
    if (signupsPeriod.mode === 'preset') {
      const presetMap = {
        '24h': 1, '72h': 3, '7d': 7, '14d': 14, '31d': 31, '45d': 45, '3m': 90, '6m': 180, '1y': 365, 'all': 730
      };
      days = presetMap[signupsPeriod.preset] || 31;
    } else if (signupsPeriod.mode === 'custom' && signupsPeriod.startDate && signupsPeriod.endDate) {
      const start = new Date(signupsPeriod.startDate);
      const end = new Date(signupsPeriod.endDate);
      const diffTime = Math.abs(end - start);
      days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    callRpc('admin_get_signups_trend', { p_jours: days }).then(setSignupsTrend).catch(err => console.error('admin_get_signups_trend:', err));
  }, [signupsPeriod]);

  // Effet Volume de Réservations Trend
  useEffect(() => {
    const params = buildRpcParams(reservationsPeriode);
    callRpc('admin_get_reservations_trend', params).then(setReservationsTrend).catch(err => console.error('admin_get_reservations_trend:', err));
  }, [reservationsPeriode]);

  // Effet Évolution du MRR Trend
  useEffect(() => {
    const params = buildRpcParams(mrrTrendPeriode);
    callRpc('admin_get_mrr_trend', params).then(setMrrTrendData).catch(err => console.error('admin_get_mrr_trend:', err));
  }, [mrrTrendPeriode]);

  // Effets Modales
  useEffect(() => {
    if (activeModal === 'occupation') {
      const params = buildRpcParams(occupationPeriode);
      callRpc('admin_get_occupation_rate', params).then(setOccupationDetail).catch(err => console.error('admin_get_occupation_rate:', err));
    }
  }, [activeModal, occupationPeriode]);

  useEffect(() => {
    if (activeModal === 'revenue') {
      const params = buildRpcParams(revenueDetailPeriode);
      callRpc('admin_get_revenue_kpis', params).then(setRevenueDetail).catch(err => console.error('admin_get_revenue_kpis:', err));
    }
  }, [activeModal, revenueDetailPeriode]);

  useEffect(() => {
    if (activeModal === 'ltv') {
      const params = buildRpcParams(ltvDetailPeriode);
      callRpc('admin_get_ltv_funnel', params).then(setLtvDetail).catch(err => console.error('admin_get_ltv_funnel:', err));
    }
  }, [activeModal, ltvDetailPeriode]);

  useEffect(() => {
    if (activeModal === 'churn') {
      const params = buildRpcParams(churnDetailPeriode);
      callRpc('admin_get_churn_rate', params).then(setChurnDetail).catch(err => console.error('admin_get_churn_rate:', err));
    }
  }, [activeModal, churnDetailPeriode]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded-lg"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white rounded-card shadow-subtle border border-black/5 p-4"></div>
          ))}
        </div>
        <div className="h-64 bg-white rounded-card shadow-subtle border border-black/5"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-card text-red-700 flex flex-col gap-3">
        <p className="font-bold">Erreur de chargement des statistiques</p>
        <p className="text-sm">{error}</p>
        <button 
          onClick={fetchStats}
          className="w-fit px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <IconRefresh size={16} /> Réessayer
        </button>
      </div>
    );
  }

  const kpiCards = [
    {
      title: 'Terrains Actifs',
      value: stats?.terrains_actifs ?? 0,
      sub: 'Complexes validés à Dakar',
      icon: IconBuildingStore,
      color: 'bg-primary/10 text-primary',
      onClick: () => onNavigate && onNavigate('terrains')
    },
    {
      title: 'Réservations (Mois)',
      value: stats?.reservations_mois ?? 0,
      sub: `Jour: ${stats?.reservations_jour ?? 0} | Semaine: ${stats?.reservations_semaine ?? 0}`,
      icon: IconCalendarEvent,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => {}
    },
    {
      title: 'Commissions (Mois)',
      value: formatFCFA(stats?.revenus_commissions_mois),
      sub: `Jour: ${formatFCFA(stats?.revenus_commissions_jour)}`,
      icon: IconCash,
      color: 'bg-amber-50 text-amber-600',
      onClick: () => onNavigate && onNavigate('subscriptions')
    },
    {
      title: 'Taux Occupation (30j)',
      value: `${stats?.taux_occupation_moyen_30j ?? 0}%`,
      sub: 'Sur l\'ensemble des créneaux — Cliquer pour analyser',
      icon: IconChartBar,
      color: 'bg-purple-50 text-purple-600',
      onClick: () => setActiveModal('occupation')
    }
  ];

  // Calculs totaux réservations trend
  const totalResCount = reservationsTrend?.reduce((acc, curr) => acc + (curr.nb_reservations || 0), 0) ?? 0;
  const totalResMontant = reservationsTrend?.reduce((acc, curr) => acc + (curr.montant || 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-8 pb-10 min-w-0 w-full animate-in fade-in duration-300">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-primary-dark font-display">
            Vue d'ensemble Super Admin
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Métriques globales en temps réel tirées directement des RPC Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['Métrique', 'Valeur'];
              const rows = [
                ['Terrains Actifs', stats?.terrains_actifs ?? 0],
                ['Réservations Jour', stats?.reservations_jour ?? 0],
                ['Réservations Semaine', stats?.reservations_semaine ?? 0],
                ['Réservations Mois', stats?.reservations_mois ?? 0],
                ['Commissions Jour (FCFA)', stats?.revenus_commissions_jour ?? 0],
                ['Commissions Mois (FCFA)', stats?.revenus_commissions_mois ?? 0],
                ['Taux Occupation 30j (%)', stats?.taux_occupation_moyen_30j ?? 0],
              ];
              exportCSV(`admin_dashboard_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
            }}
            className="h-10 px-4 bg-white border border-black/5 hover:bg-gray-50 text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle text-gray-700"
          >
            <IconDownload size={15} /> CSV
          </button>
          <button
            onClick={() => {
              exportPDFReport({
                title: 'Bilan Super Admin — PlaygroundSpot',
                subtitle: `Dashboard Administrateur | ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
                onPopupBlocked: () => showAlert('Popups bloqués', "Veuillez autoriser les fenêtres surgissantes (popups) pour télécharger le rapport PDF.", 'error'),
                metadata: [
                  { label: 'Terrains Actifs', value: `${stats?.terrains_actifs ?? 0} terrains homologués` },
                  { label: 'Réservations (Mois)', value: `${stats?.reservations_mois ?? 0}` },
                  { label: 'Commissions (Mois)', value: formatFCFA(stats?.revenus_commissions_mois) },
                  { label: 'Taux Occupation (30j)', value: `${stats?.taux_occupation_moyen_30j ?? 0}%` }
                ],
                headers: ['Métrique', 'Jour', 'Semaine', 'Mois'],
                rows: [
                  ['Réservations', stats?.reservations_jour ?? 0, stats?.reservations_semaine ?? 0, stats?.reservations_mois ?? 0],
                  ['Commissions FCFA', formatFCFA(stats?.revenus_commissions_jour), '-', formatFCFA(stats?.revenus_commissions_mois)],
                ],
                summaryFooter: `Terrains Actifs: ${stats?.terrains_actifs ?? 0} | Occupation: ${stats?.taux_occupation_moyen_30j ?? 0}%`
              });
            }}
            className="h-10 px-4 bg-primary hover:bg-primary-dark text-white text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle"
          >
            <IconFileTypePdf size={15} /> PDF 📄
          </button>
          <button
            onClick={fetchStats}
            className="h-10 px-4 bg-white border border-black/5 hover:bg-gray-50 text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle text-primary-dark"
          >
            <IconRefresh size={16} /> Actualiser
          </button>
        </div>
      </div>

      {/* Grid KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => (
          <div
            key={idx}
            onClick={card.onClick}
            className="bg-white rounded-card shadow-subtle border border-black/5 p-5 flex flex-col justify-between gap-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{card.title}</span>
              <div className={`p-2.5 rounded-xl ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-primary-dark font-display block">{card.value}</span>
              <span className="text-[11px] text-gray-500 font-medium truncate block mt-1">{card.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── SECTION ANALYTICS : MRR, LTV, CHURN ── */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-primary-dark font-display flex items-center gap-2 uppercase tracking-wider">
          <IconReportMoney className="text-primary" size={22} />
          Performance Financière & Abonnements (MRR, LTV, Churn)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* MRR */}
          <div 
            onClick={() => setActiveModal('revenue')}
            className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">MRR (Mensuel)</span>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <IconReportMoney size={20} />
              </div>
            </div>
            <span className="text-2xl font-black text-primary-dark font-display block">
              {formatFCFA(revenueKpis?.mrr)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium block">Revenu Mensuel Récurrent 🔍</span>
          </div>

          {/* ARR */}
          <div 
            onClick={() => setActiveModal('revenue')}
            className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ARR (Annuel)</span>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <IconCash size={20} />
              </div>
            </div>
            <span className="text-2xl font-black text-primary-dark font-display block">
              {formatFCFA(revenueKpis?.arr)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium block">Projection Annuelle Récurrente 🔍</span>
          </div>

          {/* LTV Moyen */}
          <div 
            onClick={() => setActiveModal('ltv')}
            className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">LTV Moyen</span>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
                <IconChartPie size={20} />
              </div>
            </div>
            <span className="text-2xl font-black text-primary-dark font-display block">
              {formatFCFA(ltvFunnel?.ltv_moyen)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium block">Valeur moyenne générée / gérant 🔍</span>
          </div>

          {/* Taux de Churn */}
          {(() => {
            const churnPct = churn?.taux_churn_pct ?? 0;
            const churnColor = churnPct > 15
              ? 'bg-red-50 text-red-700 border-red-200'
              : churnPct > 5
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200';
            return (
              <div 
                onClick={() => setActiveModal('churn')}
                className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Taux de Churn (30j)</span>
                  <div className={`px-2.5 py-1 rounded-full border text-xs font-black ${churnColor}`}>
                    {churnPct}%
                  </div>
                </div>
                <span className="text-2xl font-black text-primary-dark font-display block">
                  {churnPct}%
                </span>
                <span className="text-[11px] text-gray-500 font-medium block truncate">
                  {churn?.abonnes_payants_actuels ?? 0} abonnés | {churn?.perdus_30j ?? churn?.perdus_periode ?? 0} résiliés 🔍
                </span>
              </div>
            );
          })()}
        </div>

        {/* Répartition MRR par Plan & Historique MRR avec Sélecteur de Période */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Répartition MRR par Plan */}
          {revenueKpis?.par_plan && revenueKpis.par_plan.length > 0 && (
            <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-4 flex flex-col justify-between">
              <h3 className="text-sm font-bold text-primary-dark font-display uppercase tracking-wider">
                Répartition du MRR par Plan d'Abonnement
              </h3>
              
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:w-1/2 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueKpis.par_plan}
                        dataKey="mrr_contribue"
                        nameKey="plan_nom"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                      >
                        {revenueKpis.par_plan.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val) => [formatFCFA(val), 'MRR']}
                        contentStyle={{ backgroundColor: '#0F2318', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full md:w-1/2 space-y-2">
                  {revenueKpis.par_plan.map((p, idx) => (
                    <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PLAN_COLORS[idx % PLAN_COLORS.length] }}></span>
                        <span className="text-xs font-bold text-gray-700 capitalize">{p.plan_nom || p.plan_id}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-primary font-display block">{formatFCFA(p.mrr_contribue)}</span>
                        <span className="text-[10px] text-gray-400 font-semibold">{p.nb_abonnes} abonné(s)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Historique Tendance MRR avec Sélecteur de Période */}
          <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-4 flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-primary-dark font-display uppercase tracking-wider flex items-center gap-2">
                <IconTrendingUp className="text-primary" size={18} />
                Évolution du MRR
              </h3>
              <PeriodSelector value={mrrTrendPeriode} onChange={setMrrTrendPeriode} />
            </div>

            <div className="h-48 w-full">
              {mrrTrendData && mrrTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mrrTrendData}>
                    <defs>
                      <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1A7A4A" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#1A7A4A" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(val) => `${val / 1000}k`} />
                    <RechartsTooltip
                      formatter={(val) => [formatFCFA(val), 'Nouveau MRR']}
                      contentStyle={{ backgroundColor: '#0F2318', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="nouveau_mrr" stroke="#1A7A4A" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMrr)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                  Aucune donnée d'historique MRR enregistrée sur cette période.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION FUNNEL D'ACTIVATION GÉRANTS AVEC SÉLECTEUR DE PÉRIODE ── */}
      {ltvFunnel?.funnel && (
        <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-primary-dark font-display flex items-center gap-2">
                <IconFilter className="text-primary" size={20} />
                Funnel d'Activation des Gérants
              </h3>
              <p className="text-xs text-gray-500">Parcours d'onboarding gérant, de l'inscription au premier abonnement payant</p>
              {(ltvFunnel.periode_debut || ltvFunnel.periode_fin) && (
                <p className="text-[11px] font-bold text-primary mt-1">
                  Sur les gérants inscrits entre {ltvFunnel.periode_debut || 'le début'} et {ltvFunnel.periode_fin || 'aujourd\'hui'}
                </p>
              )}
            </div>
            
            <PeriodSelector value={funnelPeriode} onChange={setFunnelPeriode} />
          </div>

          {(() => {
            const f = ltvFunnel.funnel;
            const total = f.total_gerants || 1;
            const steps = [
              { label: 'Gérants Inscrits', count: f.total_gerants, pct: 100, color: 'from-emerald-700 to-emerald-600' },
              { label: 'Ayant créé un terrain', count: f.avec_terrain, pct: Math.round((f.avec_terrain / total) * 100), color: 'from-emerald-600 to-emerald-500' },
              { label: 'Terrain homologué admin', count: f.avec_terrain_approuve, pct: Math.round((f.avec_terrain_approuve / total) * 100), color: 'from-emerald-500 to-emerald-400' },
              { label: 'Première réservation reçue', count: f.avec_reservation, pct: Math.round((f.avec_reservation / total) * 100), color: 'from-emerald-400 to-teal-400' },
              { label: 'Abonné à un plan payant', count: f.avec_plan_payant, pct: Math.round((f.avec_plan_payant / total) * 100), color: 'from-teal-400 to-cyan-400' },
            ];

            return (
              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-gray-700">{step.label}</span>
                      <span className="text-primary-dark font-display">
                        {step.count} gérant(s) <span className="text-gray-400 font-semibold">({step.pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-3.5 bg-gray-200/80 rounded-full overflow-hidden p-0.5 border border-gray-200/50">
                      <div
                        className={`h-full bg-gradient-to-r ${step.color} rounded-full transition-all duration-500 shadow-sm`}
                        style={{ width: `${Math.max(step.pct, 2)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── SECTION VOLUME DE RÉSERVATIONS DANS LE TEMPS (RECHARTS + SÉLECTEUR DE PÉRIODE) ── */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-primary-dark font-display flex items-center gap-2">
              <IconTrendingUp className="text-primary" size={20} />
              Volume de Réservations dans le temps
            </h3>
            <p className="text-xs text-gray-500">Évolution journalière du nombre de réservations et des montants générés</p>
          </div>
          
          <PeriodSelector value={reservationsPeriode} onChange={setReservationsPeriode} />
        </div>

        {/* Résumé chiffré */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Réservations sur la période</span>
            <span className="text-xl font-black text-primary-dark font-display">{totalResCount} rés.</span>
          </div>
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Montant total engagé</span>
            <span className="text-xl font-black text-primary font-display">{formatFCFA(totalResMontant)}</span>
          </div>
        </div>

        {reservationsTrend && reservationsTrend.length > 0 ? (
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reservationsTrend}>
                <defs>
                  <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A7A4A" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#1A7A4A" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="jour" 
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(str) => str ? str.split('-')[2] : ''}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <RechartsTooltip
                  formatter={(val, name) => [name === 'montant' ? formatFCFA(val) : val, name === 'montant' ? 'Montant' : 'Réservations']}
                  labelFormatter={(label) => `Date: ${label}`}
                  contentStyle={{ backgroundColor: '#0F2318', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="nb_reservations" name="nb_reservations" stroke="#1A7A4A" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRes)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Aucune réservation enregistrée sur cette période.</p>
        )}
      </div>

      {/* ── SECTION INSCRIPTIONS & ACQUISITION ── */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-primary-dark font-display flex items-center gap-2">
              <IconUserCheck className="text-primary" size={20} />
              Inscriptions & Acquisition
            </h3>
            <p className="text-xs text-gray-500">Nouveaux comptes créés par jour (Joueurs & Gérants)</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector value={signupsPeriod} onChange={setSignupsPeriod} />
            <a
              href="https://analytics.amplitude.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-colors cursor-pointer border border-primary/20 shrink-0"
            >
              <span>Amplitude</span>
              <IconExternalLink size={14} />
            </a>
          </div>
        </div>

        {signupsTrend && signupsTrend.length > 0 ? (
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupsTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="jour" 
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(str) => str ? str.split('-')[2] : ''}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <RechartsTooltip
                  labelFormatter={(label) => `Date: ${label}`}
                  contentStyle={{ backgroundColor: '#0F2318', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="joueurs" name="Joueurs" stackId="a" fill="#1A7A4A" radius={[0, 0, 4, 4]} />
                <Bar dataKey="gerants" name="Gérants" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Aucune donnée d'inscription enregistrée sur cette période.</p>
        )}
      </div>

      {/* Banner Homologation des Terrains (Admin Action Required) */}
      <div 
        onClick={() => onNavigate && onNavigate('terrains')}
        className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-2 border-amber-500/30 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:border-amber-500/60 transition-all shadow-sm group"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shrink-0">
            <IconClock size={24} className="animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white uppercase tracking-wider">
                GESTION & HOMOLOGATION
              </span>
              <h4 className="font-bold text-base text-primary-dark font-display">
                Homologation des Terrains
              </h4>
            </div>
            <p className="text-xs text-gray-600 font-medium mt-1">
              Consultez, révisez et validez les soumissions de terrains gérants en attente de publication.
            </p>
          </div>
        </div>
        <button className="px-5 py-2.5 bg-amber-600 group-hover:bg-amber-700 text-white font-bold text-xs rounded-xl uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 shadow-sm cursor-pointer">
          Accéder à la gestion ➔
        </button>
      </div>

      {/* ── MODALES DE DÉTAIL DES CARTES KPI ── */}

      {/* 1. Modale Taux d'occupation */}
      <KpiDetailModal
        isOpen={activeModal === 'occupation'}
        onClose={() => setActiveModal(null)}
        title="Détail du Taux d'Occupation"
        periode={occupationPeriode}
        onPeriodeChange={setOccupationPeriode}
      >
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-100 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Taux d'occupation moyen</span>
            <span className="text-4xl font-black text-purple-900 font-display">
              {occupationDetail?.taux_occupation_pct ?? 0}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
              <span className="text-xs font-semibold text-gray-500 block">Créneaux Réservés</span>
              <span className="text-lg font-bold text-primary-dark font-display">
                {occupationDetail?.creneaux_reserves ?? 0}
              </span>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
              <span className="text-xs font-semibold text-gray-500 block">Créneaux Totaux Proposés</span>
              <span className="text-lg font-bold text-primary-dark font-display">
                {occupationDetail?.creneaux_total ?? 0}
              </span>
            </div>
          </div>
        </div>
      </KpiDetailModal>

      {/* 2. Modale Revenus (MRR & ARR) */}
      <KpiDetailModal
        isOpen={activeModal === 'revenue'}
        onClose={() => setActiveModal(null)}
        title="Analyse du MRR & ARR"
        periode={revenueDetailPeriode}
        onPeriodeChange={setRevenueDetailPeriode}
      >
        <div className="space-y-4">
          {revenueDetail?.is_now === false && (
            <div className="bg-amber-50 border border-amber-200/60 text-amber-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
              <IconInfoCircle size={16} className="shrink-0 text-amber-600" />
              <span>Estimation basée sur les dates de début/fin d'abonnement.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-center space-y-1">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">MRR</span>
              <span className="text-xl font-black text-emerald-950 font-display block">
                {formatFCFA(revenueDetail?.mrr)}
              </span>
            </div>
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-center space-y-1">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">ARR</span>
              <span className="text-xl font-black text-blue-950 font-display block">
                {formatFCFA(revenueDetail?.arr)}
              </span>
            </div>
          </div>

          {revenueDetail?.par_plan && revenueDetail.par_plan.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Répartition par formule</h4>
              {revenueDetail.par_plan.map((p, idx) => (
                <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-800 capitalize block">{p.plan_nom || p.plan_id}</span>
                    <span className="text-[10px] text-gray-400 font-medium">{p.nb_abonnes} abonné(s)</span>
                  </div>
                  <span className="text-xs font-black text-primary font-display">{formatFCFA(p.mrr_contribue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </KpiDetailModal>

      {/* 3. Modale LTV */}
      <KpiDetailModal
        isOpen={activeModal === 'ltv'}
        onClose={() => setActiveModal(null)}
        title="Détail du LTV Moyen"
        periode={ltvDetailPeriode}
        onPeriodeChange={setLtvDetailPeriode}
      >
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-100 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">LTV Moyen par gérant</span>
            <span className="text-3xl font-black text-purple-900 font-display">
              {formatFCFA(ltvDetail?.ltv_moyen)}
            </span>
          </div>

          {(ltvDetail?.periode_debut || ltvDetail?.periode_fin) && (
            <div className="bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-xl text-xs font-medium flex items-center gap-2">
              <IconInfoCircle size={16} className="shrink-0 text-blue-600" />
              <span>Calculé sur la cohorte de gérants inscrits sur la période.</span>
            </div>
          )}
        </div>
      </KpiDetailModal>

      {/* 4. Modale Churn */}
      <KpiDetailModal
        isOpen={activeModal === 'churn'}
        onClose={() => setActiveModal(null)}
        title="Détail du Taux de Churn"
        periode={churnDetailPeriode}
        onPeriodeChange={setChurnDetailPeriode}
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-100 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Taux de Churn sur la période</span>
            <span className="text-4xl font-black text-red-900 font-display">
              {churnDetail?.taux_churn_pct ?? 0}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
              <span className="text-xs font-semibold text-gray-500 block">Abonnés Actuels</span>
              <span className="text-lg font-bold text-emerald-600 font-display">
                {churnDetail?.abonnes_payants_actuels ?? 0}
              </span>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
              <span className="text-xs font-semibold text-gray-500 block">Résiliations Période</span>
              <span className="text-lg font-bold text-red-600 font-display">
                {churnDetail?.perdus_periode ?? churnDetail?.perdus_30j ?? 0}
              </span>
            </div>
          </div>
        </div>
      </KpiDetailModal>

      {/* Modale d'alerte */}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};

