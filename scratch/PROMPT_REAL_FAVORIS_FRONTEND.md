# Prompt — Vrais favoris + compteurs fiables (intégration frontend)

## Diagnostic (confirmé, aucune donnée à nettoyer)

**"Drix terrain" n'a pas été auto-ajouté par un bug** : il n'existe aucune
table de favoris nulle part dans ce projet, jamais. `src/pages/JoueurFavoris.jsx`
appelle `fetchTopTerrains(2)` (top terrains **de toute la plateforme**, par
note) et les affiche comme si c'était les favoris du joueur connecté — un
commentaire dans le code l'admet explicitement (`// TODO: remplacer par une
vraie table favoris quand elle existe`). Les icônes cœur dans
`JoueurFavoris.jsx` et `JoueurHome.jsx` sont **décoratives** : toujours
rouges/remplies, sans `onClick`. Rien à nettoyer en base — il n'y a jamais
eu de vraies données de favoris, fictives ou non.

**"4.9★" et "34 réservations" sont aussi codés en dur**, pas une
incohérence de calcul entre deux vraies sources : `JoueurFavoris.jsx` a
`<span>4.9</span>` littéral et `bookings: [34, 28][i] || 20`. La vraie note
("0★" vue sur Découverte) était juste — `terrains.rating` est déjà calculé
correctement en temps réel par un trigger existant à chaque avis
(`update_terrain_rating()`), et j'ai vérifié qu'aucune autre page du projet
n'a de note codée en dur (recherche exhaustive faite).

## Backend déjà fait

Migration : `supabase/migrations/20260802230000_favoris_and_reservations_count.sql`
(pas encore appliquée à la base distante). Ajoute :

1. **`public.favoris`** — table simple `(joueur_id, terrain_id)`, RLS : un
   joueur ne gère que ses propres lignes. Pas de RPC, insert/delete/select
   directs comme pour `creneaux` ailleurs dans ce projet.
2. **`terrains.reservations_count`** — nouvelle colonne dénormalisée,
   maintenue par trigger exactement comme `rating`/`reviews_count`
   (toujours à jour, backfillée pour les terrains existants). C'est le
   total de réservations confirmées/terminées "à vie" — différent de
   `get_terrains_populaires().reservations_recentes` (fenêtre 30 jours,
   utilisé par `TopTerrains.jsx` pour un classement "tendance" — ne pas
   confondre les deux, ne touchez pas à `TopTerrains.jsx`).

## Tâche 1 — `JoueurFavoris.jsx` : vrais favoris

```js
// src/services/... (nouveau, ou ajouté à terrains.js/profiles.js)
export const fetchMesFavoris = async (joueurId) => {
  const { data, error } = await supabase
    .from('favoris')
    .select('terrain_id, terrains(*)')
    .eq('joueur_id', joueurId);
  if (error) throw handleServiceError(error, 'fetchMesFavoris');
  return (data || []).map(f => ({ ...f.terrains, name: f.terrains.nom, image: f.terrains.image_url }));
};

export const toggleFavori = async (joueurId, terrainId, isFavori) => {
  if (isFavori) {
    const { error } = await supabase.from('favoris').delete().eq('joueur_id', joueurId).eq('terrain_id', terrainId);
    if (error) throw handleServiceError(error, 'toggleFavori:delete');
  } else {
    const { error } = await supabase.from('favoris').insert({ joueur_id: joueurId, terrain_id: terrainId });
    if (error) throw handleServiceError(error, 'toggleFavori:insert');
  }
};
```

Remplacer le `useEffect` de `JoueurFavoris.jsx` (lignes 17-33) par un appel
à `fetchMesFavoris(currentUser.id)`. Remplacer l'affichage :
- `<span>4.9</span>` (ligne 79) → `{terrain.rating || '—'}` (état "pas
  encore noté" demandé dans la contrainte — `terrains.rating` vaut déjà `0`
  par défaut en base, donc `terrain.rating || '—'` affiche "—" pour 0 comme
  pour `null`/`undefined`, ce qui est le bon comportement ici).
- `{terrain.bookings} réservations` (ligne 81) → `{terrain.reservations_count} réservations`
  (déjà inclus, colonne réelle sur `terrains`).
- Le cœur (ligne 68-70) doit devenir un vrai bouton `onClick` appelant
  `toggleFavori(currentUser.id, terrain.id, true)` (toujours `true` ici
  puisqu'on est sur la liste des favoris — cliquer retire le favori) puis
  retire l'élément du state local.

## Tâche 2 — Un vrai moyen d'ajouter un favori (actuellement inexistant nulle part)

En auditant le code, **aucun endroit de l'app ne permet réellement
d'ajouter un favori** — ni `Discovery.jsx`, ni `TerrainDetail.jsx`, ni
`TerrainCard.jsx` (le composant carte partagé, `src/components/TerrainCard.jsx`,
n'a aucune icône cœur du tout). Sans ça, "Mes Favoris" restera
structurellement toujours vide une fois le mock retiré. Recommandation :
ajouter un bouton cœur fonctionnel dans `TerrainCard.jsx` (composant
partagé → visible partout où il est utilisé, ex. `Discovery.jsx`) et/ou
`TerrainDetail.jsx`, branché sur `toggleFavori`. Nécessite de connaître
l'état "est-ce déjà un favori" pour chaque terrain affiché — pour une
liste, chargez `favoris.terrain_id` une fois (`select('terrain_id').eq('joueur_id', ...)`)
dans un `Set`, plutôt qu'une requête par carte.

Aussi à corriger tant que vous y êtes : le cœur décoratif de
`JoueurHome.jsx` (ligne 164-166) — même traitement (bouton réel + état).

## Contraintes

- `terrains.rating`/`reviews_count` sont déjà fiables partout — ne pas les
  recalculer différemment quelque part, ne rien changer côté `TerrainCard.jsx`
  pour la note (déjà correcte, `terrain.rating` ligne 34).
- Ne pas toucher à `get_terrains_populaires()` / `TopTerrains.jsx` — métrique
  volontairement différente (30 jours glissants), pas un doublon à fusionner.
- Un terrain sans avis doit afficher "—" ou "Pas encore noté", jamais une
  valeur inventée — déjà garanti dès que vous arrêtez d'utiliser la valeur
  codée en dur.
