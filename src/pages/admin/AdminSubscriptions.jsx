import React, { useState, useEffect } from 'react';
import { callRpc } from '../../lib/supabaseRpc';
import { CustomSelect } from '../../components/CustomSelect';
import { PeriodSelector } from '../../components/PeriodSelector';
import {
  IconCreditCard, 
  IconReceipt, 
  IconFilter, 
  IconRefresh, 
  IconChevronLeft, 
  IconChevronRight,
  IconCalendar,
  IconBuildingStore
} from '@tabler/icons-react';

const formatFCFA = (amount) => {
  if (amount === null || amount === undefined) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
};

export const AdminSubscriptions = () => {
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Résumé commissions & Période
  const [commissionSummary, setCommissionSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [periode, setPeriode] = useState({ mode: 'preset', preset: '31d' });

  // Filtres Abonnements
  const [statut, setStatut] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callRpc('admin_list_subscriptions', {
        p_statut: statut || null,
        p_search: search.trim() || null,
        p_page: page,
        p_page_size: pageSize
      });

      if (data) {
        setItems(data.items || []);
        setTotalCount(data.total_count || 0);
      }
    } catch (err) {
      console.error('Erreur admin_list_subscriptions:', err);
      setError(err.message || 'Impossible de charger les abonnements.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCommissions = async () => {
    setSummaryLoading(true);
    try {
      const pPreset = periode.mode === 'preset' ? periode.preset : null;
      const pDateDebut = periode.mode === 'custom' ? periode.startDate : null;
      const pDateFin = periode.mode === 'custom' ? periode.endDate : null;
      const data = await callRpc('admin_get_commission_summary', {
        p_preset: pPreset,
        p_date_debut: pDateDebut,
        p_date_fin: pDateFin,
      });
      setCommissionSummary(data);
    } catch (err) {
      console.error('Erreur admin_get_commission_summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [statut, search, page]);

  useEffect(() => {
    fetchCommissions();
  }, [periode]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const statusBadge = (st) => {
    switch (st) {
      case 'active':
        return <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full border border-green-200">Actif</span>;
      case 'pending':
        return <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">En attente</span>;
      case 'suspended':
        return <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">Suspendu</span>;
      case 'revoked':
        return <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200">Révoqué</span>;
      case 'expired':
      default:
        return <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200">Expiré</span>;
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-10 min-w-0 w-full animate-in fade-in duration-300">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-primary-dark font-display">
            Abonnements & Commissions
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Suivi des frais SaaS gérants et calcul automatique des commissions de réservation.
          </p>
        </div>
        <button
          onClick={() => { fetchSubscriptions(); fetchCommissions(); }}
          className="h-10 px-4 bg-white border border-black/5 hover:bg-gray-50 text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle text-primary-dark"
        >
          <IconRefresh size={16} /> Actualiser
        </button>
      </div>

      {/* Résumé des Commissions Plateforme */}
      <div className="bg-gradient-to-br from-[#0F2318] to-[#122A1D] rounded-card p-6 text-white shadow-xl space-y-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/10 text-primary">
              <IconReceipt size={28} />
            </div>
            <div>
              <span className="text-xs font-bold text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20 inline-block mb-1">
                Période : {commissionSummary?.periode_debut || 'Ce mois'} au {commissionSummary?.periode_fin || 'Aujourd\'hui'}
              </span>
              <h3 className="text-2xl font-bold font-display">
                Commissions Totales : {formatFCFA(commissionSummary?.total_commission)}
              </h3>
            </div>
          </div>

          <PeriodSelector value={periode} onChange={setPeriode} />
        </div>

        <p className="text-xs text-white/60">
          Taux moyen effectif : {commissionSummary?.taux_moyen_effectif ?? 0}% (calculé par plan de chaque gérant, pas un taux fixe).
          {commissionSummary?.nb_paiements_sans_commission > 0 && (
            <> {commissionSummary.nb_paiements_sans_commission} paiement(s) de cette période n'ont pas de commission calculée (antérieurs au correctif).</>
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
          <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Volume Total Réservé</span>
            <span className="text-lg font-bold text-secondary font-display">{formatFCFA(commissionSummary?.total_montant_reservations)}</span>
          </div>
          <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Nombre de Réservations</span>
            <span className="text-lg font-bold text-primary font-display">{commissionSummary?.nb_reservations ?? 0} rés.</span>
          </div>
        </div>
      </div>

      {/* Barre de Filtres Abonnements */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Rechercher par nom de gérant..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-44">
            <CustomSelect
              value={statut}
              onChange={(val) => { setStatut(val); setPage(1); }}
              options={[
                { value: '', label: 'Tous les statuts' },
                { value: 'pending', label: 'En attente' },
                { value: 'active', label: 'Actif' },
                { value: 'suspended', label: 'Suspendu' },
                { value: 'revoked', label: 'Révoqué' },
                { value: 'expired', label: 'Expiré' }
              ]}
              placeholder="Tous les statuts"
            />
          </div>
        </div>
      </div>

      {/* Table des Abonnements */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Chargement des abonnements...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun abonnement enregistré pour le moment.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/50">
                  <th className="py-3.5 px-4">Gérant</th>
                  <th className="py-3.5 px-4">Formule</th>
                  <th className="py-3.5 px-4">Cycle</th>
                  <th className="py-3.5 px-4">Prix</th>
                  <th className="py-3.5 px-4">Statut</th>
                  <th className="py-3.5 px-4">Échéance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {items.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      {sub.gerant_nom}
                      <div className="text-xs text-gray-400 font-normal">{sub.gerant_email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-primary-dark">
                      {sub.plan_nom}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-gray-600 uppercase">
                      {sub.cycle || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800">
                      {formatFCFA(sub.cycle === 'annuel' ? sub.prix_annuel : sub.prix_mensuel)}
                    </td>
                    <td className="py-3.5 px-4">
                      {statusBadge(sub.status)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-gray-600">
                      {sub.date_fin || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">Page {page} sur {totalPages} ({totalCount} abonnements)</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >
                <IconChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
