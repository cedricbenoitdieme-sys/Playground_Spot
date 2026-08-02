import React, { useState, useEffect } from 'react';
import { IconCash, IconCheck, IconClock, IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { fetchGerantPayouts } from '../services/payment';

/**
 * Section Versements pour le Dashboard Gérant (Marketplace Payouts)
 * Palette et contraste corrigés pour fond clair (WCAG AA/AAA)
 */
export const GerantVersementsSection = ({ gerantId }) => {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPayouts = async () => {
    setLoading(true);
    const data = await fetchGerantPayouts(gerantId);
    setPayouts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (gerantId) {
      loadPayouts();
    } else {
      setLoading(false);
    }
  }, [gerantId]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'success':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 flex items-center gap-1.5 w-fit">
            <IconCheck className="w-3.5 h-3.5" />
            Virement effectué
          </span>
        );
      case 'failed':
      case 'cancelled':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1.5 w-fit">
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
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5 w-fit">
            <IconClock className="w-3.5 h-3.5 animate-pulse" />
            En cours...
          </span>
        );
    }
  };

  // Calculs totaux
  const totalVerser = payouts
    .filter(p => p.status === 'completed' || p.status === 'success')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalEnCours = payouts
    .filter(p => ['pending', 'processing', 'submitted', 'pending_verification'].includes(p.status))
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div 
      className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-6"
      style={{ animation: 'slideUp 0.4s 0.3s cubic-bezier(.22,1,.36,1) both' }}
    >
      {/* Header section versements */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <IconCash className="w-6 h-6 text-[#1A7A4A]" />
            Versements & Revenus Net SenePay
          </h3>
          <p className="text-xs text-gray-600 mt-1 font-medium">
            Suivi automatique des virements Wave/Orange Money suite aux réservations confirmées
          </p>
        </div>
        <button
          onClick={loadPayouts}
          className="p-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition border border-gray-200 cursor-pointer"
          title="Actualiser les versements"
        >
          <IconRefresh className="w-5 h-5" />
        </button>
      </div>

      {/* Cartes KPI Versements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TOTAL REVENUS RECUS */}
        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider block">
            TOTAL REVENUS RECUS
          </span>
          <div className="text-3xl font-extrabold text-gray-900">
            {new Intl.NumberFormat('fr-FR').format(totalVerser)} FCFA
          </div>
        </div>

        {/* VERSEMENTS EN COURS */}
        <div className="p-5 rounded-2xl bg-[#1A7A4A]/10 border border-[#1A7A4A]/30 space-y-2">
          <span className="text-xs font-semibold text-[#1A7A4A] uppercase tracking-wider block">
            VERSEMENTS EN COURS
          </span>
          <div className="text-3xl font-extrabold text-[#1A7A4A]">
            {new Intl.NumberFormat('fr-FR').format(totalEnCours)} FCFA
          </div>
        </div>
      </div>

      {/* Tableau de l'historique des Payouts */}
      <div className="bg-gray-50/50 border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm font-medium animate-pulse">
            Chargement de l'historique des versements...
          </div>
        ) : payouts.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <IconCash className="w-10 h-10 mx-auto text-[#1A7A4A]/50" />
            <p className="font-bold text-sm text-gray-900">Aucun versement enregistré pour le moment.</p>
            <p className="text-xs text-gray-600 max-w-sm mx-auto leading-relaxed">
              Dès qu'un joueur confirme sa réservation en ligne, le montant net calculé sera crédité sur votre compte Mobile Money.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-800">
              <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Réservation</th>
                  <th className="p-4">Montant Brut</th>
                  <th className="p-4">Commission</th>
                  <th className="p-4">Montant Net Reçu</th>
                  <th className="p-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs">
                {payouts.map((p) => {
                  const grossAmount = p.reservations?.montant || (p.amount ? Math.round(p.amount / (1 - (p.commission_rate_applied || 0) / 100)) : 0);
                  const commissionFcfa = Math.round(grossAmount * ((p.commission_rate_applied || 0) / 100));
                  
                  return (
                    <tr key={p.id} className="hover:bg-gray-100/60 transition">
                      <td className="p-4 font-mono text-gray-600">
                        {new Date(p.created_at).toLocaleDateString('fr-FR')} {new Date(p.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 font-semibold text-gray-900">
                        {p.reservations?.terrain_nom || 'Terrain'} ({p.reservations?.joueur_nom || 'Joueur'})
                      </td>
                      <td className="p-4 text-gray-700">
                        {grossAmount.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="p-4 text-red-600 font-medium">
                        -{commissionFcfa.toLocaleString('fr-FR')} FCFA ({p.commission_rate_applied || 0}%)
                      </td>
                      <td className="p-4 font-extrabold text-[#1A7A4A] text-sm">
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
