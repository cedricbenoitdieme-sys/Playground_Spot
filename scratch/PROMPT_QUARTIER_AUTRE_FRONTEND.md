# Prompt — Champ "Autre" quartier à l'inscription (intégration frontend)

## Diagnostic confirmé (base réelle)

`src/pages/Register.jsx` ligne 41-44 :
```js
const QUARTIERS = [
  'Almadies', 'Plateau', 'Médina', 'Parcelles Assainies',
  'Ouakam', 'Yoff', 'Mermoz', 'Guédiawaye', 'Pikine', 'Rufisque', 'Autre'
];
```
`'Autre'` est une option comme les autres dans le `<CustomSelect>` (ligne
348-355) — aucun champ texte n'apparaît quand elle est choisie. `form.quartier`
reste donc littéralement `"Autre"`, envoyé tel quel à `signUp()` (ligne
86-93), qui le passe en métadonnées OAuth/signup jusqu'à
`profiles.quartier`.

Audité sur la base réelle : **un seul compte concerné** à ce jour — "Drix"
(`drixtplc@gmail.com`, joueur, `quartier: 'Autre'`, créé 2026-08-02). Aucun
terrain affecté (`terrains.quartier` est un champ séparé, jamais "Autre").

## Décision de conception déjà prise (backend)

Migration déjà écrite : `supabase/migrations/20260802210000_quartier_personnalise_fix.sql`
(pas encore appliquée à la base distante).

**On garde `profiles.quartier` comme champ unique affiché partout** — pas
de deuxième colonne "quartier personnalisé". Dès que la vraie valeur tapée
par l'utilisateur y est stockée, tous les écrans qui lisent déjà
`quartier` (profil, cartes joueur "Utilisateurs.jsx", filtres gérant,
stats démographiques) l'affichent correctement **sans aucune modification
de leur côté** — aucun autre fichier à toucher pour ça.

Seul ajout : une colonne `profiles.quartier_hors_liste BOOLEAN DEFAULT
false`, pour repérer plus tard les quartiers saisis hors de la liste
officielle les plus fréquents (utile pour enrichir `QUARTIERS`). Le compte
"Drix" a été nettoyé par la migration : `quartier` remis à `NULL` (pas
"Autre", qui n'est pas un vrai nom de quartier — pas de fausse donnée
laissée en place).

## Correctif attendu

### 1. Formulaire d'inscription (`Register.jsx`)

Quand `form.quartier === 'Autre'`, afficher un champ texte obligatoire
juste en dessous du `<CustomSelect>` :

```jsx
const [quartierCustom, setQuartierCustom] = useState('');
const isAutre = form.quartier === 'Autre';

// ... après le CustomSelect quartier :
{isAutre && (
  <input
    type="text"
    placeholder="Nom de votre quartier"
    value={quartierCustom}
    onChange={(e) => setQuartierCustom(e.target.value)}
    required
    className="..." // même style que les autres inputs du form
  />
)}
```

Validation à l'étape `handleSubmit` (avant l'appel à `signUp`) :
```js
const quartierFinal = isAutre ? quartierCustom.trim() : form.quartier;
if (!quartierFinal) {
  return setError('Merci de préciser votre quartier.');
}
if (isAutre && quartierFinal.toLowerCase() === 'autre') {
  return setError('Merci de saisir le nom réel de votre quartier.');
}
```
C'est ce qui satisfait la contrainte "obligatoire, liste OU personnalisé,
jamais valider Autre sans saisir de nom".

### 2. Appel signUp — passer la vraie valeur + le flag de provenance

```js
const result = await withTimeout(signUp({
  email: form.email.trim(),
  password: form.password,
  nom: form.nom.trim(),
  role,
  quartier: quartierFinal, // ← plus jamais littéralement "Autre"
  tel: form.tel.trim(),
}), 10000);

// quartier_hors_liste : mettre à jour APRÈS le signUp plutôt que de
// modifier le trigger handle_new_user() (⚠️ voir note ci-dessous) — un
// simple update authentifié, couvert par la policy RLS "profiles_update_self"
// déjà en place :
if (isAutre && result?.user?.id) {
  await supabase.from('profiles')
    .update({ quartier_hors_liste: true })
    .eq('id', result.user.id);
}
```

Regardez la forme exacte de ce que retourne `signUp()` dans
`src/services/auth.js` pour adapter `result.user.id` (peut être
`result.session.user.id` selon l'implémentation actuelle) — je ne l'ai pas
modifié, à vérifier avant de brancher ce follow-up.

### 3. Compléter le quartier pour les comptes existants sans quartier

Après cette migration, 3 comptes joueur ont `quartier IS NULL` : "Drix"
(nettoyé par la migration) + 2 comptes déjà `NULL` avant (probablement des
inscriptions Google OAuth, qui ne collectent pas ce champ aujourd'hui).
Recommandation : un bandeau/prompt "Complétez votre quartier" affiché sur
le profil ou à la prochaine connexion quand `currentUser.quartier` est
`null` — réutilise le même signal pour les 3 cas, pas besoin de traiter
"Drix" spécifiquement. Formulaire de complétion = même logique
liste+"Autre" que ci-dessus, avec un `UPDATE profiles SET quartier = ...,
quartier_hors_liste = ... WHERE id = auth.uid()`.

## ⚠️ À savoir avant de toucher au trigger `handle_new_user()`

En diagnostiquant ce bug j'ai remarqué une incohérence entre les fichiers
de migration et le comportement réel en base : la dernière définition de
`handle_new_user()` que je trouve dans `supabase/migrations/` (dans
`20260722150000_subscription_system.sql`) **n'inclut pas** la logique
d'extraction d'avatar/nom Google OAuth (`full_name`/`picture`, ajoutée par
`20260721130000_google_oauth_profile_sync.sql`, chronologiquement
antérieure). Pourtant, en interrogeant la base réelle, les comptes Google
OAuth créés après le 22 juillet ont bien un `avatar` et un `nom` corrects —
donc la fonction réellement active en production **diffère** de ce que les
fichiers de migration versionnés donneraient si on les rejouait dans
l'ordre. Probablement un correctif appliqué directement via le SQL Editor
Supabase, jamais committé comme migration.

**Conséquence pratique pour ce chantier** : je n'ai délibérément pas touché
à `handle_new_user()` dans `20260802210000_quartier_personnalise_fix.sql`
(risque de régresser silencieusement la logique avatar/nom réellement en
prod si je me base sur une version obsolète du fichier). D'où le choix du
follow-up UPDATE côté client au lieu de faire passer `quartier_hors_liste`
par le trigger. Si vous voulez un jour remettre `handle_new_user()` en
cohérence avec la prod (fichier de migration qui reflète vraiment ce qui
tourne), il faudra d'abord relire sa définition actuelle directement depuis
le SQL Editor Supabase (`SELECT pg_get_functiondef('public.handle_new_user'::regproc);`)
plutôt que de faire confiance aux fichiers du repo — sujet séparé, pas
traité ici.

## Contraintes

- Ne pas ajouter de deuxième colonne texte pour le quartier personnalisé —
  décision déjà prise, cf. ci-dessus.
- Ne pas modifier `handle_new_user()` dans ce chantier (cf. note ci-dessus).
- Le champ `quartier` doit rester obligatoire à l'inscription, liste OU
  texte libre non vide et différent de "Autre".
