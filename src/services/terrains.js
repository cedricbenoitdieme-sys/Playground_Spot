import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';
import { validateUUID } from '../lib/validators';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Service Terrains Sécurisé
 * Security Rules: 3.3, 5.1, 5.3
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Règle 3.3 — Filtrer les contacts gérant pour les joueurs.
 * JAMAIS retourner les emails/téléphones complets sauf pour le propriétaire.
 */
const filterGerantContact = (terrain, currentUserRole = null, currentUserId = null) => {
  if (!terrain) return terrain;
  
  // Admin et le gérant propriétaire voient tout
  if (currentUserRole === 'admin' || currentUserId === terrain.gerant_id) {
    return terrain;
  }
  
  // Les joueurs voient le nom mais pas le contact direct
  return {
    ...terrain,
    gerant_tel: null,
    gerant_email: null,
  };
};

/**
 * Récupérer tous les terrains actifs (avec amenities et infos gérant).
 */
export const fetchTerrains = async ({ currentUserRole = null, currentUserId = null } = {}) => {
  const { data, error } = await supabase
    .from('terrains')
    .select(`
      *,
      profiles!gerant_id ( nom, tel, email ),
      terrain_amenities ( id, label, icone )
    `)
    .eq('statut', 'actif')
    .order('rating', { ascending: false });
  if (error) throw handleServiceError(error, 'fetchTerrains');
  
  return data.map(t => {
    const terrain = {
      ...t,
      gerant_nom: t.profiles?.nom || null,
      gerant_tel: t.profiles?.tel || null,
      gerant_email: t.profiles?.email || null,
      amenities: (t.terrain_amenities || []).map(a => a.label),
      // Aliases de compatibilité avec le front actuel
      name: t.nom,
      price: t.price,
      image: t.image_url,
    };
    return filterGerantContact(terrain, currentUserRole, currentUserId);
  });
};

/**
 * Récupérer un terrain par son ID (détail complet).
 */
export const fetchTerrainById = async (terrainId, { currentUserRole = null, currentUserId = null } = {}) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase
    .from('terrains')
    .select(`
      *,
      profiles!gerant_id ( nom, tel, email ),
      terrain_amenities ( id, label, icone )
    `)
    .eq('id', terrainId)
    .single();
  if (error) throw handleServiceError(error, 'fetchTerrainById');
  
  const terrain = {
    ...data,
    gerant_nom: data.profiles?.nom || null,
    gerant_tel: data.profiles?.tel || null,
    amenities: (data.terrain_amenities || []).map(a => a.label),
    name: data.nom,
    image: data.image_url,
  };
  return filterGerantContact(terrain, currentUserRole, currentUserId);
};

/**
 * Récupérer les terrains gérés par un gérant.
 */
export const fetchTerrainsByGerant = async (gerantId) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(gerantId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase
    .from('terrains')
    .select(`
      *,
      terrain_amenities ( id, label, icone )
    `)
    .eq('gerant_id', gerantId)
    .order('nom');
  if (error) throw handleServiceError(error, 'fetchTerrainsByGerant');
  
  return data.map(t => ({
    ...t,
    name: t.nom,
    image: t.image_url,
    amenities: (t.terrain_amenities || []).map(a => a.label),
  }));
};

/**
 * Récupérer les top terrains par revenus (pour dashboard admin).
 */
export const fetchTopTerrains = async (limit = 3) => {
  const { data, error } = await supabase
    .from('terrains')
    .select('*')
    .eq('statut', 'actif')
    .order('rating', { ascending: false })
    .limit(limit);
  if (error) throw handleServiceError(error, 'fetchTopTerrains');
  
  return data.map(t => ({
    ...t,
    name: t.nom,
    image: t.image_url,
  }));
};

/**
 * Mettre à jour un terrain (gérant / admin).
 */
export const updateTerrain = async (terrainId, updates) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase
    .from('terrains')
    .update(updates)
    .eq('id', terrainId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'updateTerrain');
  return data;
};

/**
 * Créer un terrain (admin).
 */
export const createTerrain = async (terrain) => {
  const { data, error } = await supabase
    .from('terrains')
    .insert(terrain)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'createTerrain');
  return data;
};

/**
 * Gérer les amenities d'un terrain.
 */
export const addAmenity = async (terrainId, label, icone = null) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase
    .from('terrain_amenities')
    .insert({ terrain_id: terrainId, label, icone })
    .select()
    .single();
  if (error) throw handleServiceError(error, 'addAmenity');
  return data;
};

export const removeAmenity = async (amenityId) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(amenityId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { error } = await supabase
    .from('terrain_amenities')
    .delete()
    .eq('id', amenityId);
  if (error) throw handleServiceError(error, 'removeAmenity');
};
