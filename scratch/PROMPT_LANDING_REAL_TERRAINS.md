# Prompt — Brancher la landing page sur les vrais terrains (retrait des mocks)

## Contexte

La landing page publique (`src/pages/Landing.jsx`) n'a **jamais interrogé
Supabase** pour sa section "Terrains Populaires" : ce sont 3 cartes 100%
codées en dur ("Arena Plateau", "Dakar Pitch Mermoz", "Five Dakar
Almadies", photos Unsplash, notes/prix fictifs). Ce n'est pas un fallback
("si data vide, afficher X") — c'est du JSX statique affiché
inconditionnellement.

Bonne nouvelle : `src/services/terrains.js` (fetchTerrains,
fetchTopTerrains) n'a AUCUN fallback mocké — il interroge déjà strictement
`public.terrains` en filtrant `statut='actif'`. Le problème est uniquement
dans les composants, pas dans la couche service/API.

Côté base, il n'y a **qu'un seul vrai terrain** actuellement ("Drix
terrain", actif + approuvé). Le nouveau système de classement doit donc
gérer proprement le cas 1 (voire 0) résultat, pas supposer 3 cartes.

## Nouveau backend disponible (déjà en place)

- RPC Supabase `get_terrains_populaires(p_limit INT DEFAULT 20)` — trie par
  boost de visibilité actif (dégressif dans le temps) DESC, puis `rating`
  DESC, puis réservations des 30 derniers jours DESC. Ne retourne QUE les
  terrains `statut='actif' AND status='approved'` (mêmes critères que la
  policy RLS publique). Colonnes retournées : `id, nom, quartier, adresse,
  price, rating, reviews_count, surface, size, image_url, lat, lng,
  capacite, boost_score, boost_actif, reservations_recentes`.
  Appel direct : `supabase.rpc('get_terrains_populaires', { p_limit: 6 })`.
- Vue `public.terrains_populaires` (alias SELECT * sur la RPC, limite 50)
  si tu préfères `.from('terrains_populaires').select('*').limit(6)`.
- Endpoint HTTP `GET /api/terrains/populaires?limit=6` (backend/routes/terrains.js,
  monté dans `backend/server.js` et `api/index.js`) si tu préfères fetch()
  plutôt que le client Supabase directement — répond `{ terrains: [...] }`.

⚠️ `image_url` renvoyé par la RPC est la colonne legacy de `terrains`
(actuellement `NULL` pour le seul vrai terrain — les photos réelles vivent
dans `terrain_photos` + Supabase Storage, bucket privé). Pour une vraie
photo, il faut appeler `getTerrainPrincipalPhotoUrl(terrainId)` (déjà
exporté par `src/services/terrains.js:246`) par terrain, et prévoir un
placeholder si elle renvoie `null` (aucune photo uploadée).

## Tâche 1 — `src/pages/Landing.jsx`

Remplacer les 3 cartes codées en dur (lignes ~812-930, section
`id="terrains"`, titre "Terrains Populaires") par un rendu basé sur
`get_terrains_populaires` :

- `useEffect` au montage : `supabase.rpc('get_terrains_populaires', { p_limit: 6 })`
  (il faudra importer `supabase` depuis `../lib/supabase`, absent du fichier
  aujourd'hui) puis, pour chaque terrain, résoudre sa photo via
  `getTerrainPrincipalPhotoUrl`.
- Gérer explicitement :
  - **0 résultat** : ne pas afficher la section (ou un état "Bientôt de
    nouveaux terrains à Dakar"), jamais de carte vide/fictive.
  - **1-2 résultats** (le cas réel aujourd'hui) : afficher uniquement ce
    qui existe, pas de grille forcée à 3 colonnes avec des trous.
  - Pas de photo (`getTerrainPrincipalPhotoUrl` → `null`) : placeholder
    visuel neutre, jamais une image Unsplash de démo.
- `onClick` de chaque carte : garder la navigation vers `Discovery`, mais
  idéalement vers le détail du terrain réel (`terrain.id`) plutôt que la
  liste générique, si `handleGoToApp` le permet déjà.

## Tâche 2 — `src/components/TopTerrains.jsx` (lignes 16-22)

Le tableau codé en dur `[34, 28, 22]` pour `bookings`/`revenue` par terrain
(commentaire du code lui-même : *"sera remplacé par un compteur réel plus
tard"*) peut maintenant être remplacé : `fetchTopTerrains` pourrait être
swappé pour `get_terrains_populaires`, qui renvoie un vrai
`reservations_recentes` (30 derniers jours) par terrain. `revenue` peut se
calculer `price * reservations_recentes` si une approximation suffit, ou
rester non affiché si une vraie somme des paiements est nécessaire —
à trancher selon ce que ce composant doit garantir comme précision.

## Tâche 3 — `src/pages/Landing.jsx:358-380` (ruban de stats du hero)

Backend maintenant disponible (migration `20260725120000_stats_plateforme.sql`) :
`GET /api/stats/plateforme` (ou `supabase.from('stats_plateforme_cache').select('*').eq('id', true).maybeSingle()`)
renvoie `{ nombre_joueurs, nombre_terrains, taux_satisfaction, nombre_avis, updated_at }`,
recalculé mensuellement par un cron (pas de calcul à la volée — c'est un
cache, ce n'est pas grave si `updated_at` a jusqu'à un mois de retard).

Remplacer les 3 `CountUp` codés en dur :
- `end={15000}` (joueurs) → `nombre_joueurs`
- `end={55}` (terrains homologués) → `nombre_terrains`
- `end={98}` (% satisfaction) → `taux_satisfaction`, **avec gestion explicite
  du `null`** : `taux_satisfaction` est `null` tant qu'il y a moins de 20
  avis en base (seuil de fiabilité côté SQL, `refresh_stats_plateforme()`).
  Ne jamais afficher "0%" ou un chiffre par défaut dans ce cas — soit
  masquer ce `CountUp` précis, soit un libellé neutre du type "Nouveau !"
  / "Bientôt disponible", à décider selon le design du ruban.

## Hors scope de ce prompt (mocks repérés au passage, à traiter séparément si voulu)

- `src/components/StatsGrid.jsx:64-71` — `metricsMap` entièrement simulé
  (revenus/réservations/utilisateurs par période), plus une ligne
  `"Terrain star de la période" → "Five Dakar Almadies"` (même faux nom
  que Landing.jsx). C'est un widget dashboard admin/gérant, pas la landing
  publique — mock différent, périmètre différent, pas couvert par
  `stats_plateforme_cache` (qui est un instantané mensuel public, pas un
  détail par période pour l'admin).

## Ne pas toucher

- `src/services/terrains.js` — déjà propre, aucun fallback mocké à retirer.
- Le système de Budget Visibilité (`GerantVisibilityBoost.jsx`,
  `BoostCheckoutModal.jsx`, `useBoostPaymentPolling.js`) — inchangé, c'est
  la source du `boost_score` désormais consommé par `get_terrains_populaires`.
