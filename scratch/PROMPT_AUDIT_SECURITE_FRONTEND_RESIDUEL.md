# PROMPT — 2 correctifs mineurs restants de l'audit sécurité (2026-08-05)

## Contexte

Suite à l'audit de sécurité complet du 2026-08-05, tous les correctifs
backend/SQL/dépendances ont été appliqués directement (migration
`calculate_commission`, rate limiting persistant, suppression du code
mort `backend/server.js` et de l'Edge Function orpheline `create-gerant`,
CORS `chatbot-query`, `npm audit` → 0 vulnérabilité partout).

Il reste deux points mineurs (sévérité BASSE) qui touchent `src/` et sont
donc hors de mon scope (je ne modifie pas `src/` directement — cf. règle
projet). Aucun des deux n'est une vulnérabilité active exploitable
aujourd'hui, ce sont des durcissements de bonne pratique.

## 1. Log de debug non gardé en production

`src/components/BookingFlow.jsx` ligne 676-678 :

```jsx
onPaymentInitiated={(res) => {
  console.log('[BookingFlow] Paiement initialisé:', res);
}}
```

Ce `console.log` s'exécute en production et affiche dans la console
navigateur la réponse brute d'initiation de paiement (référence
UnitechPay, URL de paiement, etc.). Tous les autres `console.log`/
`console.error` du projet sont gardés par un flag `IS_DEV` (voir
`src/lib/apiClient.js:14`, `src/lib/errorHandler.js:59`,
`src/lib/securityLogger.js:117`) — celui-ci a été oublié.

**Correctif** : reprendre exactement le même pattern que le reste du
projet.

```jsx
const IS_DEV = import.meta.env.DEV; // en haut du fichier, si pas déjà présent

// ...
onPaymentInitiated={(res) => {
  if (IS_DEV) console.log('[BookingFlow] Paiement initialisé:', res);
}}
```

Vérifie si `BookingFlow.jsx` a déjà une constante équivalente
(`import.meta.env.DEV`) avant d'en ajouter une deuxième.

## 2. `uploadValidator.js` jamais appelé (optionnel, priorité basse)

`src/lib/uploadValidator.js` existe (validation taille/MIME déclaré/
patterns de chemin dangereux pour les uploads photos/documents terrain)
mais n'est importé nulle part dans `src/`. La vraie barrière de sécurité
existe déjà côté serveur (contraintes `file_size_limit`/
`allowed_mime_types` sur les buckets Supabase Storage
`terrain-photos`/`avatars`/`terrain-documents`), donc ce n'est **pas**
une vulnérabilité — juste une meilleure UX manquante (retour d'erreur
immédiat côté client au lieu d'attendre le rejet serveur).

Si tu as le temps : branche `uploadValidator` (ou la fonction qu'il
exporte) dans les composants d'upload de photos/documents terrain avant
l'appel à `supabase.storage.from(...).upload(...)` — à identifier via
`grep -r "storage.from" src/`. Sinon, laisse tel quel, ce n'est pas
prioritaire.

## Ce qui n'a PAS besoin d'être touché

- `src/App.jsx:227` (`publicViews`) — vérifié en détail : cette liste
  sert à rediriger un utilisateur **déjà connecté** hors des pages
  login/register/landing, pas à protéger l'accès. Y ajouter
  `paiement-attente`/`paiement-annule`/`reservation-failed` casserait le
  comportement (un joueur connecté qui vient de payer serait redirigé
  hors de l'écran de confirmation). Le rapport initial suggérait cette
  correction sans avoir vérifié la logique réelle — à ignorer.
- Le stockage du JWT en `localStorage` (`src/lib/supabase.js`) est le
  comportement standard du SDK Supabase pour une SPA sans backend
  dédié (BFF) ; refonte disproportionnée vu l'absence de tout point
  d'injection XSS dans le code actuel (vérifié : aucun
  `dangerouslySetInnerHTML` n'affiche de contenu utilisateur).
