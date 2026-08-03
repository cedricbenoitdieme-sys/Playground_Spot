# Prompt — URL d'avatar Google affichée en texte brut (page "Utilisateurs" / Gestion des joueurs)

## Diagnostic (déjà fait, confirmé en base réelle — 100% frontend, aucune migration nécessaire)

Vérifié directement sur la base réelle (service role key) pour les deux
comptes cités : **les données en base sont parfaitement propres.**

```json
// profiles — Elhadj Sylla
{ "nom": "Elhadj Sylla", "avatar": "https://lh3.googleusercontent.com/a/ACg8ocLZT0..." }
// profiles — Khadijah Sarr
{ "nom": "Khadijah Sarr", "avatar": "https://lh3.googleusercontent.com/a/ACg8ocJQ..." }
```

`raw_user_meta_data` (source Google OAuth, table `auth.users`) est également
propre — `full_name`/`name` et `avatar_url`/`picture` sont bien deux clés
distinctes, aucun mélange. La colonne `nom` ne contient jamais l'URL. Le
trigger `handle_new_user()` (`supabase/migrations/20260721130000_google_oauth_profile_sync.sql`)
écrit correctement chaque valeur dans sa propre colonne (`nom` vs `avatar`).
**Aucune action DB/trigger nécessaire — la piste "callback OAuth" du rapport
de bug est écartée, vérifiée sur données réelles.**

## Cause réelle trouvée

`src/services/profiles.js` calcule un champ `initiales` à **4 endroits**,
tous avec le même bug — l'URL d'avatar est utilisée comme valeur de repli
prioritaire au lieu des initiales calculées :

```js
initiales: p.avatar || getInitiales(p.nom),   // ligne 56  (fetchProfiles)
initiales: g.avatar || getInitiales(g.nom),   // ligne 87  (fetchGerants)
initiales: j.avatar || getInitiales(j.nom),   // ligne 107 (fetchJoueurs)
initiales: profile.avatar || getInitiales(profile.nom), // ligne 166 (fetchProfileWithHistory)
```

Comme `p.avatar` est presque toujours "vrai" (une string non vide) dès qu'un
utilisateur a un avatar Google, `p.avatar || getInitiales(p.nom)` retourne
**la totalité de l'URL** — jamais les initiales — pour tout compte OAuth.
`getInitiales(p.nom)` n'est appelé (silencieusement) que pour les comptes
sans avatar du tout.

Ce champ `initiales` alimente ensuite le badge rond dans
`src/pages/Utilisateurs.jsx` (`UserCard`, ligne 61-63) :

```jsx
<div className="w-12 h-12 rounded-xl ...">
  {u.initiales || (u.nom || '').substring(0,2).toUpperCase()}
</div>
```

Cette page **n'affiche jamais de vraie photo d'avatar** (pas de `<img
src={u.avatar}>` nulle part dans ce fichier) — c'est uniquement un badge
d'initiales. Résultat : une URL de 60+ caractères forcée dans une boîte de
48×48px → débordement visuel sur le nom / les badges / la ligne "Dakar ·
inscrit le...", exactement comme rapporté.

## Correctif attendu

Dans les 4 occurrences de `src/services/profiles.js` listées ci-dessus,
retirer purement et simplement le `p.avatar ||` — il n'a aucune raison
d'être ici puisque rien ne consomme jamais `initiales` comme une URL
d'image :

```js
initiales: getInitiales(p.nom),
```

(idem pour `g`, `j`, `profile` selon la fonction).

Si l'intention initiale était plutôt d'afficher une vraie photo de profil
quand elle existe (avatar réel + fallback initiales), c'est un changement
plus large — pas ce que ce bug demande de corriger, mais si vous voulez
l'ajouter : `UserCard` afficherait alors `<img src={u.avatar}>` avec
`onError` retombant sur le badge d'initiales existant, plutôt que de
mélanger les deux dans le même champ `initiales`. À valider avec le produit
avant de le faire — le correctif minimal ci-dessus suffit à éliminer le bug
rapporté.

## Nettoyage des données existantes

**Rien à nettoyer en base** — c'est un bug de calcul purement côté client
(`initiales` n'est jamais persisté, recalculé à chaque fetch). Une fois le
correctif ci-dessus appliqué, tous les comptes Google OAuth (Elhadj Sylla,
Khadijah Sarr, et tout futur compte) afficheront correctement leurs
initiales sans aucune migration.

## Sur la pérennité des URLs Google avatar (point soulevé dans le rapport)

Vous vous demandiez si les URLs `googleusercontent.com` restent valides dans
le temps. Actuellement ce n'est même pas testable/visible puisqu'aucune
image n'est réellement chargée sur cette page (juste le badge d'initiales).
Si un jour vous ajoutez l'affichage de la vraie photo (cf. paragraphe
ci-dessus), ces URLs Google sont généralement stables tant que le compte
Google existe (pas de token d'expiration comme les URLs signées Supabase
Storage), mais peuvent changer si l'utilisateur change sa photo de profil
Google — un `onError` de fallback vers les initiales reste recommandé dans
tous les cas plutôt que de copier la photo vers Supabase Storage (complexité
inutile pour ce cas d'usage, contrairement au bucket `terrain-photos` qui a
une vraie contrainte de confidentialité).

## Vérification annexe — compteurs Actifs/Suspendus/Inactifs qui débordent

Vérifié : `stats.actifs/suspendus/inactifs` (`Utilisateurs.jsx` lignes
176-182) sont de simples `.filter(...).length` — toujours des entiers
courts, aucune anomalie de donnée possible ici. **C'est purement un problème
CSS/layout**, à traiter côté Front (le badge chiffré déborde du bandeau
coloré, probablement une taille de police ou un `min-h`/`overflow` mal
calibré sur le composant KPI, lignes ~196-210 de `Utilisateurs.jsx`).

## Bonus — bug adjacent trouvé en lisant ce fichier (hors périmètre du rapport, à trier)

`fetchJoueurs()` (`src/services/profiles.js` lignes 97-109) ne calcule ni
`depenses` ni `reservations` par utilisateur (contrairement à
`fetchProfileWithHistory`, qui lui les calcule pour la vue détail d'un seul
profil). Conséquence : dans `Utilisateurs.jsx`, `stats.totalDepenses`
(ligne 181, `reduce((s,u) => s + u.depenses, 0)`) fait toujours
`0 + undefined = NaN` → le sous-titre "X FCFA générés" en haut de page
(ligne 192) affiche silencieusement "—" au lieu du vrai total. Le tri par
"Dépenses"/"Réservations" (`TRIS`, ligne 84-88) est probablement cassé pour
la même raison. Je le signale car je suis tombé dessus en diagnostiquant le
bug demandé, mais je ne l'ai pas corrigé — pas dans le périmètre de cette
demande, à vous de me dire si vous voulez que ce soit traité maintenant ou
dans un autre chantier.
