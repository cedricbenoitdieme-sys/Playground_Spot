import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Service Favoris
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Récupérer la liste des terrains favoris du joueur connecté.
 */
export const fetchMesFavoris = async (joueurId) => {
  if (!joueurId) return [];
  const { data, error } = await supabase
    .from('favoris')
    .select('terrain_id, terrains(*)')
    .eq('joueur_id', joueurId)
    .order('created_at', { ascending: false });

  if (error) throw handleServiceError(error, 'fetchMesFavoris');

  return (data || [])
    .filter(f => f.terrains)
    .map(f => ({
      ...f.terrains,
      name: f.terrains.nom,
      image: f.terrains.image_url,
      reservations_count: f.terrains.reservations_count || 0,
      amenities: f.terrains.amenities || [],
    }));
};

/**
 * Récupérer l'ensemble (Set) des IDs des terrains favoris du joueur.
 */
export const fetchFavorisSet = async (joueurId) => {
  if (!joueurId) return new Set();
  const { data, error } = await supabase
    .from('favoris')
    .select('terrain_id')
    .eq('joueur_id', joueurId);

  if (error) throw handleServiceError(error, 'fetchFavorisSet');
  return new Set((data || []).map(f => f.terrain_id));
};

/**
 * Ajouter ou retirer un terrain des favoris du joueur.
 */
export const toggleFavori = async (joueurId, terrainId, isCurrentlyFavori) => {
  if (!joueurId || !terrainId) return;

  if (isCurrentlyFavori) {
    const { error } = await supabase
      .from('favoris')
      .delete()
      .eq('joueur_id', joueurId)
      .eq('terrain_id', terrainId);

    if (error) throw handleServiceError(error, 'toggleFavori:delete');
  } else {
    const { error } = await supabase
      .from('favoris')
      .insert({ joueur_id: joueurId, terrain_id: terrainId });

    if (error) throw handleServiceError(error, 'toggleFavori:insert');
  }
};
