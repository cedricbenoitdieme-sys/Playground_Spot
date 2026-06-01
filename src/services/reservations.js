import { supabase } from '../lib/supabase';

/**
 * Récupérer les réservations (selon le rôle, le RLS filtre automatiquement)
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
  if (error) throw error;

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
 * Récupérer une réservation par ID
 */
export const fetchReservationById = async (reservationId) => {
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
  if (error) throw error;
  return {
    ...data,
    terrain: data.terrain_nom,
    player: data.joueur_nom,
    status: mapStatut(data.statut),
    amount: `${data.montant?.toLocaleString('fr-FR')} FCFA`,
  };
};

/**
 * Créer une nouvelle réservation
 */
export const createReservation = async ({
  terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom,
  date_slot, heure_slot, montant, duree_heures = 1
}) => {
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      terrain_id,
      joueur_id,
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
  return data;
};

/**
 * Mettre à jour le statut d'une réservation (confirmer, annuler, terminer)
 */
export const updateReservationStatut = async (reservationId, statut, motif_annulation = null) => {
  const updates = { statut };
  if (motif_annulation) updates.motif_annulation = motif_annulation;

  const { data, error } = await supabase
    .from('reservations')
    .update(updates)
    .eq('id', reservationId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/**
 * Créer un paiement pour une réservation
 */
export const createPaiement = async ({ reservation_id, montant, mode, numero_tel = null }) => {
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
  return data;
};

/**
 * Valider un paiement
 */
export const validatePaiement = async (paiementId, ref_externe = null) => {
  const { data, error } = await supabase
    .from('paiements')
    .update({ statut: 'valide', ref_externe })
    .eq('id', paiementId)
    .select()
    .single();
  if (error) throw error;
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
