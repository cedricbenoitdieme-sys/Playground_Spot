# Prompt — Localisation terrain (Leaflet) : tuiles conformes + "ma position"

## Contexte

Backend en place (migration `20260725150000_terrains_postgis_geolocation.sql`) :
- `public.terrains.geog` (PostGIS, indexé GIST) tenu à jour automatiquement
  dès que `lat`/`lng` changent — rien à faire côté frontend pour ça.
- RPC `terrains_nearby(lat, lng, radius_km, limit)` — recherche par
  proximité, publique (anon + authenticated).
- RPC `update_terrain_location(terrain_id, lat, lng)` + endpoint
  `PATCH /api/terrains/:id/location` (body `{ lat, lng }`, auth requise) —
  met à jour uniquement la position, sans repasser par tout le formulaire
  terrain.

Deux problèmes concrets repérés côté frontend en marge de cette tâche :

## Tâche 1 — ⚠️ Tuiles OSM utilisées en violation de leur politique d'usage

**`src/components/MapDiscovery.jsx:39-41`, `src/components/TerrainFormModal.jsx:567-569`,
`src/pages/TerrainDetail.jsx:279`** pointent tous les trois directement sur
`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` — ce sont les serveurs
de tuiles **de la fondation OSM elle-même**, dont la [politique d'usage](https://operations.osmfoundation.org/policies/tiles/)
interdit explicitement l'usage en production pour une application
commerciale sans mise en cache dédiée, et se réserve le droit de bloquer
l'IP sans préavis en cas de charge jugée excessive. Ce n'est pas une clé
API à demander (contrairement à Google Maps), mais un changement d'URL de
tuiles à faire dans ces 3 fichiers vers un fournisseur qui autorise
explicitement l'usage gratuit en production, ex. **CartoDB (Carto) Positron** :

```jsx
<TileLayer
  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
/>
```

(`{r}` = support Retina automatique par Leaflet, à garder tel quel.)
Toujours pas de clé API requise. Alternative si un style plus "carte
classique" est préféré : `dark_all`/`voyager` au lieu de `light_all` — même
domaine, mêmes conditions gratuites.

## Tâche 2 — Bouton "Utiliser ma position actuelle"

`TerrainFormModal.jsx` (section 3, ligne ~547-577) a déjà le picker "clic/glisser
sur la carte" (`MapLocationPicker`, state `formData.lat`/`formData.lng`),
mais rien pour la géolocalisation navigateur. Deux options, à choisir selon
l'UX voulue :

**Option A — remplir le formulaire (pas de sauvegarde immédiate)**
Ajouter un bouton à côté du label "3. Emplacement GPS" :
```jsx
const handleUseMyPosition = () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => setFormData(p => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude })),
    (err) => console.error('Géolocalisation refusée/indisponible:', err),
    { enableHighAccuracy: true, timeout: 10000 }
  );
};
```
Suit le flux existant (l'utilisateur valide ensuite tout le formulaire
normalement, via `createGerantTerrain`/`resubmitGerantTerrain`).

**Option B — sauvegarde immédiate sans rouvrir tout le formulaire**
Utile pour une correction rapide de position sur un terrain déjà publié
(depuis "Mon Terrain" par ex., sans repasser par toute l'édition) : appeler
directement le nouvel endpoint après `getCurrentPosition` :
```js
const { data: { session } } = await supabase.auth.getSession();
await fetch(`${API_URL}/api/terrains/${terrainId}/location`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
});
```
(ou directement `supabase.rpc('update_terrain_location', { p_terrain_id, p_lat, p_lng })`
sans passer par le backend Express, au choix.)

Gérer explicitement le refus de permission navigateur
(`GeolocationPositionError.code === 1`) avec un message clair, plutôt qu'un
échec silencieux.

## Nominatim — pas d'usage actuel, juste une note si vous en ajoutez un

Aucun appel Nominatim n'existe aujourd'hui dans le code (pas de recherche
d'adresse). Si vous en ajoutez un plus tard (ex. barre de recherche
d'adresse dans `TerrainFormModal`) :
- Respecter la [politique d'usage Nominatim](https://operations.osmfoundation.org/policies/nominatim/) :
  max ~1 requête/seconde, pas d'auto-complete déclenché à chaque frappe
  (debounce), toujours passer `format=json` + un paramètre `email=` ou
  utiliser leur endpoint documenté pour un usage léger.
- Un `User-Agent` custom **ne peut pas être positionné depuis du JS
  navigateur** (les navigateurs l'interdisent) — Nominatim s'appuie dans ce
  cas sur le header `Referer`, envoyé automatiquement par le navigateur ;
  pas d'action supplémentaire nécessaire côté fetch pour ça.
- Si le volume grossit, envisager un léger proxy backend (cache +
  rate-limit maison) plutôt que d'appeler Nominatim directement depuis
  chaque client — pas nécessaire tant que l'usage reste occasionnel.

## Ne pas toucher

- `src/services/terrains.js` — `updateTerrain` générique reste valable
  pour l'Option A ci-dessus, aucun changement requis.
- Le classement `get_terrains_populaires` / `terrains_populaires`
  (prompt séparé `PROMPT_LANDING_REAL_TERRAINS.md`) — indépendant de cette
  tâche.
