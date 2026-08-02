# Prompt — Image terrain cassée à l'étape "Créneau" du booking flow

## Contexte / diagnostic (déjà fait, confirmé en base réelle)

Bug rapporté : sur le flux de réservation, étape 1 "Créneau", l'image du
terrain "Drix terrain" ne s'affiche pas (fallback + alt text visibles).

Diagnostic mené directement sur la base réelle (via script service-role,
`scratch/check_drix_terrain.js`) :
- `terrains.image_url` pour "Drix terrain" est `NULL` — c'est l'état
  **normal et voulu** depuis le fix déjà appliqué dans `TerrainFormModal.jsx`
  (le champ legacy `image_url` n'est plus jamais écrit, cf. commentaire à sa
  ligne ~450).
- La vraie photo existe et est saine : une ligne dans `terrain_photos`
  (`storage_path = '8b00aa96-.../e23d46a5-....jpg'`, `is_principale: true`),
  le fichier est bien présent dans le bucket Storage (124 Ko, JPEG valide),
  et `createSignedUrl()` sur ce chemin fonctionne sans erreur.
- Donc : **rien à corriger côté base de données ni côté Storage/RLS** — tout
  est déjà correctement configuré et les données de ce terrain sont propres.

Le vrai bug est uniquement dans `src/components/BookingFlow.jsx:474` :

```jsx
<img src={terrain?.image} className="w-24 h-24 rounded-2xl object-cover" alt={terrain?.name} />
```

`terrain.image` est un simple alias de `terrain.image_url`
(`src/services/terrains.js` lignes 49/80/100/120 : `image: t.image_url`).
Comme ce champ est maintenant volontairement `NULL` pour tout terrain dont
la photo a été uploadée après le fix, cet `<img>` brut n'a jamais de `src`
valide → rendu cassé. C'est exactement le bug que `TerrainImage.jsx` (déjà
créé, déjà utilisé correctement dans `TerrainDetail.jsx`) a été conçu pour
éliminer — il n'a simplement pas encore été branché ici.

J'ai vérifié : **c'est le seul endroit restant dans tout `src/` qui affiche
encore une image de terrain via un `<img src={...image_url...}>` brut**
(recherche exhaustive faite). Pas d'autre occurrence à corriger ailleurs.

## Correctif attendu

Dans `src/components/BookingFlow.jsx`, remplacer la ligne 474 par le
composant déjà existant et déjà utilisé ailleurs dans le repo pour ce cas
exact :

```jsx
import { TerrainImage } from './TerrainImage'; // ajuster le chemin d'import si besoin

// ligne 474 :
<TerrainImage
  terrainId={terrain?.id}
  fallbackUrl={terrain?.image}
  alt={terrain?.name}
  className="w-24 h-24 rounded-2xl"
/>
```

`fallbackUrl={terrain?.image}` reste utile en filet de sécurité pour les
terrains anciens qui auraient encore une valeur (même expirée) dans
`image_url` — `TerrainImage` essaie d'abord `getTerrainPrincipalPhotoUrl`
(résolution dynamique correcte), et ne retombe sur `fallbackUrl` qu'en son
absence (cf. `TerrainImage.jsx` lignes 22-24).

## Contraintes

- Aucune migration SQL nécessaire (déjà vérifié : schéma, RLS storage et
  données de ce terrain sont sains).
- Ne pas toucher à `TerrainFormModal.jsx` ni `TerrainDetail.jsx` — déjà
  corrects.
- `PROMPT_FIX_TERRAIN_PHOTOS.md` (document plus ancien sur le même sujet)
  est maintenant obsolète sur presque tous ses points sauf celui-ci — ce
  fichier-ci le remplace pour ce qui reste à faire.
