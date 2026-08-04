# PROMPT — URGENT : régression `setTerrain is not defined` dans GerantTerrain.jsx

## Contexte

Après la refonte multi-terrains, `npm run lint` remonte 4 nouvelles
erreurs `no-undef` dans `src/pages/GerantTerrain.jsx` (lignes 164, 178,
191, 207) : `setTerrain is not defined`.

## Cause

La refonte a remplacé l'ancien state `const [terrain, setTerrain] = useState(null)`
par une valeur **dérivée** :
```jsx
const [selectedTerrainId, setSelectedTerrainId] = useState(null);
const selectedTerrain = (terrains || []).find(t => t.id === selectedTerrainId) || null;
const terrain = selectedTerrain || (terrains?.length === 1 ? terrains[0] : null);
```
`terrain` n'est donc plus un state — `setTerrain` n'existe plus. Mais 4
handlers l'appellent encore pour faire une mise à jour optimiste locale
après une action réussie :
- `handleSavePrice` (ligne 164) — après changement de prix
- `handleToggleMaintenance` (ligne 178) — après bascule maintenance
- `handleAddAmenity` (ligne 191) — après ajout de commodité
- `handleRemoveAmenity` (ligne 207) — après retrait de commodité

Ces 4 actions plantent actuellement dès qu'un gérant les utilise sur un
terrain sélectionné.

## Ta tâche

Remplace chaque `setTerrain(t => ({ ...t, ... }))` par un rafraîchissement
de la vraie source de données (`refetch()`, déjà disponible depuis
`useGerantTerrains`, déjà utilisé ailleurs dans le fichier après
`handleFormSubmit`) :

```jsx
// handleSavePrice, ligne ~163-164
const updated = await updateTerrain(terrain.id, { price: priceInput });
await refetch();

// handleToggleMaintenance, ligne ~177-178
const updated = await updateTerrain(terrain.id, { statut: nextStatut });
await refetch();

// handleAddAmenity, ligne ~190-195
const created = await addAmenity(terrain.id, newAmenity.trim());
await refetch();
setNewAmenity('');
setShowAddAmenity(false);

// handleRemoveAmenity, ligne ~206-207
await removeAmenity(amenityId);
await refetch();
```
(Supprime la variable `updated`/`created` si elle devient inutilisée après
ce changement — vérifie au cas par cas, `updated.price`/`updated.statut`
n'ont plus besoin d'être lus puisqu'on refetch la source de vérité
entière.)

## Vérification

- Relance `npm run lint` : les 4 erreurs `setTerrain is not defined` ne
  doivent plus apparaître, et aucune nouvelle erreur `no-unused-vars` sur
  `updated`/`created` ne doit apparaître si tu les as bien retirées.
- Teste dans le navigateur, sur un terrain sélectionné : changer le prix,
  basculer le mode maintenance, ajouter une commodité, retirer une
  commodité — chacune doit fonctionner et refléter le changement à
  l'écran sans planter.
