import { supabase } from './supabase';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Système de Rang Fidélité (Configurable & Calcule)
 * ═══════════════════════════════════════════════════════════
 */

export const DEFAULT_TIERS = [
  { code: 'debutant', label: 'Débutant', emoji: '🌱', seuil_matchs: 0, color: 'text-gray-500 bg-gray-50 border-gray-200' },
  { code: 'regulier', label: 'Régulier', emoji: '⚽', seuil_matchs: 5, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { code: 'confirme', label: 'Confirmé', emoji: '🔥', seuil_matchs: 15, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { code: 'vip_argent', label: 'VIP Argent', emoji: '🥈', seuil_matchs: 30, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { code: 'vip_or', label: 'VIP Or', emoji: '🥇', seuil_matchs: 50, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
];

const TIER_COLORS = {
  debutant: 'text-gray-500 bg-gray-50 border-gray-200',
  regulier: 'text-blue-600 bg-blue-50 border-blue-200',
  confirme: 'text-amber-600 bg-amber-50 border-amber-200',
  vip_argent: 'text-purple-600 bg-purple-50 border-purple-200',
  vip_or: 'text-emerald-600 bg-emerald-50 border-emerald-200',
};

/**
 * Récupérer les paliers de fidélité depuis la base de données.
 */
export const fetchLoyaltyTiers = async () => {
  try {
    const { data, error } = await supabase
      .from('loyalty_tiers')
      .select('code, label, emoji, seuil_matchs')
      .order('seuil_matchs', { ascending: true });

    if (error || !data || data.length === 0) {
      return DEFAULT_TIERS;
    }
    return data.map(t => ({
      ...t,
      color: TIER_COLORS[t.code] || 'text-primary bg-primary/5 border-primary/20',
    }));
  } catch (err) {
    console.error('Erreur fetchLoyaltyTiers:', err);
    return DEFAULT_TIERS;
  }
};

/**
 * Calculer le rang et la progression client-side.
 */
export const getRangClient = (matchsJoues = 0, tiers = DEFAULT_TIERS) => {
  const activeTiers = (tiers && tiers.length > 0) ? tiers : DEFAULT_TIERS;
  const sorted = [...activeTiers].sort((a, b) => a.seuil_matchs - b.seuil_matchs);
  const count = matchsJoues || 0;

  let current = sorted[0];
  let next = null;

  for (let i = 0; i < sorted.length; i++) {
    if (count >= sorted[i].seuil_matchs) {
      current = sorted[i];
      next = sorted[i + 1] || null;
    }
  }

  const color = TIER_COLORS[current.code] || current.color || 'text-primary bg-primary/5 border-primary/20';

  return {
    ...current,
    color,
    matchs_joues: count,
    prochain_palier: next ? {
      ...next,
      matchs_restants: next.seuil_matchs - count,
    } : null,
  };
};

export const niveau = (matchsJoues, tiers) => getRangClient(matchsJoues, tiers);
export const getLoyaltyBadge = niveau;
