import { supabase } from '../lib/supabase';

/**
 * Récupérer tous les terrains actifs (avec amenities et infos gérant)
 */
export const fetchTerrains = async () => {
  const { data, error } = await supabase
    .from('terrains')
    .select(`
      *,
      profiles!gerant_id ( nom, tel, email ),
      terrain_amenities ( id, label, icone )
    `)
    .eq('statut', 'actif')
    .order('rating', { ascending: false });
  if (error) throw error;
  return data.map(t => ({
    ...t,
    gerant_nom: t.profiles?.nom || null,
    gerant_tel: t.profiles?.tel || null,
    gerant_email: t.profiles?.email || null,
    amenities: (t.terrain_amenities || []).map(a => a.label),
    // Aliases de compatibilité avec le front actuel
    name: t.nom,
    price: t.price,
    image: t.image_url,
  }));
};

/**
 * Récupérer un terrain par son ID (détail complet)
 */
export const fetchTerrainById = async (terrainId) => {
  const { data, error } = await supabase
    .from('terrains')
    .select(`
      *,
      profiles!gerant_id ( nom, tel, email ),
      terrain_amenities ( id, label, icone )
    `)
    .eq('id', terrainId)
    .single();
  if (error) throw error;
  return {
    ...data,
    gerant_nom: data.profiles?.nom || null,
    gerant_tel: data.profiles?.tel || null,
    amenities: (data.terrain_amenities || []).map(a => a.label),
    name: data.nom,
    image: data.image_url,
  };
};

/**
 * Récupérer les terrains gérés par un gérant
 */
export const fetchTerrainsByGerant = async (gerantId) => {
  const { data, error } = await supabase
    .from('terrains')
    .select(`
      *,
      terrain_amenities ( id, label, icone )
    `)
    .eq('gerant_id', gerantId)
    .order('nom');
  if (error) throw error;
  return data.map(t => ({
    ...t,
    name: t.nom,
    image: t.image_url,
    amenities: (t.terrain_amenities || []).map(a => a.label),
  }));
};

/**
 * Récupérer les top terrains par revenus (pour dashboard admin)
 */
export const fetchTopTerrains = async (limit = 3) => {
  // On prend les terrains triés par note avec une jointure sur les réservations terminées/confirmées
  const { data, error } = await supabase
    .from('terrains')
    .select('*')
    .eq('statut', 'actif')
    .order('rating', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(t => ({
    ...t,
    name: t.nom,
    image: t.image_url,
  }));
};

/**
 * Mettre à jour un terrain (gérant / admin)
 */
export const updateTerrain = async (terrainId, updates) => {
  const { data, error } = await supabase
    .from('terrains')
    .update(updates)
    .eq('id', terrainId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/**
 * Créer un terrain (admin)
 */
export const createTerrain = async (terrain) => {
  const { data, error } = await supabase
    .from('terrains')
    .insert(terrain)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/**
 * Gérer les amenities d'un terrain
 */
export const addAmenity = async (terrainId, label, icone = null) => {
  const { data, error } = await supabase
    .from('terrain_amenities')
    .insert({ terrain_id: terrainId, label, icone })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const removeAmenity = async (amenityId) => {
  const { error } = await supabase
    .from('terrain_amenities')
    .delete()
    .eq('id', amenityId);
  if (error) throw error;
};
