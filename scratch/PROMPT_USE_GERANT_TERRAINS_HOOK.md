# Prompt — Hook unique useGerantTerrains + consolidation des fetchs (PlaygroundSpot)

## Contexte

Bug déjà corrigé une fois côté DB (migrations `20260724110000` puis
`20260724120000`, cette dernière rendant la source canonique complète) :
`fetchGerants()` (page "Gestion des Gérants") comptait les terrains via une
table de jonction `gerant_terrains` jamais remplie, au lieu de
`terrains.gerant_id` (la vraie relation, utilisée par RLS et partout
ailleurs). Objectif maintenant : qu'il n'existe plus qu'**une seule**
manière de récupérer "les terrains d'un gérant" côté front, pour qu'un
futur développeur ne recrée pas une 4e requête différente.

## Ce qui existe déjà côté backend

**`public.get_gerant_terrains(p_gerant_id UUID)`** — RPC, retourne :
```json
{ "gerant_id": "...", "terrain_count": 1, "terrains": [ { "id": "...", "nom": "...", "quartier": "...", "adresse": "...", "price": 15000, "rating": 4.5, "reviews_count": 3, "surface": "Synthétique", "size": "5v5", "capacite": 10, "horaires": "08:00 - 00:00", "image_url": null, "lat": ..., "lng": ..., "gerant_id": "...", "statut": "actif", "status": "approved", "rejection_reason": null, "description": null, "created_at": "...", "updated_at": "...", "amenities": [ { "id": "...", "label": "Vestiaires", "icone": "shirt" } ] } ] }
```
C'est l'équivalent complet de ce que `fetchTerrainsByGerant` (services/terrains.js)
renvoie aujourd'hui (mêmes champs + amenities), donc un remplacement direct
viable. Autorisation : appelant = le gérant lui-même (`auth.uid()`) ou un
admin — sinon `Accès refusé`.

**`public.v_gerant_terrains`** — vue équivalente mais pour **tous les
gérants d'un coup** (une ligne par gérant, `gerant_id, terrain_count, terrains`).
⚠️ À utiliser pour la page admin "Gestion des Gérants" (liste de plusieurs
gérants) — **ne pas** boucler le hook `useGerantTerrains` un gérant à la
fois sur cette page, ce serait du N+1 requêtes. Cette page doit interroger
la vue directement (`supabase.from('v_gerant_terrains').select('*')`), pas
passer par le hook pensé pour un seul gérant à la fois.

## Tâche 1 — Hook `useGerantTerrains(gerantId)`

Nouveau fichier `src/hooks/useGerantTerrains.js` :

```js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * SOURCE DE VÉRITÉ UNIQUE pour "les terrains d'un gérant" côté front.
 *
 * N'écris JAMAIS une nouvelle requête `.from('terrains').eq('gerant_id', ...)`
 * ou pire, un fetch via `gerant_terrains` (table de jonction héritée,
 * jamais synchronisée, cause du bug "0 terrain" corrigé le 2026-07-24
 * — voir supabase/migrations/20260724110000 et 20260724120000).
 * Utilise CE hook pour un seul gérant. Pour une liste de PLUSIEURS
 * gérants à la fois (ex. page admin "Gestion des Gérants"), interroge
 * directement la vue `v_gerant_terrains` en une seule requête — ne
 * boucle jamais ce hook sur une liste (N+1 requêtes).
 *
 * @param {string} gerantId
 * @returns {{ terrains: object[], terrainCount: number, loading: boolean, error: string|null, refetch: () => void }}
 */
export const useGerantTerrains = (gerantId) => {
  const [terrains, setTerrains] = useState([]);
  const [terrainCount, setTerrainCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!gerantId) {
      setTerrains([]);
      setTerrainCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_gerant_terrains', { p_gerant_id: gerantId });
      if (rpcError) throw rpcError;
      setTerrains(data?.terrains || []);
      setTerrainCount(data?.terrain_count || 0);
    } catch (err) {
      setError(handleServiceError(err, 'useGerantTerrains').userMessage);
      setTerrains([]);
      setTerrainCount(0);
    } finally {
      setLoading(false);
    }
  }, [gerantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { terrains, terrainCount, loading, error, refetch: fetchData };
};
```

## Tâche 2 — Remplacer les fetchs existants

- **`src/pages/GerantTerrain.jsx`** ("Mon Terrain") : remplace l'appel à
  `fetchTerrainsByGerant(currentUser.id)` dans `loadTerrain()` par le hook
  `useGerantTerrains(currentUser.id)`. Le composant prend aujourd'hui le
  premier élément (`terrains[0]`) comme "son" terrain — logique inchangée,
  juste la source qui change. Attention : ce composant gère aussi son
  propre état `saving`/`error`/re-fetch après création/édition
  (`handleFormSubmit`) — utilise `refetch()` du hook à la place de l'appel
  direct à `loadTerrain()` après un submit réussi.

- **`src/pages/GerantVisibilityBoost.jsx`** : remplace `fetchTerrainsByGerant(currentUser.id)`
  par `useGerantTerrains(currentUser.id)`.

- **`src/pages/Gerants.jsx`** + **`src/services/profiles.js`** (`fetchGerants`) :
  **ne pas** utiliser le hook ici (conçu pour un seul gérant). Remplacer le
  fetch existant par une requête directe sur `v_gerant_terrains` :
  ```js
  const { data: gerants, error } = await supabase.from('profiles').select('*').eq('role', 'gerant').order('nom');
  const { data: terrainStats } = await supabase.from('v_gerant_terrains').select('*');
  const statsByGerant = Object.fromEntries((terrainStats || []).map(s => [s.gerant_id, s]));
  // g.terrains = statsByGerant[g.id]?.terrains || []  (tableau d'objets, PAS de strings — voir plus bas)
  ```
  **`Gerants.jsx`** : `g.terrains` était un tableau de **strings** (noms).
  Devient un tableau d'**objets** `{id, nom, quartier, ...}`. Dans le détail
  du gérant (Sheet "Terrains gérés"), `{t}` → `{t.nom}` (et affiche aussi
  `t.status` si utile, maintenant disponible).

- **Dashboard / Statistiques gérant (`services/stats.js`)** : ces fichiers
  utilisent déjà `terrains.gerant_id` directement et ne sont PAS buggés —
  mais si l'objectif est une vraie source unique, envisage de les migrer
  aussi vers `useGerantTerrains`/la vue selon ce dont chaque fonction a
  réellement besoin (certaines n'ont besoin que des `id` des terrains, pas
  de l'objet complet — pas obligatoire de tout migrer si ça complique sans
  bénéfice, à juger au cas par cas).

- Cherche s'il reste d'autres fetchs ad-hoc (`grep -rn "gerant_id" src/services src/pages` pour repérer tout ce qui filtre sur `gerant_id` côté `terrains`) et consolide ce qui a du sens.

## Tâche 3 — Vérification visuelle

Recharger "Gestion des Gérants" : la fiche de Cedric (`drixnocap@gmail.com`)
doit afficher **1 terrain**, cohérent avec "Mon Terrain" et "Découverte des
terrains". Vérifier aussi que "Mon Terrain" et "Budget Visibilité"
fonctionnent toujours normalement après la bascule sur le hook (prix,
surface, amenities toujours affichés correctement).

## Tâche 4 — Documentation

Le commentaire en tête de `useGerantTerrains.js` ci-dessus sert cette
tâche (avertit explicitement de ne pas recréer une requête séparée, avec
référence aux migrations qui ont corrigé le bug). Ajoute aussi une ligne
équivalente en commentaire au-dessus de la requête directe sur
`v_gerant_terrains` dans `services/profiles.js`, pour que ce deuxième
point d'accès (nécessaire pour la liste admin, cf. tâche 1) ne soit pas
confondu avec "encore une requête séparée".

## Contraintes

- Aucune nouvelle migration SQL nécessaire — tout est déjà en place.
- Respecter `handleServiceError` pour toute nouvelle requête.
- Ne pas dupliquer la logique de masquage des données sensibles déjà
  présente dans `fetchGerants` (`maskSensitiveData`) — la conserver telle
  quelle, seule la source des terrains change.
