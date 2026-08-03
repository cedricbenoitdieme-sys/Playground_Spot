/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Configuration des Feature Flags de Paiement
 * ═══════════════════════════════════════════════════════════
 * 
 * VITE_PAIEMENT_RESERVATION_ACTIF :
 *   - 'true' : Active le paiement mobile en ligne (Wave / Orange Money via UnitechPay) pour la réservation de terrains par les joueurs.
 *   - 'false' ou absente : Active la modale/bannière de suspension et désactive le paiement en ligne par défaut.
 * 
 * VITE_PAIEMENT_ABONNEMENT_ACTIF :
 *   - 'true' : Active le paiement des abonnements & boosts gérants.
 *   - 'false' ou absente : Affiche la modale de suspension et le contact WhatsApp support commercial par défaut.
 */

export const IS_PAIEMENT_RESERVATION_ACTIF = import.meta.env.VITE_PAIEMENT_RESERVATION_ACTIF !== 'false';
export const IS_PAIEMENT_ABONNEMENT_ACTIF = import.meta.env.VITE_PAIEMENT_ABONNEMENT_ACTIF !== 'false';

export const PAYMENT_FLAGS = {
  isReservationActif: IS_PAIEMENT_RESERVATION_ACTIF,
  isAbonnementActif: IS_PAIEMENT_ABONNEMENT_ACTIF,
};
