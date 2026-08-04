# PROMPT — URGENT : 6 bugs réels trouvés par `npm run lint` (variables non définies)

## Contexte

Suite au crash "Mon Profil" (`getRangClient is not defined`), un `npm run
lint` complet a été lancé sur tout le projet. Ce script existe déjà dans
`package.json` (`"lint": "eslint ."`) mais n'était apparemment jamais
exécuté avant de livrer — la règle `no-undef` (incluse dans
`js.configs.recommended`, déjà configurée dans `eslint.config.js`) aurait
attrapé tous les bugs ci-dessous automatiquement.

**Sur 421 problèmes remontés au total, la quasi-totalité est du bruit**
(imports React inutiles depuis le passage au JSX transform automatique,
variables `process`/`Buffer` non définies dans des scripts Node sous
`backend/`/`scratch/`/`api/` — hors périmètre navigateur, avertissements
`react-hooks/set-state-in-effect` qui sont des suggestions de style, pas
des bugs). **Seuls 6 cas sont de vrais bugs `no-undef` dans du code
navigateur réellement exécuté**, détaillés ci-dessous. Corrige uniquement
ceux-là — ne "corrige" pas le bruit sans qu'on te le demande séparément.

## Les 6 bugs réels

### 1. `src/pages/JoueurProfile.jsx:136` — `getRangClient is not defined`
Déjà diagnostiqué (c'est le crash "Mon Profil" du joueur, capture
utilisateur reçue). Import manquant :
```jsx
// ligne 20, actuellement :
import { getLoyaltyBadge } from '../lib/loyalty';
// →
import { getLoyaltyBadge, getRangClient } from '../lib/loyalty';
```

### 2. `src/App.jsx:136` — `ADMIN_EMAILS is not defined`
```jsx
const isAdminEmail = ADMIN_EMAILS.includes(currentUser.email || '');
```
`ADMIN_EMAILS` n'est déclarée ni importée nulle part dans le projet — ce
bypass admin par email n'a jamais fonctionné. Comme c'est dans une
fonction `async` appelée depuis un `useEffect` sans `.catch()`, ça échoue
en silence (rejection non gérée) plutôt que de crasher visiblement — mais
ça fait échouer TOUT le check `checkSubscriptionStatus()` pour chaque
admin/gérant à chaque connexion, qui retombe alors sur le timeout de
secours de 5s (ligne ~97-102) au lieu de résoudre instantanément. Fix
minimal et sûr (ne invente pas d'emails) :
```jsx
// Ajouter en haut du fichier, au niveau module (hors du composant) :
const ADMIN_EMAILS = [];
```
Si l'utilisateur veut de vrais emails dans cette liste de bypass, il te
les donnera séparément — ne mets rien d'autre qu'un tableau vide pour
l'instant, c'est le comportement actuellement voulu de toute façon (le
bypass par rôle `admin`/`super_admin` juste après continue de fonctionner
normalement, inchangé).

### 3. `src/pages/GerantDashboard.jsx:642` — `slot is not defined`
```jsx
onClick={() => { setSelectedReservation(slot.reservation); setSelectedSlotDetail(null); }}
```
`slot` n'existe pas dans ce scope — la variable disponible est
`selectedSlotDetail` (utilisée juste avant/après, lignes 630 et 639).
Fix :
```jsx
onClick={() => { setSelectedReservation(selectedSlotDetail.reservation); setSelectedSlotDetail(null); }}
```
Plante le bouton "Voir détails réservation" pour tout gérant cliquant sur
un créneau réservé — impact réel et fréquent.

### 4. `src/pages/GerantTerrain.jsx:134,148,167,181` — `setError is not defined`
`setError` est appelé dans 4 blocs `catch` (mise à jour prix, bascule
maintenance, ajout/retrait commodité) mais l'état `error`/`setError` n'a
jamais été déclaré. Le JSX attend pourtant déjà `error` à 4 endroits pour
l'afficher (lignes ~197, 246, 338, 398 — `{error && (...)}`), donc
aucun changement JSX nécessaire, juste ajouter l'état manquant. Ajoute,
par exemple juste après `saving` (ligne 34) :
```jsx
const [error, setError] = useState(null);
```
Impact : quand une de ces 4 actions échoue (cas déjà anormal), l'app
plante EN PLUS au lieu d'afficher un message d'erreur propre — un échec
silencieux devient un crash visible.

### 5. `src/components/TerrainFormModal.jsx:958` — `IconCash is not defined`
```jsx
<IconCash size={18} className="text-[#1A7A4A]" />
```
`IconCash` n'est pas importé ; `IconCoin` l'est mais n'est utilisé nulle
part dans le fichier (import mort, lint le confirme aussi). Vu la
proximité des deux noms, il s'agit très probablement du même import
mal renommé. Fix le plus simple :
```jsx
<IconCoin size={18} className="text-[#1A7A4A]" />
```
Vérifie visuellement que `IconCoin` convient au contexte (probablement
une section liée au prix/tarif du terrain) avant de valider — si un autre
icône de `@tabler/icons-react` convient mieux visuellement, importe-le à
la place, mais ajoute bien l'import dans ce cas.

### 6. `src/components/StatsGrid.jsx` — `filter`/`filterOptions` non définis (7 occurrences, lignes 172, 200-203, 242)
Ce composant est actuellement **mort/jamais rendu** (`App.jsx` l'importe
mais ne l'utilise nulle part — lint le confirme : `'StatsGrid' is defined
but never used`). Donc **aucun utilisateur ne peut être impacté
aujourd'hui**. Corrige quand même par cohérence (le "plus jamais" demandé
vaut aussi pour du code aujourd'hui dormant qui pourrait être
réactivé) : regarde le contexte de chaque usage de `filter`/`filterOptions`
dans ce fichier pour comprendre l'intention (probablement une variable de
filtrage jamais déclarée en state/prop) et corrige en conséquence — pas
de fix générique à copier-coller ici, ça dépend de ce que le composant
est censé faire. Si le composant est entièrement obsolète/remplacé par un
autre (à vérifier), envisage de le supprimer plutôt que de le réparer —
à ton jugement.

## Process — pour que ça n'arrive plus jamais

**Avant de considérer une tâche "terminée", lance systématiquement `npm
run lint` et corrige tout nouveau `no-undef`/`no-unused-vars` introduit
par tes changements** (ignore le bruit préexistant listé ci-dessus sauf
demande explicite de nettoyage). C'est un filet de sécurité gratuit et
quasi-instantané qui aurait évité les deux derniers crashs en prod
(`Parametres.jsx` et `JoueurProfile.jsx`) — le `npm run build` seul ne
suffit pas, Vite/esbuild ne vérifie pas les références non définies aussi
strictement qu'ESLint.

## Vérification

- Après tous les correctifs, relance `npm run lint` et confirme que les 6
  bugs listés ci-dessus n'apparaissent plus dans la sortie (le reste du
  bruit peut subsister, hors scope).
- Teste manuellement dans le navigateur : "Mon Profil" (joueur), le
  dashboard gérant (clic sur un créneau réservé → "Voir détails
  réservation"), la page "Mon Terrain" (déclenche une erreur volontaire,
  ex. commodité invalide, pour voir le message d'erreur s'afficher
  proprement au lieu de planter), et le formulaire de création/édition de
  terrain (zone avec l'icône ligne 958).
- Confirme qu'un admin/gérant se connectant n'attend plus les 5 secondes
  du timeout de secours pour que `subStatus` se résolve (point 2).

## Interdictions

- Ne touche à rien d'autre que ces 6 points précis — pas de nettoyage
  générique des centaines d'avertissements `no-unused-vars`/imports React
  inutiles, hors scope de ce correctif urgent.
- N'invente pas d'adresses email pour `ADMIN_EMAILS` — tableau vide
  uniquement, sauf instruction contraire explicite de l'utilisateur.
