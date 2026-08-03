# PROMPT — URGENT : Parametres.jsx plante au chargement (régression)

## Symptôme

Suite au dernier correctif (commissions par plan + dérogation), la page
Paramètres entière plante au rendu (`ReferenceError`), pour tous les
rôles (admin/gérant/joueur), pas juste la section Plateforme.

## Cause

Le remplacement du bloc `Commission plateforme` a supprimé des
déclarations `useState` **sans lien avec ce sujet**, encore utilisées
partout ailleurs dans le fichier :

- `const [toast, setToast] = useState(null)` + `const showToast = (msg) => {...}`
  — supprimés, mais `showToast(...)` est appelé ~20 fois dans le fichier
  (upload avatar, sauvegarde profil, mot de passe, dérogation commission...).
- `const [showCGU, setShowCGU] = useState(false)` (idem `showPrivacy`,
  `showSupport`) — supprimés, mais lus directement dans le JSX
  (`<Sheet open={showCGU} ...>` ligne 661, `onClick={() => setShowCGU(true)}`
  ligne 518) → plantage dès le rendu, pas juste au clic.

En plus, `handleSavePlat` (ligne 344) est resté dans le fichier alors que
plus rien ne l'appelle (remplacé par `handleActivateOverride`) — il
référence `handleUpdateSetting` et `platForm`, tous deux supprimés eux
aussi.

## Ta tâche

1. Réintroduis ces déclarations dans le corps du composant (n'importe où
   avant leur premier usage réel, par exemple juste après la déclaration
   de `plateforme` ligne ~166, comme c'était le cas avant) :
   ```jsx
   const [toast, setToast] = useState(null);
   const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

   const [showCGU, setShowCGU] = useState(false);
   const [showPrivacy, setShowPrivacy] = useState(false);
   const [showSupport, setShowSupport] = useState(false);
   ```
2. Supprime entièrement `handleSavePlat` (lignes 344-350) — mort, plus
   aucun appelant, référence des identifiants qui n'existent plus.
3. Vérifie qu'aucun autre appelant de `handleSavePlat` ne subsiste
   ailleurs dans le fichier (formulaire `onSubmit`, etc.) avant de le
   supprimer.

## Vérification

- Charge réellement la page Paramètres dans le navigateur (pas juste
  `npm run build`) en tant qu'admin — confirme qu'elle s'affiche sans
  erreur console.
- Teste un toast (ex: change le mot de passe avec un mauvais mot de passe
  actuel) — le message d'erreur doit s'afficher normalement.
- Ouvre "Conditions d'utilisation"/"Politique de confidentialité"/"Support"
  depuis la section "À propos" — les trois doivent s'ouvrir sans plantage.
