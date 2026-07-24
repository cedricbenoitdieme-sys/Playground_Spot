# Prompt — Fix comptage terrains sur "Gestion des Gérants" (PlaygroundSpot)

## Contexte / cause exacte du bug

`src/pages/Gerants.jsx` (page admin "Gestion des Gérants") affiche `(g.terrains || []).length`
pour le badge "X terrain(s)" et une liste "Terrains gérés" dans le détail
d'un gérant. Ces données viennent de `fetchGerants()` dans
`src/services/profiles.js`, qui récupère les terrains via la table de
jonction many-to-many **`gerant_terrains`** :

```js
.select(`*, gerant_terrains ( terrains ( id, nom, quartier ) )`)
```

Cette table `gerant_terrains` est héritée du schéma d'origine et **n'est
jamais remplie** par le flow d'auto-création de terrain côté gérant
(`createGerantTerrain` dans `services/terrains.js` pose directement
`terrains.gerant_id`, sans jamais insérer dans `gerant_terrains`). Résultat :
un gérant qui a créé son terrain lui-même (le cas normal aujourd'hui)
apparaît avec 0 terrain sur cette page, même si son terrain existe,
est approuvé, et s'affiche correctement partout ailleurs (RLS, "Mon
Terrain", "Découverte" utilisent tous `terrains.gerant_id` directement).

Audit fait (grep sur tout `src/` et `supabase/`) : `gerant_terrains` n'est
référencée QUE dans `fetchGerants()`. Aucun autre écran (Mon Terrain,
Budget Visibilité, Dashboard/Statistiques gérant) n'est concerné — ils
interrogent déjà `terrains.gerant_id` directement.

## Ce qui a été fait côté backend (déjà en place, migration
`supabase/migrations/20260724110000_gerant_terrains_canonical.sql`)

Nouvelle vue canonique **`public.v_gerant_terrains`** :
```sql
SELECT gerant_id, terrain_count, terrains  -- terrains = json array de {id, nom, quartier, status, statut}
FROM public.v_gerant_terrains
```
Une ligne par profil `role='gerant'` (LEFT JOIN sur `terrains.gerant_id`,
donc les gérants sans terrain apparaissent bien avec `terrain_count = 0`,
pas absents du résultat).

Et une RPC `get_gerant_terrains(p_gerant_id UUID)` pour un seul gérant
(même logique, self-ou-admin uniquement).

## Ce qu'il faut changer côté front

### `src/services/profiles.js` — `fetchGerants()`

Remplacer la jointure `gerant_terrains` par la nouvelle vue. Exemple :

```js
export const fetchGerants = async ({ currentUserId = null, currentUserRole = null } = {}) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      v_gerant_terrains ( terrain_count, terrains )
    `)
    .eq('role', 'gerant')
    .order('nom');
  if (error) throw handleServiceError(error, 'fetchGerants');

  return data.map(g => ({
    ...maskSensitiveData(g, currentUserId, currentUserRole),
    initiales: g.avatar || getInitiales(g.nom),
    terrains: g.v_gerant_terrains?.[0]?.terrains || [],
  }));
};
```

⚠️ Vérifier si Supabase/PostgREST autorise une jointure implicite
`profiles → v_gerant_terrains` de cette façon (nécessite que PostgREST
détecte la relation, ce qui ne marche généralement que sur une vraie FK,
pas sur une vue sans contrainte déclarée). Si ça ne fonctionne pas
tel quel, alternative simple et fiable : deux requêtes séparées puis un
merge en JS :
```js
const { data: gerants, error } = await supabase.from('profiles').select('*').eq('role', 'gerant').order('nom');
if (error) throw handleServiceError(error, 'fetchGerants');

const { data: terrainStats, error: statsErr } = await supabase.from('v_gerant_terrains').select('*');
if (statsErr) throw handleServiceError(statsErr, 'fetchGerants:stats');
const statsByGerant = Object.fromEntries((terrainStats || []).map(s => [s.gerant_id, s]));

return gerants.map(g => ({
  ...maskSensitiveData(g, currentUserId, currentUserRole),
  initiales: g.avatar || getInitiales(g.nom),
  terrains: statsByGerant[g.id]?.terrains || [],
}));
```

### `src/pages/Gerants.jsx` — adapter la lecture de `terrains`

**Important** : avant, `g.terrains` était un tableau de **strings** (noms
de terrains, via `.map(gt => gt.terrains?.nom)`). Avec la nouvelle vue,
`terrains` est un tableau d'**objets** `{id, nom, quartier, status, statut}`.
Deux endroits à adapter :

1. Le badge count (`GerantCard`, ligne ~73) : `(g.terrains || []).length`
   fonctionne tel quel (longueur d'array, peu importe le contenu).

2. Le détail du gérant (Sheet "Terrains gérés", ligne ~336) :
   ```jsx
   {selected.terrains.map((t, i) => (
     <div key={i} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
       <IconBallFootball size={14} className="text-primary" /> {t}
     </div>
   ))}
   ```
   `{t}` affichait directement la string — à changer en `{t.nom}` (et
   `key={i}` peut devenir `key={t.id}`, plus stable). Envisager d'afficher
   aussi le statut (`t.status`) à côté du nom, maintenant qu'il est
   disponible — utile pour qu'un admin voie d'un coup d'œil qu'un terrain
   listé est encore `pending`/`rejected`, pas juste `approved`.

## Vérification après le fix

Recharger "Gestion des Gérants" : Cedric (`drixnocap@gmail.com`) doit
afficher **1 terrain**, cohérent avec "Mon Terrain" et "Découverte".

Côté SQL, pour confirmer que la vue elle-même renvoie la bonne donnée
(indépendamment du fix front) :
```sql
SELECT p.email, v.terrain_count, v.terrains
FROM public.v_gerant_terrains v
JOIN public.profiles p ON p.id = v.gerant_id
WHERE p.email = 'drixnocap@gmail.com';
```
Doit renvoyer `terrain_count = 1`.

## Contraintes

- Aucune autre migration SQL nécessaire.
- Ne pas toucher `services/terrains.js`/`Mon Terrain`/`Budget Visibilité` —
  déjà corrects, hors périmètre de ce fix.
- Respecter `handleServiceError` pour toute nouvelle requête, comme le
  reste de `services/profiles.js`.
