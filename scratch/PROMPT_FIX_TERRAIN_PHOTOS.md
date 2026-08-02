> **⚠️ Statut (2026-08-02) : entièrement fait, sauf un point.** Vérifié dans
> le code actuel : `TerrainImage.jsx` + `getTerrainPrincipalPhotoUrl()` /
> `getTerrainGalleryPhotoUrls()` (`services/terrains.js`) existent déjà,
> `TerrainFormModal.jsx` ne write plus jamais d'URL signée dans `image_url`
> (commentaire explicite ligne ~450), charge déjà les photos existantes en
> mode édition via `getTerrainGalleryPhotoUrls` (~ligne 291), et
> `TerrainDetail.jsx` utilise déjà `<TerrainImage>`. Les points 1, 2, 4 et 5
> ci-dessous sont **obsolètes** (déjà appliqués). Il reste **un seul**
> endroit non migré, découvert en diagnostiquant le bug réel "Drix
> terrain" : voir `PROMPT_FIX_BOOKING_FLOW_TERRAIN_IMAGE.md` (court, à jour,
> c'est le seul document à suivre maintenant pour ce sujet).

# Prompt — Fix affichage photos terrain (PlaygroundSpot)

## Contexte

PlaygroundSpot (Supabase + RLS). Un gérant peut créer une fiche terrain avec
jusqu'à 6 photos, uploadées vers le bucket Supabase Storage **privé**
`terrain-photos` (privé volontairement : les photos d'un terrain `pending`
ne doivent pas être visibles publiquement, seulement au gérant propriétaire
et aux admins — RLS sur `storage.objects` et sur la table `public.terrain_photos`).

Le chemin de stockage est `<terrain_id>/<uuid>.<ext>`. Les métadonnées
(chemin, ordre, photo principale) sont dans `public.terrain_photos`
(colonnes : `id`, `terrain_id`, `storage_path`, `ordre`, `is_principale`).
**Il n'y a jamais d'URL publique stable pour ces photos** — le bucket étant
privé, il faut appeler `supabase.storage.from('terrain-photos').createSignedUrl(path, expiresIn)`
à chaque fois qu'on veut afficher une image, et cette URL **expire** (le
code existant utilise 3600s = 1h).

`terrains.image_url` est un ancien champ TEXT hérité (avant ce système
multi-photos), toujours présent dans le schéma.

## Bug actuel (à corriger)

Dans `src/components/TerrainFormModal.jsx`, la fonction `handleSubmitForm`
calcule :

```js
const firstPhoto = formData.photos[0];
const mainImageUrl = typeof firstPhoto === 'string'
  ? firstPhoto
  : (firstPhoto?.previewUrl || firstPhoto?.storagePath || '');
...
image_url: mainImageUrl,
```

`firstPhoto.previewUrl` est l'URL SIGNÉE renvoyée par `uploadTerrainPhoto()`
(dans `src/services/terrains.js`), valable 1h seulement. Ce code la stocke
en dur dans `terrains.image_url` comme si c'était une URL permanente.
Résultat : l'image du terrain s'affiche correctement pendant ~1h après
l'upload, puis se casse silencieusement (URL expirée → 400/403) pour
toujours. C'est un bug de fond, pas un cas limite rare.

`terrain.photos` (utilisé comme fallback d'affichage dans plusieurs
endroits, ex. `GerantTerrain.jsx` ligne ~277 `terrain.image_url ||
(terrain.photos && terrain.photos[0]) || 'https://images.unsplash.com/...'`)
n'existe pas non plus comme colonne sur `terrains` — c'est toujours
`undefined`, et le fallback Unsplash codé en dur est une fausse photo
affichée comme si elle appartenait au terrain (à supprimer, c'est
trompeur — cf. l'esprit du nettoyage de données mock déjà fait sur ce
projet, aucune fausse donnée ne doit se substituer silencieusement à une
vraie).

## Fix attendu

1. **Ne plus jamais écrire une URL signée dans `terrains.image_url`.**
   Le plus simple et le plus honnête : arrêter d'envoyer `image_url` du
   tout depuis `TerrainFormModal.jsx` (laisser `NULL` en base — il n'y a
   pas de substitut permanent valable tant que le bucket est privé).

2. **Résoudre l'image affichée dynamiquement, à chaque rendu, via
   `terrain_photos`** plutôt que de compter sur un champ stocké. Créer un
   petit helper dans `src/services/terrains.js`, par exemple :
   ```js
   export const getTerrainPrincipalPhotoUrl = async (terrainId) => {
     const { data: photos } = await supabase
       .from('terrain_photos')
       .select('storage_path')
       .eq('terrain_id', terrainId)
       .order('is_principale', { ascending: false })
       .order('ordre', { ascending: true })
       .limit(1);
     if (!photos || photos.length === 0) return null;
     const { data, error } = await supabase.storage
       .from('terrain-photos')
       .createSignedUrl(photos[0].storage_path, 3600);
     if (error) return null;
     return data.signedUrl;
   };
   ```
   Idem pour la galerie complète si besoin (toutes les photos d'un
   terrain, pas juste la principale) — même requête sans `.limit(1)`,
   puis `createSignedUrls()` (pluriel, batch) pour éviter N appels réseau.

3. **Brancher ce helper partout où une photo de terrain doit s'afficher
   côté gérant** — au minimum :
   - `src/pages/GerantTerrain.jsx` : vue "Pending" (résumé de la fiche
     soumise, ~ligne 275) et vue "Approved" (hero image, ~ligne 354) —
     remplacer `terrain.image_url` par une image chargée via ce helper
     (state + `useEffect` déclenché sur `terrain.id`), avec un placeholder
     pendant le chargement et un fallback visuel neutre (pas une fausse
     photo Unsplash) si aucune photo n'existe encore.
   - Supprimer le fallback `'https://images.unsplash.com/...'` codé en dur.

4. **Charger les photos existantes en mode édition.** Actuellement
   `TerrainFormModal.jsx` (`useEffect` sur `initialData`) démarre toujours
   la galerie vide, même en édition d'un terrain qui a déjà des photos —
   commentaire explicite dans le code à ce sujet. À corriger : au montage
   de la modale en mode édition (`initialData` fourni), charger les lignes
   `terrain_photos` existantes pour ce terrain, générer une URL signée pour
   chacune (`createSignedUrls`, batch), et pré-remplir `formData.photos`
   avec `{ id, storagePath, previewUrl }` (ajouter un champ `id` pour
   distinguer les photos déjà en base des nouvelles à uploader — la
   sauvegarde différenciera un `UPDATE`/no-op pour les existantes et un
   `INSERT` pour les nouvelles, au lieu du comportement actuel qui
   réinsère tout sans jamais supprimer les anciennes lignes).

5. **Nettoyer le payload envoyé à `photos` dans `handleSubmitForm`** :
   ```js
   photos: formData.photos.map(p => ({
     storagePath: typeof p === 'string' ? p : (p?.storagePath || p?.previewUrl || String(p))
   }))
   ```
   Le fallback `p?.previewUrl` ici stockerait une URL signée complète comme
   si c'était un `storage_path` — incohérent avec `saveTerrainPhotos()`
   côté service (`src/services/terrains.js`) qui attend un vrai chemin de
   bucket. Simplifier : chaque élément de `formData.photos` a toujours un
   `storagePath` valide dès qu'il vient de `uploadTerrainPhoto()` — pas
   besoin de ce fallback défensif qui masque un état invalide au lieu de le
   signaler.

## Contraintes

- Aucune migration SQL nécessaire pour ce fix — tables/policies déjà en
  place (`public.terrain_photos`, RLS sur `storage.objects` et sur
  `terrain_photos`, cf. migrations `20260723130000` et `20260723150000`).
- Respecter le style/pattern d'erreur déjà en place dans
  `src/lib/errorHandler.js` (`handleServiceError`) pour tout nouvel appel
  Supabase.
- Ne pas réintroduire de fallback silencieux vers une fausse image ou une
  donnée simulée en cas d'erreur — laisser l'échec visible (placeholder
  "photo indisponible" acceptable, mais pas une photo Unsplash générique
  qui ferait croire à une vraie photo du terrain).
