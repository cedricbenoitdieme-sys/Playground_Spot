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
  IconExternalLink
} from '@tabler/icons-react';
import { exportCSV, exportPDFReport } from '../../utils/exportReports';
import { CustomAlertModal } from '../../components/CustomAlertModal';

const formatFCFA = (amount) => {
  if (amount === null || amount === undefined) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
};

export const AdminDashboard = ({ onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Nouveaux états analytics (RPCs indépendantes)
  const [revenueKpis, setRevenueKpis] = useState(null);
  const [ltvFunnel, setLtvFunnel] = useState(null);
  const [churn, setChurn] = useState(null);
  const [signupsTrend, setSignupsTrend] = useState(null);

  // Alert modal
  const [alertConfig, setAlertConfig] = useState(null);
  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
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
    // Chargement indépendant des 4 nouvelles RPC analytics super admin
    callRpc('admin_get_revenue_kpis').then(setRevenueKpis).catch(err => console.error('admin_get_revenue_kpis:', err));
    callRpc('admin_get_ltv_funnel').then(setLtvFunnel).catch(err => console.error('admin_get_ltv_funnel:', err));
    callRpc('admin_get_churn_rate').then(setChurn).catch(err => console.error('admin_get_churn_rate:', err));
    callRpc('admin_get_signups_trend', { p_jours: 30 }).then(setSignupsTrend).catch(err => console.error('admin_get_signups_trend:', err));
  }, []);

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
      tab: 'terrains'
    },
    {
      title: 'Réservations (Mois)',
      value: stats?.reservations_mois ?? 0,
      sub: `Jour: ${stats?.reservations_jour ?? 0} | Semaine: ${stats?.reservations_semaine ?? 0}`,
      icon: IconCalendarEvent,
      color: 'bg-blue-50 text-blue-600',
      tab: 'dashboard'
    },
    {
      title: 'Commissions (Mois)',
      value: formatFCFA(stats?.revenus_commissions_mois),
      sub: `Jour: ${formatFCFA(stats?.revenus_commissions_jour)}`,
      icon: IconCash,
      color: 'bg-amber-50 text-amber-600',
      tab: 'subscriptions'
    },
    {
      title: 'Taux Occupation (30j)',
      value: `${stats?.taux_occupation_moyen_30j ?? 0}%`,
      sub: 'Sur l\'ensemble des créneaux',
      icon: IconChartBar,
      color: 'bg-purple-50 text-purple-600',
      tab: 'dashboard'
    }
  ];

  // Simulation graphique répartition des réservations (Jour / Semaine / Mois)
  const chartData = [
    { label: 'Aujourd\'hui', val: stats?.reservations_jour ?? 0 },
    { label: 'Cette Semaine', val: stats?.reservations_semaine ?? 0 },
    { label: 'Ce Mois', val: stats?.reservations_mois ?? 0 },
  ];
  const maxVal = Math.max(...chartData.map(d => d.val), 1);

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
            onClick={() => onNavigate && card.tab && onNavigate(card.tab)}
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
          <div className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">MRR (Mensuel)</span>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <IconReportMoney size={20} />
              </div>
            </div>
            <span className="text-2xl font-black text-primary-dark font-display block">
              {formatFCFA(revenueKpis?.mrr)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium block">Revenu Mensuel Récurrent</span>
          </div>

          {/* ARR */}
          <div className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ARR (Annuel)</span>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <IconCash size={20} />
              </div>
            </div>
            <span className="text-2xl font-black text-primary-dark font-display block">
              {formatFCFA(revenueKpis?.arr)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium block">Projection Annuelle Récurrente</span>
          </div>

          {/* LTV Moyen */}
          <div className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">LTV Moyen</span>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
                <IconChartPie size={20} />
              </div>
            </div>
            <span className="text-2xl font-black text-primary-dark font-display block">
              {formatFCFA(ltvFunnel?.ltv_moyen)}
            </span>
            <span className="text-[11px] text-gray-500 font-medium block">Valeur moyenne générée / gérant</span>
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
              <div className="bg-white rounded-card shadow-subtle border border-black/5 p-5 space-y-2">
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
                  {churn?.abonnes_payants_actuels ?? 0} abonnés | {churn?.perdus_30j ?? 0} résiliés (30j)
                </span>
              </div>
            );
          })()}
        </div>

        {/* Répartition MRR par Plan */}
        {revenueKpis?.par_plan && revenueKpis.par_plan.length > 0 && (
          <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-4">
            <h3 className="text-sm font-bold text-primary-dark font-display uppercase tracking-wider">
              Répartition du MRR par Plan d'Abonnement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {revenueKpis.par_plan.map((p, idx) => (
                <div key={idx} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                  <div className="flex justify-between items-center text-xs font-bold text-gray-600">
                    <span className="capitalize">{p.plan_nom || p.plan_id}</span>
                    <span className="text-primary-dark bg-primary/10 px-2 py-0.5 rounded-full text-[10px]">{p.nb_abonnes} abonné(s)</span>
                  </div>
                  <p className="text-lg font-black text-primary font-display">{formatFCFA(p.mrr_contribue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION FUNNEL D'ACTIVATION GÉRANTS ── */}
      {ltvFunnel?.funnel && (
        <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-primary-dark font-display flex items-center gap-2">
                <IconFilter className="text-primary" size={20} />
                Funnel d'Activation des Gérants
              </h3>
              <p className="text-xs text-gray-500">Parcours d'onboarding gérant, de l'inscription au premier abonnement payant</p>
            </div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
              Taux de Conversion
            </span>
          </div>

          {(() => {
            const f = ltvFunnel.funnel;
            const total = f.total_gerants || 1;
            const steps = [
              { label: 'Gérants Inscrits', count: f.total_gerants, pct: 100 },
              { label: 'Ayant créé un terrain', count: f.avec_terrain, pct: Math.round((f.avec_terrain / total) * 100) },
              { label: 'Terrain homologué admin', count: f.avec_terrain_approuve, pct: Math.round((f.avec_terrain_approuve / total) * 100) },
              { label: 'Première réservation reçue', count: f.avec_reservation, pct: Math.round((f.avec_reservation / total) * 100) },
              { label: 'Abonné à un plan payant', count: f.avec_plan_payant, pct: Math.round((f.avec_plan_payant / total) * 100) },
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
                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(step.pct, 3)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── SECTION INCRIPTIONS & TRAFIC ── */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-primary-dark font-display flex items-center gap-2">
              <IconUserCheck className="text-primary" size={20} />
              Inscriptions & Acquisition (30 derniers jours)
            </h3>
            <p className="text-xs text-gray-500">Nouveaux comptes créés par jour (Joueurs & Gérants)</p>
          </div>

          <a
            href="https://analytics.amplitude.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-colors cursor-pointer border border-primary/20 w-fit"
          >
            <span>Trafic détaillé sur Amplitude</span>
            <IconExternalLink size={14} />
          </a>
        </div>

        {signupsTrend && signupsTrend.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-primary rounded-sm"></span> Joueurs</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500 rounded-sm"></span> Gérants</span>
            </div>

            <div className="h-40 flex items-end gap-1.5 pt-4 overflow-x-auto no-scrollbar border-b border-gray-100 pb-2">
              {signupsTrend.map((d, i) => {
                const total = (d.joueurs || 0) + (d.gerants || 0);
                const maxInTrend = Math.max(...signupsTrend.map(x => (x.joueurs || 0) + (x.gerants || 0)), 1);
                const dayLabel = d.jour ? d.jour.split('-').slice(1).join('/') : '';
                return (
                  <div key={i} className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] py-1 px-2 rounded-md whitespace-nowrap z-10 pointer-events-none shadow-lg">
                      {d.jour}: {d.joueurs || 0} J, {d.gerants || 0} G
                    </div>
                    <div className="w-full bg-gray-100 rounded-t-sm flex flex-col justify-end overflow-hidden" style={{ height: '100px' }}>
                      <div className="w-full bg-amber-500 transition-all duration-300" style={{ height: `${Math.round(((d.gerants || 0) / maxInTrend) * 100)}px` }}></div>
                      <div className="w-full bg-primary transition-all duration-300" style={{ height: `${Math.round(((d.joueurs || 0) / maxInTrend) * 100)}px` }}></div>
                    </div>
                    <span className="text-[9px] text-gray-400 font-semibold">{dayLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Aucune donnée d'inscription enregistrée sur les 30 derniers jours.</p>
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

      {/* Graphique d'Activité Simple */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-primary-dark font-display flex items-center gap-2">
              <IconTrendingUp className="text-primary" size={20} />
              Volume de Réservations dans le temps
            </h3>
            <p className="text-xs text-gray-500">Comparatif des réservations validées sur différentes périodes</p>
          </div>
          <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
            Données SQL Directes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {chartData.map((item, i) => {
            const pct = Math.round((item.val / maxVal) * 100);
            return (
              <div key={i} className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-gray-500 uppercase">{item.label}</span>
                  <span className="text-primary-dark font-display text-base">{item.val} rés.</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(pct, 5)}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modale d'alerte */}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};
