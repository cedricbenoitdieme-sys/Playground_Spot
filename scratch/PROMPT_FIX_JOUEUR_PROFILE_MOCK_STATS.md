# Prompt — Stats fictives sur "Mon Profil" joueur (JoueurProfile.jsx)

## Diagnostic

`src/pages/JoueurProfile.jsx` lignes 15-23 : tout le state du profil est un
`useState()` avec des valeurs codées en dur, jamais branché sur une donnée
réelle :

```js
const [profile, setProfile] = useState({
  nom: currentUser.nom,
  email: currentUser.email,
  phone: "+221 77 123 45 67",       // ← faux, jamais currentUser.tel
  favPosition: "Milieu Offensif",   // ← faux, aucun champ DB pour ça
  matchs: 18,                       // ← faux, codé en dur
  hours: 36,                        // ← faux, codé en dur
  spent: "240K FCFA"                // ← faux, codé en dur
});
```

Et "VIP Or 🥇" est écrit en dur directement dans le JSX (ligne 62), pas dans
`profile` du tout.

**Confirmation demandée dans le rapport ("auditer la table pour d'autres
comptes affectés") : sans objet.** Ces valeurs ne sont stockées nulle part
en base — aucune colonne `matchs`/`hours`/`spent`/`rang` n'existe sur
`profiles` ni ailleurs. C'est un `useState` local recalculé identique à
chaque chargement de page, pour n'importe quel compte. Il n'y a donc rien à
nettoyer côté données — juste ce composant à corriger. Une fois corrigé,
tous les comptes (existants et nouveaux) afficheront leurs vraies valeurs.

## Correctif — backend déjà fait

Nouvelle RPC dans `supabase/migrations/20260802200000_joueur_profile_stats.sql`
(pas encore appliquée à la base distante) :

```js
const { data, error } = await supabase.rpc('get_joueur_profile_stats');
// data = { matchs_joues, heures_cumulees, montant_depense, reservations_total }
```

Pas de paramètre — toujours scopée à `auth.uid()` (RLS). Pour un compte tout
juste créé : `{ matchs_joues: 0, heures_cumulees: 0, montant_depense: 0,
reservations_total: 0 }`.

**Note de conception à connaître** : `matchs_joues` compte les réservations
`confirmee` **et** `terminee` — pas seulement `terminee`. En auditant le
code j'ai trouvé que le statut `terminee` est défini dans le schéma mais
**n'est actuellement jamais positionné nulle part** (ni trigger SQL, ni
frontend) — une réservation reste `confirmee` indéfiniment après la date du
match. Compter uniquement `terminee` afficherait donc toujours 0, pour
toujours, même pour un joueur très actif. C'est cohérent avec le reste du
schéma (`fetchProfileWithHistory`, stats gérant, etc. traitent déjà
`confirmee`+`terminee` comme un seul groupe "compte pour de vrai"). Si vous
voulez un jour distinguer "match à venir" de "match joué", il faudrait
d'abord un mécanisme qui bascule réellement le statut après la date —
sujet séparé, pas traité ici.

## Correctif attendu côté `JoueurProfile.jsx`

```jsx
const [stats, setStats] = useState({ matchs_joues: 0, heures_cumulees: 0, montant_depense: 0 });

useEffect(() => {
  if (!currentUser?.id) return;
  supabase.rpc('get_joueur_profile_stats')
    .then(({ data, error }) => { if (!error && data) setStats(data); })
    .catch(() => {});
}, [currentUser?.id]);

const statCards = [
  { label: "Matchs joués", value: stats.matchs_joues, icon: IconBallFootball },
  { label: "Heures cumulées", value: `${stats.heures_cumulees}h`, icon: IconClock },
  { label: "Montant dépensé", value: fmtCompact(stats.montant_depense), icon: IconTrendingUp }, // réutiliser un helper de formatage déjà existant (ex. formatAmountAbbreviated de services/stats.js) plutôt qu'en écrire un nouveau
];
```

## Rang fidélité — ⚠️ section obsolète, voir `PROMPT_LOYALTY_TIERS.md`

Un vrai système de paliers configurable (`public.loyalty_tiers` +
`get_loyalty_rang()`, intégré à `get_joueur_profile_stats()`) a depuis été
demandé et implémenté — cf. `scratch/PROMPT_LOYALTY_TIERS.md`, qui remplace
entièrement la recommandation ci-dessous ("réutiliser `niveau()`"). Suivez
ce nouveau document pour le rang fidélité, pas cette section.

<details><summary>Ancien contenu (conservé pour historique, ne plus suivre)</summary>

Le rapport suggère "Bronze"/niveau initial "selon le système de fidélité
prévu" — il n'existe qu'**un seul** système de paliers dans ce SaaS
aujourd'hui : le helper `niveau()` déjà utilisé côté admin
(`src/pages/Utilisateurs.jsx` lignes 18-23) :

```js
const niveau = (r) => {
  const count = r || 0;
  return count >= 15 ? { label: 'VIP', ... }
    : count >= 8  ? { label: 'Régulier', ... }
    : count >= 3  ? { label: 'Actif', ... }
    : { label: 'Nouveau', ... }; // ← palier de départ pour un compte neuf
};
```

Réutilisez exactement cette logique (idéalement extraite dans un helper
partagé, ex. `src/lib/loyalty.js`, importé des deux côtés — aujourd'hui
dupliquée nulle part ailleurs qu'à cet endroit) plutôt que d'inventer une
échelle "Bronze/Argent/Or" qui n'existe dans aucun autre écran. `count` =
`stats.matchs_joues` (ou `reservations_total`, à vous de choisir lequel est
le plus représentatif — `matchs_joues` me semble le plus juste). Un compte
neuf (0 réservation) tombe naturellement sur "Nouveau", satisfaisant la
contrainte "démarrer à zéro" sans cas particulier à coder.

</details>

## Bugs adjacents trouvés en lisant ce fichier (même composant, à trier)

1. **`saveProfile` (ligne 27-32) ne persiste rien — confirmé, c'est LE bug
   du rapport "modifications non sauvegardées".** Il ferme juste le mode
   édition et affiche un toast de succès — aucun appel réseau, aucune
   écriture en base. Un utilisateur qui modifie son nom/téléphone croit
   avoir sauvegardé alors que rien n'a changé.

   **RLS vérifiée, ce n'est PAS le blocage** : la policy
   `profiles_update_self` (`supabase/schema.sql` ligne 328-340) autorise
   `auth.uid() = id` à faire un `UPDATE`, avec un `WITH CHECK` qui bloque
   uniquement les changements de `role`/`statut` — `tel`, `nom`, `quartier`
   etc. ne sont pas concernés. Aucune migration nécessaire pour ce bug,
   100% frontend :

   ```js
   // src/services/profiles.js — nouvelle fonction, aucune n'existe encore
   // pour un update générique (updateProfileStatut ne gère que `statut`)
   export const updateOwnProfile = async (userId, updates) => {
     const { data, error } = await supabase
       .from('profiles')
       .update(updates) // { nom, tel, quartier, ... } — jamais role/statut
       .eq('id', userId)
       .select()
       .single();
     if (error) throw handleServiceError(error, 'updateOwnProfile');
     return data;
   };
   ```

   ```jsx
   // JoueurProfile.jsx
   const saveProfile = async (e) => {
     e.preventDefault();
     try {
       const updated = await updateOwnProfile(currentUser.id, {
         nom: profile.nom,
         tel: profile.phone,
         // favPosition : voir point 2 ci-dessous avant de l'inclure ici
       });
       setCurrentUser({ ...currentUser, nom: updated.nom, tel: updated.tel }); // garder le contexte à jour, pas seulement le state local
       setEditing(false);
       setToast(true);
       setTimeout(() => setToast(false), 3000);
     } catch (err) {
       console.error(err);
       // `toast` ici n'est qu'un booléen de succès (ligne 25) — il faudra soit
       // l'étendre en { type, message } soit ajouter un state d'erreur dédié
       // pour afficher un vrai message d'échec plutôt que rien.
     }
   };
   ```
   `setCurrentUser` vient de `useUser()` (déjà exposé par `UserContext.jsx`)
   — sans ça, le reste de l'app continuerait d'afficher l'ancien `tel`
   jusqu'au prochain rechargement complet.

   **Test du cycle complet demandé dans le rapport** : après ce correctif,
   modifier téléphone → sauvegarder → recharger la page → `UserContext`
   recharge le profil depuis la base (`getProfile`, `UserContext.jsx`) → la
   nouvelle valeur doit apparaître. À vérifier manuellement une fois branché.

2. **Pré-remplir `phone` depuis `currentUser.tel`, pas un faux placeholder.**
   Actuellement `phone: "+221 77 123 45 67"` en dur (ligne 18) — jamais lié
   au vrai numéro saisi à l'inscription. Remplacer par
   `phone: currentUser.tel || ''` dans le `useState` initial (même pattern
   que `nom`/`email` juste au-dessus, qui eux sont déjà corrects).

   **Un seul champ fait autorité — déjà le cas, rien à changer côté
   architecture** : `profiles.tel` est LA colonne (inscription → profil →
   tout le reste). Vérifié dans `src/components/paiement/ChoixPaiement.jsx`
   (lignes 38, 46-51) : le formulaire de paiement Wave/Orange Money
   pré-remplit déjà son champ téléphone depuis `currentUser.tel`, et ne le
   réécrit **jamais** dans `profiles` — la valeur éventuellement modifiée
   au moment de payer est stockée à part, dans `paiements.numero_tel`
   (une ligne par transaction). Ce n'est pas une désynchronisation : c'est
   volontaire et correct — au Sénégal il est courant de payer un Wave avec
   un numéro différent du sien (compte familial partagé, etc.). Ne changez
   rien à `ChoixPaiement.jsx` pour ce chantier ; assurez-vous juste que le
   correctif du point 1 ci-dessus n'introduit pas un deuxième champ
   téléphone quelque part — un seul `profiles.tel`, point.

   `favPosition` reste un cas séparé (aucune colonne DB, cf. ancien point 1
   déjà traité plus haut dans ce document) — ne pas le mélanger avec `tel`
   dans le même correctif tant que la décision produit n'est pas prise.

3. **Ligne 49 : `{currentUser.avatar}` affiché brut** dans le cercle avatar
   — même classe de bug que celui déjà corrigé sur la page admin
   "Utilisateurs" (cf. `scratch/PROMPT_FIX_AVATAR_URL_DISPLAY_BUG.md`, déjà
   traité côté `services/profiles.js`/`Utilisateurs.jsx`). Ici c'est
   `UserContext.jsx` qui expose déjà `currentUser.initiales` (calculé
   correctement, ligne 52 de ce fichier) — il suffit d'utiliser
   `{currentUser.initiales}` au lieu de `{currentUser.avatar}` à la ligne 49
   de `JoueurProfile.jsx`. Même symptôme visuel probable (URL Google qui
   déborde du cercle) pour tout joueur connecté via Google OAuth.

Ces 3 points ne faisaient pas partie du rapport de bug initial mais sont
dans le même fichier et de la même famille de problèmes ("données jamais
vraiment branchées") — à vous de prioriser.

## Contraintes

- Un compte neuf doit afficher 0 partout — déjà garanti par la RPC (SUM/COUNT
  sur un ensemble vide renvoient 0, pas NULL, grâce aux `COALESCE`).
- Ne pas toucher aux autres pages joueur (`JoueurHome.jsx`, etc.) dans ce
  chantier — hors périmètre de ce rapport de bug.
