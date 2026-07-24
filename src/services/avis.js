import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * Récupérer les avis réels d'un terrain (avec le nom du joueur).
 */
export const fetchAvisByTerrain = async (terrainId) => {
  const { data, error } = await supabase
    .from('avis')
    .select('id, note, commentaire, created_at, profiles!joueur_id ( nom )')
    .eq('terrain_id', terrainId)
    .order('created_at', { ascending: false });
  if (error) throw handleServiceError(error, 'fetchAvisByTerrain');

  return (data || []).map(a => ({
    id: a.id,
    name: a.profiles?.nom || 'Joueur',
    initials: (a.profiles?.nom || 'J').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
    rating: a.note,
    text: a.commentaire,
    date: new Date(a.created_at).toLocaleDateString('fr-FR'),
  }));
};

/**
 * Trouve une réservation "terminée" du joueur sur ce terrain qui n'a pas encore
 * d'avis — la RLS (avis_insert_joueur) exige un reservation_id lié à une
 * réservation terminée appartenant au joueur, donc on ne peut pas laisser un
 * avis "à la volée" sans réservation qualifiante.
 */
export const fetchReviewableReservation = async (joueurId, terrainId) => {
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('id')
    .eq('joueur_id', joueurId)
    .eq('terrain_id', terrainId)
    .eq('statut', 'terminee')
    .order('date_slot', { ascending: false });
  if (error) throw handleServiceError(error, 'fetchReviewableReservation');
  if (!reservations || reservations.length === 0) return null;

  const { data: existingAvis } = await supabase
    .from('avis')
    .select('reservation_id')
    .in('reservation_id', reservations.map(r => r.id));
  const reviewedIds = new Set((existingAvis || []).map(a => a.reservation_id));
  const reviewable = reservations.find(r => !reviewedIds.has(r.id));
  return reviewable ? reviewable.id : null;
};

/**
 * Publier un avis lié à une réservation terminée.
 */
export const submitAvis = async ({ reservation_id, joueur_id, terrain_id, note, commentaire }) => {
  const { data, error } = await supabase
    .from('avis')
    .insert({ reservation_id, joueur_id, terrain_id, note, commentaire })
    .select()
    .single();
  if (error) throw handleServiceError(error, 'submitAvis');
  return data;
};
