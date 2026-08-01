import React, { useState, useEffect } from 'react';
import { IconCash, IconCheck, IconClock, IconAlertCircle, IconRefresh, IconArrowUpRight } from '@tabler/icons-react';
import { fetchGerantPayouts } from '../services/senepay';

/**
 * Section Versements pour le Dashboard Gérant (SenePay Marketplace Payouts)
 */
export const GerantVersementsSection = ({ gerantId }) => {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPayouts = async () => {
    setLoading(true);
    const data = await fetchGerantPayouts(gerantId);
    setPayouts(data);
    setLoading(false);
  };

  useEffect(() => {
    if (gerantId) {
      loadPayouts();
    }
  }, [gerantId]);

  // Statuts SenePay : pending, processing, submitted, pending_verification → "en cours"
  // ne JAMAIS afficher "échoué" tant que le webhook n'a pas confirmé failed
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'success':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/30 flex items-center gap-1.5 w-fit">
            <IconCheck className="w-3.5 h-3.5" />
            Virement effectué
          </span>
        );
      case 'failed':
      case 'cancelled':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1.5 w-fit">
            <IconAlertCircle className="w-3.5 h-3.5" />
            Échoué
          </span>
        );
      case 'pending':
      case 'processing':
      case 'submitted':
      case 'pending_verification':
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 w-fit">
            <IconClock className="w-3.5 h-3.5 animate-pulse" />
            En cours...
          </span>
        );
    }
  };

  // Calculs totaux
  const totalVerser = payouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalEnCours = payouts
    .filter(p => ['pending', 'processing', 'submitted', 'pending_verification'].includes(p.status))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header section versements */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <IconCash className="w-6 h-6 text-[#1A7A4A]" />
            Versements & Revenus Net SenePay
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Suivi automatique des virements Wave/Orange Money suite aux réservations confirmées
          </p>
        </div>
        <button
          onClick={loadPayouts}
          className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
          title="Actualiser les versements"
        >
          <IconRefresh className="w-5 h-5" />
        </button>
      </div>

      {/* Cartes KPI Versements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-white/5 border border-white/10 space-y-2">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider block">Total Revenus Reçus</span>
          <div className="text-3xl font-extrabold text-[#E8DCC8]">
            {new Intl.NumberFormat('fr-FR').format(totalVerser)} FCFA
          </div>
        </div>

        <div className="p-5 rounded-3xl bg-[#1A7A4A]/10 border border-[#1A7A4A]/30 space-y-2">
          <span className="text-xs font-semibold text-[#1A7A4A] uppercase tracking-wider block">Versements En Cours</span>
          <div className="text-3xl font-extrabold text-white">
            {new Intl.NumberFormat('fr-FR').format(totalEnCours)} FCFA
          </div>
        </div>
      </div>

      {/* Tableau de l'historique des Payouts */}
      <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-white/40 text-sm font-medium animate-pulse">
            Chargement de l'historique des versements...
          </div>
        ) : payouts.length === 0 ? (
          <div className="p-12 text-center text-white/50 space-y-2">
            <IconCash className="w-10 h-10 mx-auto opacity-30 text-[#1A7A4A]" />
            <p className="font-semibold text-sm">Aucun versement enregistré pour le moment.</p>
            <p className="text-xs text-white/40 max-w-sm mx-auto">
              Dès qu'un joueur confirme sa réservation en ligne, le montant net calculé sera crédité sur votre compte Mobile Money.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white">
              <thead className="bg-white/5 text-xs text-white/50 uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Réservation</th>
                  <th className="p-4">Montant Brut</th>
                  <th className="p-4">Commission</th>
                  <th className="p-4">Montant Net Reçu</th>
                  <th className="p-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {payouts.map((p) => {
                  const grossAmount = p.reservations?.montant || (p.amount ? Math.round(p.amount / (1 - (p.commission_rate_applied || 0) / 100)) : 0);
                  const commissionFcfa = Math.round(grossAmount * ((p.commission_rate_applied || 0) / 100));
                  
                  return (
                    <tr key={p.id} className="hover:bg-white/5 transition">
                      <td className="p-4 font-mono text-white/70">
                        {new Date(p.created_at).toLocaleDateString('fr-FR')} {new Date(p.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 font-semibold">
                        {p.reservations?.terrain_nom || 'Terrain'} ({p.reservations?.joueur_nom || 'Joueur'})
                      </td>
                      <td className="p-4 text-white/70">
                        {grossAmount.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="p-4 text-red-400/90 font-medium">
                        -{commissionFcfa.toLocaleString('fr-FR')} FCFA ({p.commission_rate_applied}%)
                      </td>
                      <td className="p-4 font-extrabold text-[#E8DCC8] text-sm">
                        {p.amount?.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="p-4">
                        {getStatusBadge(p.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
