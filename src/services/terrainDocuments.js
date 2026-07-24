import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * Uploader un document justificatif terrain vers Supabase Storage (bucket privé `terrain-documents`)
 * et insérer la ligne correspondante dans public.terrain_documents.
 * 
 * - Bucket privé `terrain-documents` (Max 10Mo, MIME: pdf, jpeg, png, heic)
 * - Table `public.terrain_documents` (id, terrain_id, storage_path, type_document, nom_original)
 */
export const uploadTerrainDocument = async (file, terrainId, typeDocument) => {
  if (!terrainId) throw new Error('uploadTerrainDocument: terrainId requis');
  if (!typeDocument) throw new Error('uploadTerrainDocument: typeDocument requis');

  const mimeExt = { 
    'application/pdf': 'pdf', 
    'image/jpeg': 'jpg', 
    'image/png': 'png', 
    'image/heic': 'heic' 
  };
  const ext = mimeExt[file.type] || 'pdf';
  const filePath = `${terrainId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('terrain-documents')
    .upload(filePath, file, { 
      contentType: file.type || 'application/pdf', 
      upsert: false 
    });
  if (uploadError) throw handleServiceError(uploadError, 'uploadTerrainDocument:storage');

  const { data, error } = await supabase
    .from('terrain_documents')
    .insert({ 
      terrain_id: terrainId, 
      storage_path: filePath, 
      type_document: typeDocument, 
      nom_original: file.name 
    })
    .select()
    .single();

  if (error) throw handleServiceError(error, 'uploadTerrainDocument:save');
  return data;
};

/**
 * Récupère la liste des documents d'un terrain.
 */
export const fetchTerrainDocuments = async (terrainId) => {
  if (!terrainId) return [];

  const { data, error } = await supabase
    .from('terrain_documents')
    .select('*')
    .eq('terrain_id', terrainId)
    .order('created_at', { ascending: true });

  if (error) throw handleServiceError(error, 'fetchTerrainDocuments');
  return data || [];
};

/**
 * Génère une URL signée temporaire (5 minutes = 300s) pour consulter/télécharger un document privé.
 */
export const getTerrainDocumentSignedUrl = async (storagePath) => {
  if (!storagePath) throw new Error('getTerrainDocumentSignedUrl: storagePath requis');

  const { data, error } = await supabase.storage
    .from('terrain-documents')
    .createSignedUrl(storagePath, 300);

  if (error) throw handleServiceError(error, 'getTerrainDocumentSignedUrl');
  return data.signedUrl;
};

/**
 * Supprime un document de la table `terrain_documents`.
 * Note : Le nettoyage du fichier storage est géré automatiquement par le trigger backend.
 */
export const deleteTerrainDocument = async (documentId) => {
  if (!documentId) throw new Error('deleteTerrainDocument: documentId requis');

  const { error } = await supabase
    .from('terrain_documents')
    .delete()
    .eq('id', documentId);

  if (error) throw handleServiceError(error, 'deleteTerrainDocument');
};
