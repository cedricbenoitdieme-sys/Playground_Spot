# PROMPT — Permettre plusieurs terrains par gérant, selon son plan

## Contexte

`src/pages/GerantTerrain.jsx` ("Mon Terrain") est entièrement câblée pour
gérer **un seul terrain par gérant** (`const mine = terrains[0] || null;`,
ligne 57) — le bouton "Ajouter mon terrain" n'apparaît QUE si le gérant a
zéro terrain (`if (!terrain)`, ligne 197). Une fois un terrain créé
(peu importe son statut pending/rejected/approved), il n'existe plus
aucun chemin dans l'UI pour en ajouter un second — alors que la grille
tarifaire (`GerantTarifs.jsx`, `plan_limits.max_terrains`) promet
explicitement 3 terrains en Starter et l'illimité en Pro/Entreprise.

**Déjà fait côté backend**, migration
`supabase/migrations/20260804100000_quota_terrains_par_plan.sql` :
trigger `BEFORE INSERT ON terrains` qui applique réellement
`plan_limits.max_terrains` (Free=1, Starter=3, Pro/Entreprise=illimité).
Un gérant qui essaie de créer un terrain au-delà de sa limite reçoit
désormais une vraie erreur Postgres, préfixée `quota_terrains_atteint:`
pour être reconnaissable côté frontend. Aucun changement du chemin
d'insertion existant (`createGerantTerrain` dans `services/terrains.js`)
n'était nécessaire côté backend — le trigger intercepte l'insert
directement, atomique, pas de race condition.

Bonne nouvelle : `useGerantTerrains` (le hook, `src/hooks/useGerantTerrains.js`)
retourne déjà un vrai tableau `terrains` (pluriel) via la RPC
`get_gerant_terrains` — ce n'est PAS le hook qui limite à un seul terrain,
c'est uniquement `GerantTerrain.jsx` qui prend arbitrairement `terrains[0]`.
Pas de changement nécessaire côté hook.

## Ta tâche

### 1. `src/lib/errorHandler.js` — reconnaître l'erreur de quota

`handleServiceError` généricise actuellement tous les messages d'erreur
non reconnus vers un message générique ("Une erreur inattendue s'est
produite...") — le préfixe `quota_terrains_atteint:` serait perdu. Ajoute
un cas dédié, avant le fallback générique (ligne ~109) :
```js
// Quota de terrains atteint (limite du plan)
if (message.includes('quota_terrains_atteint')) {
  const cleanMsg = error.message.replace(/^.*quota_terrains_atteint:\s*/i, '');
  return new SafeError(cleanMsg, { code: 'QUOTA_TERRAINS_ATTEINT', statusCode: 403, details: error.message });
}
```
Ça permet au frontend de distinguer `err.code === 'QUOTA_TERRAINS_ATTEINT'`
pour afficher une UI d'upsell spécifique plutôt qu'un message d'erreur
générique.

### 2. `src/pages/GerantTerrain.jsx` — refonte en liste multi-terrains

Restructure la page autour de la logique suivante (garde tout le contenu/
style visuel existant des 4 états pending/rejected/approved/formulaire —
ils deviennent des "vues détail d'UN terrain sélectionné" au lieu d'être
câblés sur `terrains[0]`) :

- **État "liste"** (nouveau, remplace l'ancien état racine) : si
  `terrains.length > 0`, affiche une liste/grille de cartes — une par
  terrain (nom, statut avec badge coloré comme déjà fait ailleurs dans le
  fichier pour un terrain unique, miniature via `TerrainImage` si
  pertinent). Chaque carte a un bouton "Gérer" qui sélectionne ce terrain
  (`setSelectedTerrainId(t.id)`) et affiche la vue détail existante
  (pending/rejected/approved) pour CE terrain précis au lieu de
  `terrains[0]`.
- **Bouton "Ajouter un terrain"** : toujours visible dans l'en-tête de la
  vue liste (pas seulement quand `terrains.length === 0`). Au clic,
  appelle `openCreateModal()` (déjà existant, génère un `newTerrainId` et
  ouvre `TerrainFormModal`) — si le quota est atteint, la création
  échouera avec `err.code === 'QUOTA_TERRAINS_ATTEINT'` (voir point 1) :
  attrape ce cas spécifiquement dans `handleFormSubmit` pour afficher le
  message d'upsell (`err.userMessage`, déjà le texte propre grâce au
  point 1) au lieu de laisser planter/afficher une erreur générique.
- **État vide** (`terrains.length === 0`) : garde l'écran actuel "Aucun
  terrain enregistré" tel quel (lignes ~196-234), c'est déjà correct pour
  ce cas précis.
- Affiche quelque part dans la vue liste l'usage du quota, ex.
  "2 / 3 terrains utilisés" ou "Terrains illimités" — utilise la RPC déjà
  existante `check_quota` :
  ```js
  const { data } = await supabase.rpc('check_quota', { p_user_id: currentUser.id, p_quota_type: 'terrains' });
  // data: { limite, utilise, illimite, quota_atteint }
  ```
  Si `quota_atteint` est vrai, désactive/grise visuellement le bouton
  "Ajouter un terrain" avec un tooltip ou message renvoyant vers
  "Abonnement & Tarifs" plutôt que de laisser l'utilisateur cliquer pour
  se prendre une erreur — meilleure UX, mais le blocage serveur (point
  backend) reste le vrai garde-fou en cas de contournement.

### 3. Vérifie les autres call sites qui supposent "un seul terrain"

`GerantDashboard.jsx`, `GerantPlanning.jsx`, `GerantStats.jsx`,
`GerantVisibilityBoost.jsx` utilisent potentiellement aussi
`useGerantTerrains` en ne prenant que `terrains[0]` implicitement (à
vérifier au cas par cas — hors scope de tout réécrire aujourd'hui, mais
si l'un de ces écrans a clairement besoin d'un sélecteur de terrain pour
rester cohérent avec le multi-terrains, signale-le dans ton rapport final
plutôt que de l'ignorer silencieusement). Ne les modifie pas sans
confirmation — le scope de cette tâche est `GerantTerrain.jsx` +
`errorHandler.js` uniquement.

## Vérification

- Sur un compte gérant Free (1 terrain max) ayant déjà 1 terrain : le
  bouton "Ajouter un terrain" doit être visible mais désactivé/upsell, et
  une tentative de contournement (ex. appel direct) doit être bloquée par
  le trigger backend avec le message clair.
- Sur un compte Pro/Entreprise (illimité) : ajoute 2-3 terrains de suite
  sans blocage, confirme que chacun apparaît dans la liste avec son propre
  statut, et que "Gérer" sur chacun affiche bien SES données à lui (pas
  celles d'un autre terrain).
- Sur Starter (3 max) : ajoute jusqu'à 3, confirme le blocage au 4ᵉ avec
  le message d'upsell propre (pas une erreur générique).

## Interdictions

- Ne touche pas à `useGerantTerrains.js` — déjà correct, retourne déjà
  tous les terrains.
- Ne réécris pas les 4 sous-vues (pending/rejected/approved/formulaire)
  depuis zéro — réutilise leur JSX/logique existante, juste paramétrée
  par le terrain sélectionné au lieu de `terrains[0]`.
