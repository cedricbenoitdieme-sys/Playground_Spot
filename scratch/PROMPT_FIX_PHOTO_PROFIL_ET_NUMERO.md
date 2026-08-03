# PROMPT — Photo de profil (upload + recadrage) et vérification sauvegarde numéro

## Contexte (capture utilisateur)

Sur "Paramètres Plateforme" (Super Admin, mais concerne tous les rôles),
trois demandes autour de la section "Mon profil" :
1. L'avatar affiche `??` au lieu d'une vraie valeur — bug immédiat.
2. Le SaaS doit permettre d'ajouter une vraie photo de profil, la recadrer
   (PNG/JPEG/HEIC) avec un recadreur au style graphique du SaaS, et
   l'afficher correctement partout où l'avatar apparaît.
3. Le numéro de téléphone enregistré dans "Mon profil" doit être
   réellement sauvegardé.

**Déjà fait côté backend** : migration
`supabase/migrations/20260803200000_profile_avatar_storage.sql` crée un
bucket Storage **public** `avatars` (contrairement à `terrain-photos` qui
est privé — une photo de profil n'a pas besoin d'être cachée), avec RLS
sur `storage.objects` limitant chaque utilisateur à sa propre photo
(chemin `avatars/<user_id>/<uuid>.<ext>`). La colonne `profiles.avatar`
existe déjà (TEXT) — pas de migration de schéma nécessaire, juste une
clarification d'usage (voir section 2 ci-dessous).

**Déjà fonctionnel, rien à faire** : le pré-remplissage du numéro de
téléphone dans les formulaires de paiement Wave/Orange Money (réservation
via `ChoixPaiement.jsx`, abonnement via `SubscriptionCheckoutModal.jsx`,
boost via `BoostCheckoutModal.jsx`) est déjà implémenté — `useState(currentUser?.tel || '')`
+ un `useEffect` de synchronisation, champ librement éditable/effaçable
dans les trois cas. Vérifie juste que ça fonctionne une fois le point 3
réglé (numéro réellement en base).

---

## 1. Bug immédiat — avatar affiche "??"

`src/pages/Parametres.jsx` ligne 255 :
```jsx
<div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-primary/20 flex-shrink-0">
  {currentUser?.avatar || '??'}
</div>
```
Incohérent avec le pattern utilisé PARTOUT ailleurs dans l'app pour
calculer les initiales de secours (`Sidebar.jsx:175`, `BottomNav.jsx:183`,
`Header.jsx:248`, `Utilisateurs.jsx:67`) :
```jsx
currentUser.initiales || (currentUser.nom || '').substring(0, 2).toUpperCase()
```
Remplace la ligne 255 par ce même pattern (en gardant `'??'` comme tout
dernier filet de sécurité si même `nom` est vide) :
```jsx
{currentUser?.initiales || (currentUser?.nom || '').substring(0, 2).toUpperCase() || '??'}
```
Ça règle le bug immédiatement, indépendamment du reste (point 2).

## 2. Upload + recadrage de la vraie photo de profil

### Clarifier l'usage de `profiles.avatar`

Actuellement `avatar` est utilisé de façon ambiguë : parfois une vraie URL
(avatar Google OAuth, `Login.jsx:197` / migration
`20260721130000_google_oauth_profile_sync.sql`), parfois du texte
d'initiales calculé en fallback (aussi `Login.jsx:197`). Désormais :
- `profiles.avatar` = UNIQUEMENT une vraie URL d'image, ou `NULL`. Ne plus
  jamais y écrire des initiales calculées (`Login.jsx:197` doit stocker
  `profile.avatar` tel quel — potentiellement `NULL` — sans fallback
  initiales dedans).
- Les initiales de secours restent exclusivement calculées à l'affichage
  via `currentUser.initiales` (déjà géré par `getInitiales()` dans
  `UserContext.jsx`/`services/profiles.js`), jamais stockées dans `avatar`.

### Composant de recadrage

`src/components/ImageCropperModal.jsx` existe déjà mais est câblé en dur
pour un ratio **16:9** (pensé pour les photos de terrain, message "pour un
rendu optimal sur la fiche terrain" visible dans l'UI). Pour un avatar, il
faut un cadre **carré (1:1)**, généralement affiché en cercle
(`rounded-full`) dans l'UI.

Deux options, à ton appréciation :
- Généraliser `ImageCropperModal` avec une prop `aspectRatio` (`16/9` par
  défaut, `1` pour les avatars) et adapter `targetWidth`/`targetHeight`
  dans `handleConfirmCrop` en conséquence (au lieu des valeurs 1280x720 en
  dur), plus une prop `shape` (`'rect'` | `'circle'`) pour l'overlay de
  guidage (cercle au lieu de grille rectangulaire pour un avatar).
- Ou dupliquer en un `AvatarCropperModal.jsx` dédié si la généralisation
  s'avère trop intrusive sur le composant existant (déjà utilisé pour les
  terrains, ne pas régresser ce flux).
Garde le même style graphique sombre (`bg-[#0F2318]`, `border-white/10`,
`rounded-[2rem]`) déjà présent dans `ImageCropperModal.jsx` — c'est déjà
cohérent avec le reste du SaaS, à conserver tel quel.

### Flux d'upload

1. Ajoute un input file (accept `image/jpeg,image/png,image/webp,image/heic`)
   déclenché par le bouton crayon déjà présent à côté de l'avatar dans
   `Parametres.jsx` (ligne ~262, actuellement ouvre juste le formulaire
   texte — sépare "changer la photo" de "changer nom/téléphone", ou garde
   les deux dans le même sheet selon ce qui te semble le plus clair).
2. Au choix d'un fichier, ouvre le cropper (1:1) au lieu de l'upload direct.
3. Au blob recadré généré (`onCropComplete`), upload vers le bucket
   `avatars` en suivant le pattern de `uploadTerrainPhoto`
   (`src/services/terrains.js:367`) — crée une fonction équivalente (ex:
   `uploadAvatarPhoto` dans un fichier `src/services/profiles.js` déjà
   existant, ou `src/services/auth.js`) :
   ```js
   export const uploadAvatarPhoto = async (blob, userId) => {
     const filename = `${crypto.randomUUID()}.jpg`; // toujours JPEG en sortie du cropper (canvas.toBlob 'image/jpeg')
     const filePath = `${userId}/${filename}`;
     const { error: uploadError } = await supabase.storage
       .from('avatars')
       .upload(filePath, blob, { contentType: 'image/jpeg', upsert: false });
     if (uploadError) throw handleServiceError(uploadError, 'uploadAvatarPhoto');

     const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
     return data.publicUrl; // bucket public, URL stable, pas de signature nécessaire
   };
   ```
4. Après upload, appelle `updateProfile(userId, { avatar: publicUrl })`
   (déjà existant dans `src/services/auth.js`, aucune modification
   nécessaire de cette fonction).
5. Optionnel mais propre : si un ancien avatar existait
   (`currentUser.avatar` pointait déjà vers `avatars/<userId>/...`),
   supprime l'ancien fichier du bucket après succès du nouvel upload
   (`supabase.storage.from('avatars').remove([oldPath])`) pour éviter
   d'accumuler des fichiers orphelins — extrais l'ancien `storage_path`
   depuis l'URL publique stockée.

### Affichage partout où l'avatar apparaît

Remplace le rendu texte-seul par : `<img>` si `currentUser.avatar` est une
URL valide, sinon les initiales (même logique que le point 1). Fichiers
concernés (cercle/carré arrondi selon le style déjà en place à chaque
endroit — ne change pas la forme/taille existante, juste texte → image
conditionnelle) :
- `src/pages/Parametres.jsx` (bloc "Mon profil", ligne ~253-256)
- `src/components/Header.jsx` (ligne ~248)
- `src/components/Sidebar.jsx` (ligne ~175)
- `src/components/BottomNav.jsx` (ligne ~183)
- `src/pages/Utilisateurs.jsx` (lignes ~67, ~301)
- `src/pages/JoueurProfile.jsx` (ligne ~173)
- `src/pages/Gerants.jsx` (lignes ~66, ~310) — vérifie si les gérants
  doivent aussi pouvoir uploader une photo (a priori oui, même mécanisme,
  juste déclenché depuis leur propre page Paramètres/Profil s'ils en ont
  une équivalente à `Parametres.jsx`)

Exemple de pattern à généraliser (peut valoir la peine d'en faire un petit
composant partagé `Avatar.jsx` réutilisé partout plutôt que dupliquer la
logique conditionnelle dans chacun de ces 7 fichiers) :
```jsx
{currentUser?.avatar ? (
  <img src={currentUser.avatar} alt={currentUser.nom} className="w-full h-full object-cover rounded-full" />
) : (
  <span>{currentUser?.initiales || (currentUser?.nom || '').substring(0, 2).toUpperCase() || '??'}</span>
)}
```

## 3. Vérifier la sauvegarde du numéro de téléphone

Le code de `handleSaveProfil` (`Parametres.jsx` ligne 173) appelle déjà
`updateProfile(currentUser.id, { nom, tel })`, qui écrit sur
`profiles.tel` — en lecture de code, ça semble déjà fonctionnel. Mais
l'utilisateur rapporte un problème de sauvegarde. Actions :
1. Reproduis le scénario exact (Paramètres → Téléphone → modifier →
   Enregistrer) et confirme si `profiles.tel` est bien mis à jour en base
   après le clic.
2. Si ça échoue silencieusement ou avec une erreur, vérifie la policy RLS
   UPDATE sur `profiles` pour l'utilisateur lui-même (`auth.uid() = id`)
   — c'est le suspect le plus probable si l'écriture est bloquée côté
   serveur sans erreur visible côté UI.
3. Si tout fonctionne déjà correctement en test, dis-le explicitement
   dans ton rapport plutôt que de "corriger" quelque chose qui n'est pas
   cassé.

## Vérification finale

- Upload d'une photo JPEG, PNG et HEIC chacun testés, recadrage 1:1
  fonctionnel (zoom/rotation comme pour les terrains), photo affichée
  immédiatement et correctement partout listé en section 2 après
  sauvegarde — y compris après un rechargement complet de la page
  (persistance réelle, pas juste un état local temporaire).
- Modifier le numéro de téléphone dans Paramètres, recharger la page,
  confirmer qu'il est toujours là.
- Retester un paiement Wave/Orange Money (abonnement ou boost) et
  confirmer que le numéro pré-rempli correspond bien au numéro sauvegardé.

## Interdictions

- Ne casse pas le flux existant d'upload de photos de terrain
  (`ImageCropperModal.jsx` utilisé par `TerrainFormModal.jsx`) en
  généralisant le composant — teste les deux flux (terrain 16:9 et avatar
  1:1) après modification si tu choisis l'option de généralisation plutôt
  que la duplication.
- Ne stocke pas d'initiales calculées dans `profiles.avatar` — uniquement
  une URL réelle ou `NULL` (voir section 2).
