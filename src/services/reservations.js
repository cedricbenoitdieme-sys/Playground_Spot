import { supabase, checkRateLimit, RATE_LIMITS } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';
import { securityLog } from '../lib/securityLogger';
import { validateUUID, validateAmount, validatePhone } from '../lib/validators';
import { getCurrentUser } from './auth';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Service Réservations Sécurisé
 * Security Rules: 1.1, 1.2, 1.3, 1.5, 1.6, 2.3, 4.4, 9.1
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Récupérer les réservations (selon le rôle, le RLS filtre automatiquement).
 */
export const fetchReservations = async ({ terrainId, joueurId, statut, limit = 50 } = {}) => {
  let query = supabase
    .from('reservations')
    .select(`
      *,
      terrains ( nom, quartier, image_url, price ),
      profiles!joueur_id ( nom, tel, email, avatar ),
      paiements ( mode, statut, ref_externe )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (terrainId) query = query.eq('terrain_id', terrainId);
  if (joueurId) query = query.eq('joueur_id', joueurId);
  if (statut) query = query.eq('statut', statut);

  const { data, error } = await query;
  if (error) throw handleServiceError(error, 'fetchReservations');

  return data.map(r => ({
    ...r,
    // Aliases de compatibilité avec l'interface actuelle
    terrain: r.terrain_nom,
    player: r.joueur_nom,
    slot: `${r.date_slot} - ${r.heure_slot?.slice(0, 5)}`,
    amount: `${r.montant?.toLocaleString('fr-FR')} FCFA`,
    status: mapStatut(r.statut),
    // Détails enrichis
    terrain_detail: r.terrains,
    joueur_detail: r.profiles,
    paiement: r.paiements?.[0] || null,
  }));
};

/**
 * Récupérer une réservation par ID.
 */
export const fetchReservationById = async (reservationId) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(reservationId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      terrains ( nom, quartier, image_url, price, lat, lng ),
      profiles!joueur_id ( nom, tel, email, avatar ),
      paiements ( id, mode, statut, ref_externe, montant ),
      creneaux ( heure_debut, heure_fin, date )
    `)
    .eq('id', reservationId)
    .single();
  if (error) throw handleServiceError(error, 'fetchReservationById');
  return {
    ...data,
    terrain: data.terrain_nom,
    player: data.joueur_nom,
    status: mapStatut(data.statut),
    amount: `${data.montant?.toLocaleString('fr-FR')} FCFA`,
  };
};

/**
 * Créer une nouvelle réservation.
 * 
 * Règles: 1.1 (montant), 1.3 (auth avant transaction), 2.3 (identité session),
 *         8.1 (rate limit), 9.1 (logging)
 */
export const createReservation = async ({
  terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom,
  date_slot, heure_slot, montant, duree_heures = 1
}) => {
  // ── Règle 8.1 — Rate limiting ──
  const rl = checkRateLimit('createReservation', RATE_LIMITS.createReservation.maxRequests, RATE_LIMITS.createReservation.windowMs);
  if (!rl.allowed) {
    throw new Error(`Trop de réservations. Réessayez dans ${rl.retryAfter}s.`);
  }

  // ── Règle 1.3 — Vérifier l'authentification AVANT toute transaction ──
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('Authentification requise pour créer une réservation.');
  }

  // ── Règle 2.3 — L'identité vient de la session, PAS du body ──
  // On force joueur_id à être l'utilisateur authentifié
  const safeJoueurId = currentUser.id;

  // ── Règle 1.1 — Validation du montant ──
  const amountCheck = validateAmount(montant);
  if (!amountCheck.valid) throw new Error(amountCheck.error);

  // ── Règle 2.4 — Validation des UUIDs ──
  const terrainIdCheck = validateUUID(terrain_id);
  if (!terrainIdCheck.valid) throw new Error(`terrain_id: ${terrainIdCheck.error}`);

  if (creneau_id) {
    const creneauIdCheck = validateUUID(creneau_id);
    if (!creneauIdCheck.valid) throw new Error(`creneau_id: ${creneauIdCheck.error}`);
  }

  try {
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        terrain_id,
        joueur_id: safeJoueurId, // TOUJOURS depuis la session
        creneau_id,
        terrain_nom,
        joueur_nom,
        date_slot,
        heure_slot,
        montant,
        duree_heures,
        statut: 'en_attente',
        ticket_qr: `PS-${Date.now().toString(36).toUpperCase()}`
      })
      .select()
      .single();
    if (error) throw error;

    // ── Règle 9.1 — Logger la création ──
    securityLog.paymentInitiated(safeJoueurId, data.id, montant, 'reservation');

    return data;
  } catch (error) {
    throw handleServiceError(error, 'createReservation');
  }
};

/**
 * Mettre à jour le statut d'une réservation (confirmer, annuler, terminer).
 */
export const updateReservationStatut = async (reservationId, statut, motif_annulation = null) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(reservationId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  // ── Validation du statut ──
  const validStatuts = ['en_attente', 'confirmee', 'terminee', 'annulee'];
  if (!validStatuts.includes(statut)) {
    throw new Error('Statut de réservation invalide.');
  }

  const updates = { statut };
  if (motif_annulation) updates.motif_annulation = motif_annulation;

  const { data, error } = await supabase
    .from('reservations')
    .update(updates)
    .eq('id', reservationId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'updateReservationStatut');
  return data;
};

/**
 * Créer un paiement pour une réservation.
 * 
 * Règles: 1.1 (montant > 0), 1.2 (téléphone), 1.3 (auth), 1.5 (logging),
 *         8.1 (rate limit)
 */
export const createPaiement = async ({ reservation_id, montant, mode, numero_tel = null }) => {
  // ── Règle 8.1 — Rate limiting ──
  const rl = checkRateLimit('createPaiement', RATE_LIMITS.createPaiement.maxRequests, RATE_LIMITS.createPaiement.windowMs);
  if (!rl.allowed) {
    throw new Error(`Trop de tentatives de paiement. Réessayez dans ${rl.retryAfter}s.`);
  }

  // ── Règle 1.3 — Auth requise ──
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error('Authentification requise pour effectuer un paiement.');
  }

  // ── Règle 1.1 — Validation montant ──
  const amountCheck = validateAmount(montant);
  if (!amountCheck.valid) throw new Error(amountCheck.error);

  // ── Règle 2.4 — Validation UUID ──
  const resIdCheck = validateUUID(reservation_id);
  if (!resIdCheck.valid) throw new Error(resIdCheck.error);

  // ── Règle 1.2 — Validation téléphone si paiement mobile ──
  const mobilePaymentModes = ['wave', 'orange_money'];
  if (mobilePaymentModes.includes(mode) && numero_tel) {
    const phoneCheck = validatePhone(numero_tel);
    if (!phoneCheck.valid) throw new Error(phoneCheck.error);
    numero_tel = phoneCheck.sanitized; // Utiliser le numéro nettoyé
  }

  // ── Validation du mode de paiement ──
  const validModes = ['wave', 'orange_money', 'sur_place', 'carte'];
  if (!validModes.includes(mode)) {
    throw new Error('Mode de paiement invalide.');
  }

  try {
    const { data, error } = await supabase
      .from('paiements')
      .insert({
        reservation_id,
        montant,
        mode,
        statut: 'en_attente',
        numero_tel,
      })
      .select()
      .single();
    if (error) throw error;

    // ── Règle 1.5 — Logger la tentative de paiement (succès) ──
    securityLog.paymentInitiated(currentUser.id, reservation_id, montant, mode);

    return data;
  } catch (error) {
    // ── Règle 1.5 — Logger l'échec ──
    securityLog.paymentFailure(currentUser?.id, reservation_id, error.message);
    throw handleServiceError(error, 'createPaiement');
  }
};

/**
 * Valider un paiement.
 */
export const validatePaiement = async (paiementId, ref_externe = null) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(paiementId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase
    .from('paiements')
    .update({ statut: 'valide', ref_externe })
    .eq('id', paiementId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'validatePaiement');
  return data;
};

// ── Helpers ─────────────────────────────────────────────
const mapStatut = (statut) => {
  const map = {
    'en_attente': 'En attente',
    'confirmee': 'Confirmée',
    'terminee': 'Terminée',
    'annulee': 'Annulée',
  };
  return map[statut] || statut;
};
