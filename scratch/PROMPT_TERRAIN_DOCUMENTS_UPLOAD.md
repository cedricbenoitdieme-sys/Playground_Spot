# Prompt — Upload de documents justificatifs terrain (PlaygroundSpot)

## Contexte

PlaygroundSpot (Supabase + RLS, React/Vite). Un gérant peut créer une fiche
terrain (`public.terrains`, colonne `status`: pending/approved/rejected)
via `src/components/TerrainFormModal.jsx`, rendue par
`src/pages/GerantTerrain.jsx`. Ce composant reçoit déjà une prop
`terrainId` (UUID pré-généré côté client via `crypto.randomUUID()` avant
même la création de la ligne `terrains` — voir `openCreateModal` dans
`GerantTerrain.jsx` — nécessaire pour que le chemin de stockage soit
disponible dès le début de l'édition).

Il existe déjà un système équivalent pour les **photos** (6 max, bucket
`terrain-photos`, table `public.terrain_photos`, service
`src/services/terrains.js` : `uploadTerrainPhoto`, `saveTerrainPhotos`) —
inspire-toi de ce pattern, mais **ne le duplique pas bêtement** : les
documents ont des besoins différents (voir plus bas).

Backend déjà en place pour CETTE tâche (migration
`supabase/migrations/20260723160000_terrain_documents.sql`, déjà
appliquée) :
- Bucket Storage **privé** `terrain-documents` (jamais public, même terrain
  approuvé — contrairement aux photos). MIME acceptés : `application/pdf`,
  `image/jpeg`, `image/png`, `image/heic`. Max 10 Mo/fichier.
- Table `public.terrain_documents` : `id`, `terrain_id`, `storage_path`,
  `type_document` (enum `piece_identite` | `justificatif_propriete` |
  `autre`), `nom_original`, `created_at`.
- RLS : SELECT/INSERT/DELETE réservés au gérant propriétaire du terrain et
  aux admins — **jamais de lecture publique, à aucun moment**, y compris
  après approbation du terrain (différence clé avec les photos).
- Même mécanisme "dossier brouillon" que les photos : upload autorisé dans
  `<terrainId>/...` même si le terrain n'existe pas encore en base (id
  pré-généré côté client, non devinable).
- Limite de 5 documents par terrain appliquée côté backend (trigger).
- Chemin de stockage : `<terrain_id>/<uuid>.<ext>` (même convention que
  les photos).

## Différences volontaires avec le flow photos existant (à respecter)

1. **Pas de recadrage** (`ImageCropperModal`) — ça n'a aucun sens pour un
   PDF, et pas nécessaire pour une photo de pièce d'identité. Upload direct
   du fichier sélectionné.
2. **Upload + sauvegarde immédiate**, pas de buffering jusqu'à la
   soumission finale du formulaire (contrairement aux photos qui
   attendent `handleSubmitForm`). Dès que le fichier est sélectionné et
   uploadé avec succès, insérer directement la ligne dans
   `terrain_documents` — plus simple, pas de risque d'orphelins si
   l'utilisateur ferme la modale sans soumettre le reste du formulaire.
3. **Un type de document doit être choisi** avant/pendant l'upload
   (`piece_identite` / `justificatif_propriete` / `autre`) — select ou
   boutons radio à côté du bouton d'upload.
4. **Ces documents ne sont JAMAIS affichés publiquement nulle part** —
   contrairement aux photos, aucune vue joueur/découverte ne doit jamais
   tenter d'y accéder. Réservé aux écrans gérant (sa propre fiche) et admin
   (écran de validation).

## Ce qu'il faut construire

### 1. Service (`src/services/terrains.js` ou nouveau `src/services/terrainDocuments.js`)

```js
export const uploadTerrainDocument = async (file, terrainId, typeDocument) => {
  if (!terrainId) throw new Error('uploadTerrainDocument: terrainId requis');
  const mimeExt = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' };
  const ext = mimeExt[file.type] || 'pdf';
  const filePath = `${terrainId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('terrain-documents')
    .upload(filePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw handleServiceError(uploadError, 'uploadTerrainDocument');

  const { data, error } = await supabase
    .from('terrain_documents')
    .insert({ terrain_id: terrainId, storage_path: filePath, type_document: typeDocument, nom_original: file.name })
    .select()
    .single();
  if (error) throw handleServiceError(error, 'uploadTerrainDocument:save');
  return data;
};

export const fetchTerrainDocuments = async (terrainId) => {
  const { data, error } = await supabase
    .from('terrain_documents')
    .select('*')
    .eq('terrain_id', terrainId)
    .order('created_at', { ascending: true });
  if (error) throw handleServiceError(error, 'fetchTerrainDocuments');
  return data;
};

export const getTerrainDocumentSignedUrl = async (storagePath) => {
  const { data, error } = await supabase.storage
    .from('terrain-documents')
    .createSignedUrl(storagePath, 300); // 5 min suffit pour un téléchargement/consultation ponctuelle
  if (error) throw handleServiceError(error, 'getTerrainDocumentSignedUrl');
  return data.signedUrl;
};

export const deleteTerrainDocument = async (documentId) => {
  const { error } = await supabase.from('terrain_documents').delete().eq('id', documentId);
  if (error) throw handleServiceError(error, 'deleteTerrainDocument');
  // Le nettoyage du fichier storage est géré par un trigger backend
  // (cleanup_terrain_document_storage) — pas besoin d'appel storage.remove() ici.
};
```

Utilise le pattern d'erreur `handleServiceError` déjà en place
(`src/lib/errorHandler.js`), comme pour les photos.

### 2. UI côté gérant (`TerrainFormModal.jsx` ou nouvelle section dédiée)

Ajoute une section "Documents justificatifs" (distincte visuellement de la
galerie photos) :
- Select/radio pour choisir le type de document.
- Zone d'upload (input file, `accept="application/pdf,image/jpeg,image/png,image/heic"`).
- Liste des documents déjà uploadés pour ce terrain (nom original, type,
  bouton supprimer) — récupérée via `fetchTerrainDocuments(terrainId)` au
  montage si `terrainId` existe déjà (mode édition) ou vide en création.
- Pas de preview inline nécessaire pour un PDF (juste une icône +
  nom de fichier) ; pour une image, preview optionnelle via
  `getTerrainDocumentSignedUrl`.
- Gérer le cas "5 documents max" (désactiver l'upload, message clair) —
  le backend le bloque déjà, mais un message front évite un aller-retour
  réseau inutile.

### 3. UI côté admin (écran de validation terrain, `src/pages/admin/AdminTerrains.jsx` ou équivalent où `admin_review_terrain`/`reviewTerrainAdmin` est appelé)

Avant de pouvoir approuver/refuser un terrain, l'admin doit pouvoir
consulter les documents soumis :
- Charger `fetchTerrainDocuments(terrain.id)` pour le terrain en cours de
  revue.
- Afficher la liste avec un lien "Voir/Télécharger" par document, qui
  appelle `getTerrainDocumentSignedUrl(doc.storage_path)` à la demande
  (pas au chargement de la liste — génère l'URL signée seulement au clic,
  pour ne pas gaspiller d'appels storage si l'admin ne consulte pas tout).

## Contraintes

- Aucune nouvelle migration SQL nécessaire — tout est déjà en place
  (`supabase/migrations/20260723160000_terrain_documents.sql`).
- Ne jamais tenter d'afficher un document via une URL publique/stable —
  le bucket est privé, systématiquement `createSignedUrl()` à la demande.
- Ne pas dupliquer la logique de crop/compression des photos ici, elle ne
  s'applique pas aux documents.
- Respecter le style visuel déjà en place dans `TerrainFormModal.jsx`
  (Tailwind, mêmes classes de boutons/cartes que la section photos) pour
  la cohérence.
