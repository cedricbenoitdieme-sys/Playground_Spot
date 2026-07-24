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
  if (['admin', 'super_admin'].includes(currentUserRole) || currentUserId === terrain.gerant_id) {
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
 * N.B. Préférer le hook `useGerantTerrains(gerantId)` dans les composants React.
 */
export const fetchTerrainsByGerant = async (gerantId) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(gerantId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase.rpc('get_gerant_terrains', { p_gerant_id: gerantId });
  if (error) throw handleServiceError(error, 'fetchTerrainsByGerant');
  
  return (data?.terrains || []).map(t => ({
    ...t,
    name: t.nom,
    image: t.image_url,
    amenities: (t.amenities || []).map(a => typeof a === 'string' ? a : a.label),
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
 * Créer un terrain en attente de validation (gérant).
 * `photos` (fichiers déjà uploadés côté modal, cf. uploadTerrainPhoto) est
 * volontairement retiré du payload : ce n'est pas une colonne de `terrains`,
 * les photos vivent dans `terrain_photos` (voir saveTerrainPhotos).
 */
export const createGerantTerrain = async ({ photos, ...terrainData }) => {
  const payload = {
    ...terrainData,
    status: 'pending',
    rejection_reason: null,
    statut: terrainData.statut || 'actif',
  };

  const { data, error } = await supabase
    .from('terrains')
    .insert(payload)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'createGerantTerrain');

  if (photos && photos.length > 0) {
    await saveTerrainPhotos(data.id, photos);
  }
  return data;
};

/**
 * Mettre à jour un terrain existant (gérant).
 *
 * `currentStatus` détermine si ça redéclenche une validation admin :
 * - 'rejected' → repasse en 'pending' (resoumission, seule transition de
 *   statut qu'un gérant peut déclencher lui-même — cf. RLS terrains_update_admin_gerant).
 * - 'pending' ou 'approved' → statut inchangé. Modifier un terrain déjà
 *   approuvé (photos, description, tarif...) s'applique immédiatement,
 *   sans repasser par une revalidation admin.
 */
export const resubmitGerantTerrain = async (terrainId, { photos, ...terrainData }, currentStatus) => {
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const payload = { ...terrainData, updated_at: new Date().toISOString() };
  if (currentStatus === 'rejected') {
    payload.status = 'pending';
    payload.rejection_reason = null;
  }

  const { data, error } = await supabase
    .from('terrains')
    .update(payload)
    .eq('id', terrainId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'resubmitGerantTerrain');

  if (photos && photos.length > 0) {
    await saveTerrainPhotos(data.id, photos);
  }
  return data;
};

/**
 * Enregistre les métadonnées des photos déjà uploadées (storage_path,
 * ordre, is_principale) dans terrain_photos, après création/mise à jour
 * du terrain. `photos` : tableau de { storagePath }.
 */
export const saveTerrainPhotos = async (terrainId, photos) => {
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  if (!photos || photos.length === 0) {
    await supabase.from('terrain_photos').delete().eq('terrain_id', terrainId);
    return [];
  }

  // Nettoyage des anciennes métadonnées pour ce terrain avant ré-insertion propre
  const { error: delError } = await supabase
    .from('terrain_photos')
    .delete()
    .eq('terrain_id', terrainId);
  if (delError) throw handleServiceError(delError, 'saveTerrainPhotos:delete');

  const rows = photos.map((p, idx) => ({
    terrain_id: terrainId,
    storage_path: typeof p === 'string' ? p : p.storagePath,
    ordre: idx,
    is_principale: idx === 0,
  }));
  const { data, error } = await supabase.from('terrain_photos').insert(rows).select();
  if (error) throw handleServiceError(error, 'saveTerrainPhotos:insert');
  return data;
};

/**
 * Récupère l'URL signée de la photo principale d'un terrain (dynamiquement).
 */
export const getTerrainPrincipalPhotoUrl = async (terrainId) => {
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) return null;

  const { data: photos, error } = await supabase
    .from('terrain_photos')
    .select('storage_path')
    .eq('terrain_id', terrainId)
    .order('is_principale', { ascending: false })
    .order('ordre', { ascending: true })
    .limit(1);

  if (error || !photos || photos.length === 0) return null;

  const { data, error: signedErr } = await supabase.storage
    .from('terrain-photos')
    .createSignedUrl(photos[0].storage_path, 3600);

  if (signedErr || !data) return null;
  return data.signedUrl;
};

/**
 * Récupère les URLs signées de toutes les photos de la galerie d'un terrain.
 */
export const getTerrainGalleryPhotoUrls = async (terrainId) => {
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) return [];

  const { data: photos, error } = await supabase
    .from('terrain_photos')
    .select('id, storage_path, is_principale, ordre')
    .eq('terrain_id', terrainId)
    .order('is_principale', { ascending: false })
    .order('ordre', { ascending: true });

  if (error || !photos || photos.length === 0) return [];

  const paths = photos.map(p => p.storage_path);
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('terrain-photos')
    .createSignedUrls(paths, 3600);

  if (signedErr || !signedData) return [];

  return photos.map((p, idx) => {
    const sUrl = signedData[idx]?.signedUrl || signedData.find(s => s.path === p.storage_path)?.signedUrl || null;
    return {
      id: p.id,
      storagePath: p.storage_path,
      previewUrl: sUrl
    };
  }).filter(p => p.previewUrl !== null);
};

/**
 * Approuver ou Rejeter un terrain (admin).
 */
export const reviewTerrainAdmin = async (terrainId, decision, rejectionReason = null) => {
  const idCheck = validateUUID(terrainId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data, error } = await supabase.rpc('admin_review_terrain', {
    p_terrain_id: terrainId,
    p_decision: decision,
    p_rejection_reason: rejectionReason,
  });

  if (error) throw handleServiceError(error, 'reviewTerrainAdmin');
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

/**
 * Uploader une photo de terrain vers Supabase Storage (bucket privé
 * `terrain-photos`). Le chemin DOIT commencer par `<terrainId>/` — c'est
 * ce premier segment que les policies RLS sur storage.objects utilisent
 * (storage.foldername(name)[1]) pour vérifier que l'appelant est bien le
 * gérant propriétaire de ce terrain. `terrainId` est donc obligatoire,
 * y compris pour un terrain pas encore créé (id pré-généré côté appelant).
 *
 * Le bucket étant privé (nécessaire pour cacher les photos d'un terrain
 * 'pending' au public, cf. migration 20260723130000), on ne peut pas
 * utiliser getPublicUrl() — on retourne une URL signée pour l'aperçu
 * immédiat côté formulaire. Pas de fallback silencieux vers du base64 en
 * cas d'erreur : ça masquait justement le bug RLS qui a causé cette
 * session de debug — l'erreur doit remonter à l'appelant.
 */
export const uploadTerrainPhoto = async (fileOrBlob, terrainId) => {
  if (!terrainId) {
    throw new Error('uploadTerrainPhoto: terrainId requis');
  }

  const mimeExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
  const ext = mimeExt[fileOrBlob.type] || 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = `${terrainId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('terrain-photos')
    .upload(filePath, fileOrBlob, {
      contentType: fileOrBlob.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadError) throw handleServiceError(uploadError, 'uploadTerrainPhoto');

  const { data: signedData, error: signError } = await supabase.storage
    .from('terrain-photos')
    .createSignedUrl(filePath, 3600); // 1h, largement suffisant pour la session d'édition
  if (signError) throw handleServiceError(signError, 'uploadTerrainPhoto:sign');

  return { storagePath: filePath, previewUrl: signedData.signedUrl };
};

export {
  uploadTerrainDocument,
  fetchTerrainDocuments,
  getTerrainDocumentSignedUrl,
  deleteTerrainDocument
} from './terrainDocuments';
