# PROMPT — Bande blanche en haut de l'écran quand une modale de paiement s'ouvre

## Symptôme

À l'ouverture de `BoostCheckoutModal` (et probablement `SubscriptionCheckoutModal`,
même code), une fine bande reste blanche/non floutée tout en haut de
l'écran, au-dessus du flou/assombrissement de fond censé couvrir 100% du
viewport. Capture utilisateur jointe (modale "Boost de visibilité") — jugé
"pas crédible, ça fait amateur", à corriger partout où ça peut se produire.

## Cause identifiée

Le SaaS a déjà un composant standard pour ça : `src/components/Modal.jsx`,
qui rend son overlay via `createPortal(<div className="fixed inset-0 ...">, document.body)`.
Son commentaire dit explicitement : *"Rendu via createPortal(document.body)
pour garantir que l'overlay couvre 100% du viewport, y compris le header
sticky et la navbar."* C'est le composant utilisé par la quasi-totalité des
modales de l'app (TerrainFormModal, GerantVisibilityBoost, GerantTarifs,
Abonnement, CustomAlertModal, ImageCropperModal, PaymentModal, etc.)

Mais `src/components/BoostCheckoutModal.jsx` et
`src/components/SubscriptionCheckoutModal.jsx` **n'utilisent PAS** ce
composant. Ils rendent leur propre overlay codé en dur, directement dans
l'arbre React (pas de `createPortal`) :

```jsx
return (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
    ...
```

Comme ce `<div>` n'est pas téléporté à la racine de `document.body` mais
reste imbriqué dans l'arbre du composant appelant (potentiellement
lui-même sous un ancêtre avec padding/safe-area, transform ou structure de
layout particulière), il ne couvre pas réellement tout le viewport dans
tous les contextes — d'où la bande blanche visible en haut de l'écran.
`Login.jsx` a le même pattern dupliqué et est probablement concerné aussi.

## Ta tâche

1. Refactore `BoostCheckoutModal.jsx` et `SubscriptionCheckoutModal.jsx`
   pour utiliser le composant partagé `Modal` (`src/components/Modal.jsx`)
   au lieu de leur `<div className="fixed inset-0 ...">` codé en dur —
   même pattern que les autres modales du projet (regarde par exemple
   comment `TerrainFormModal.jsx` ou `CustomAlertModal.jsx` l'utilisent).
   Conserve tout le contenu/logique interne (les différents `status` —
   `redirecting`/`waiting`/`completed`/`timeout`/`failed`/formulaire — ne
   changent pas, seul le wrapper overlay change).
2. Vérifie `Login.jsx` : s'il a le même `fixed inset-0 backdrop-blur`
   dupliqué sans `createPortal`, corrige-le pareil.
3. Vérifie aussi `BottomNav.jsx` (a le même pattern `fixed inset-0
   backdrop-blur` dans un grep global) — confirme si c'est un vrai
   problème de modale plein écran ou un usage différent (ex: un simple
   fond flouté de barre de navigation) avant d'y toucher.

## Vérification

- Teste l'ouverture de `BoostCheckoutModal` et `SubscriptionCheckoutModal`
  sur mobile (ou responsive DevTools) ET desktop, notamment sur un écran
  avec encoche/safe-area (iPhone), pour confirmer que le flou/assombrissement
  couvre bien tout l'écran sans bande blanche résiduelle en haut.
- Confirme qu'aucune régression n'apparaît sur le comportement de fermeture
  au clic sur le backdrop (`onClose`), déjà géré par `Modal.jsx`.

## Interdictions

- Ne dupplique pas encore une fois le pattern `fixed inset-0 backdrop-blur`
  ailleurs pour "corriger localement" — le but est de converger vers l'
  unique composant `Modal` partagé, pas d'ajouter une troisième variante.
