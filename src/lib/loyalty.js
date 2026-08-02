/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Système de Fidélité Joueur
 * ═══════════════════════════════════════════════════════════
 */

export const getLoyaltyBadge = (rCount) => {
  const count = rCount || 0;
  if (count >= 15) return { label: 'VIP', emoji: '🥇', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  if (count >= 8)  return { label: 'Régulier', emoji: '🥈', color: 'text-primary bg-primary/5 border-primary/20' };
  if (count >= 3)  return { label: 'Actif', emoji: '🥉', color: 'text-blue-600 bg-blue-50 border-blue-200' };
  return { label: 'Nouveau', emoji: '⚽', color: 'text-gray-500 bg-gray-50 border-gray-200' };
};

export const niveau = getLoyaltyBadge;
