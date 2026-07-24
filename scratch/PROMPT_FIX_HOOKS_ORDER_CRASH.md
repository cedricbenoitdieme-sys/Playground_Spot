# Prompt — Fix crash "page blanche" dans TerrainFormModal.jsx (violation Rules of Hooks)

## Bug exact

Dans `src/components/TerrainFormModal.jsx`, la ligne :
```js
const [submitting, setSubmitting] = useState(false);
```
est actuellement déclarée **après** `if (!isOpen) return null;` (juste avant `handleSubmitForm`, vers la ligne 349).

Le composant `TerrainFormModal` est toujours monté dans l'arbre React (pas
de rendu conditionnel côté parent), avec `isOpen` qui passe de `false` à
`true`. Tant que `isOpen` est `false`, l'exécution s'arrête au
`return null` **avant** d'atteindre ce `useState` — donc React compte un
nombre de hooks N pour cette instance. Dès que `isOpen` devient `true`
(clic sur "Modifier ma fiche"), l'exécution ne s'arrête plus, et atteint
CE `useState` pour la première fois → React voit un nombre de hooks
différent entre deux rendus de la même instance ("Rendered fewer/more
hooks than expected"), ce qui est une erreur fatale non catchée → React
démonte tout l'arbre → page blanche.

## Fix demandé (précis, ne rien changer d'autre)

Déplacer **uniquement** cette ligne :
```js
const [submitting, setSubmitting] = useState(false);
```
vers le haut du composant, groupée avec les autres déclarations `useState`
existantes (juste après `const [lastCroppedBlob, setLastCroppedBlob] = useState(null);`,
qui est avant `const fileInputRef = useRef(null);`) — donc AVANT le
`if (!isOpen) return null;`.

Supprimer la ligne dupliquée à son emplacement actuel (juste avant
`handleSubmitForm`). `submitting` et `setSubmitting` doivent rester
utilisés exactement comme avant (dans `handleSubmitForm` et sur le bouton
submit) — seul l'endroit où le hook est déclaré change, pas son
comportement.

## Vérification "rien de cassé" après le fix

Cette classe de bug (hook déclaré après un `return` conditionnel) est
facile à réintroduire par erreur ailleurs dans ce même fichier ou
d'autres fichiers du projet qui ont le même pattern (`if (!isOpen) return null;`
suivi de handlers). Avant de considérer que c'est fini :

1. Dans `TerrainFormModal.jsx` lui-même : vérifier qu'il n'y a AUCUN autre
   `useState`/`useEffect`/`useRef`/`useCallback`/etc. déclaré après la
   ligne `if (!isOpen) return null;` (ligne ~322). Tout doit être
   regroupé avant. Un grep rapide sur `use[A-Z]` dans ce fichier après la
   ligne du `return null` doit ne rien trouver.

2. Test manuel dans l'app, dans cet ordre exact (c'est le scénario qui a
   crashé) :
   - Charger "Mon Terrain" sur un compte gérant dont le terrain est déjà
     `approved` (pas au premier montage avec la modale fermée — c'est
     l'ouverture qui doit être testée).
   - Cliquer "Modifier ma fiche" → la modale doit s'ouvrir normalement,
     PAS de page blanche.
   - Vérifier que les photos existantes se chargent bien dans la galerie
     (via `getTerrainGalleryPhotoUrls`), que la carte Leaflet s'affiche,
     que la section Documents Justificatifs se charge.
   - Modifier un champ (ex. le prix) et soumettre → doit enregistrer sans
     redéclencher de validation admin (le terrain doit rester `approved`).
   - Fermer et rouvrir la modale plusieurs fois de suite (toggle
     isOpen false→true→false→true) pour confirmer qu'il n'y a plus
     d'erreur dans la console à aucun moment de ce cycle.
   - Refaire le même test depuis les états `pending` et `rejected` d'un
     terrain (les autres pages qui rendent aussi `TerrainFormModal`) pour
     confirmer que rien n'a régressé sur ces flows-là non plus.

3. Vérifier la console navigateur (pas juste l'écran) pendant tout ce
   test : aucune erreur "Rendered more/fewer hooks than expected" ni
   aucune autre exception ne doit apparaître.

## Contrainte

Ne toucher à rien d'autre dans ce fichier — c'est un déplacement de deux
lignes, pas une refonte. Si en marchant sur ce fichier tu repères d'autres
hooks mal placés ou un pattern similaire dans un AUTRE composant du
projet, les lister plutôt que de les corriger dans la foulée sans
validation séparée.
