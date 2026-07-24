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
  IconDownload
} from '@tabler/icons-react';
import { exportCSV, exportPDFReport } from '../../utils/exportReports';

const formatFCFA = (amount) => {
  if (amount === null || amount === undefined) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
};

export const AdminDashboard = ({ onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

    </div>
  );
};
