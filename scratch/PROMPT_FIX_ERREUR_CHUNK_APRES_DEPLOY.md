# PROMPT — Écran d'erreur rouge après chaque déploiement (chunk Vite introuvable)

## Symptôme

"Une fois sur deux, sur presque toutes les pages", l'utilisateur tombe sur
l'écran d'erreur générique de `ErrorBoundary.jsx` :
```
Erreur d'affichage du composant
Failed to fetch dynamically imported module: https://playground-spot.vercel.app/assets/Login-BGKcSDab.js
```
Capture utilisateur jointe.

## Cause identifiée

`src/App.jsx` charge quasiment toutes les pages via `React.lazy(() =>
import('./pages/...'))` (code-splitting Vite — ~30 pages listées lignes
9-41). Chaque build Vite génère des noms de fichiers hashés différents
(`Login-BGKcSDab.js` devient `Login-<autre-hash>.js` au build suivant).

Problème classique de SPA avec code-splitting + déploiements fréquents :
un onglet déjà ouvert AVANT un déploiement garde en mémoire l'ancien
`index.html`/manifest référençant les anciens noms de fichiers. Si
l'utilisateur navigue ensuite vers une page qu'il n'avait pas encore
visitée (donc pas encore chargée dans son onglet), le `import()` dynamique
va chercher l'ancien fichier hashé — qui n'existe plus sur le serveur
après le nouveau déploiement — d'où l'échec.

Avec le nombre de déploiements déclenchés aujourd'hui (plusieurs dans la
même session), n'importe quel utilisateur avec l'app déjà ouverte tombe
régulièrement dans ce cas — ce n'est pas aléatoire, c'est déterministe
selon le timing entre ouverture de l'onglet et déploiements.

`ErrorBoundary.jsx` (`src/components/ErrorBoundary.jsx`) capture cette
erreur comme n'importe quelle autre erreur de rendu et affiche l'écran
rouge nécessitant un clic manuel sur "Recharger la page" — alors qu'un
simple rechargement automatique suffit à résoudre le problème (le nouvel
`index.html` référence les bons fichiers).

Le service worker (`public/sw.js`) n'est PAS en cause — c'est un
pass-through qui ne met rien en cache, vérifié.

## Ta tâche

1. Dans `src/main.jsx`, ajoute l'écouteur officiel Vite pour ce cas précis
   (documenté par Vite lui-même) :
   ```js
   window.addEventListener('vite:preloadError', (event) => {
     window.location.reload();
   });
   ```
   Place-le avant ou après le rendu React, peu importe — il écoute un
   événement global du navigateur.

2. En complément (certains navigateurs/erreurs peuvent ne pas déclencher
   `vite:preloadError` selon la formulation exacte du message), ajoute une
   détection dans `ErrorBoundary.jsx` : si `error.message` correspond à ce
   type d'échec (`/Failed to fetch dynamically imported module/i` ou
   équivalent), recharge automatiquement la page **une seule fois** au
   lieu d'afficher l'écran rouge — avec un garde-fou anti-boucle infinie
   (ex: un flag dans `sessionStorage`, du genre
   `chunk-reload-attempted`, qu'on pose avant le reload et qu'on vérifie
   avant de re-tenter ; si le flag est déjà là, afficher l'écran rouge
   normal au lieu de reboucler indéfiniment — cas où l'erreur ne serait
   PAS due à un déploiement mais à un vrai problème réseau/CDN persistant).
   Efface ce flag au montage réussi de l'app (ou après un délai) pour ne
   pas bloquer les rechargements légitimes futurs.

## Vérification

- Simule le scénario : ouvre l'app, laisse tourner un nouveau déploiement
  en arrière-plan (ou modifie manuellement un import pour forcer un 404 de
  chunk), puis navigue vers une page pas encore chargée — confirme que la
  page se recharge automatiquement sans que l'utilisateur voie l'écran
  rouge.
- Confirme qu'un vrai bug de rendu (erreur JS classique, pas liée à un
  chunk) affiche toujours l'écran rouge normal avec le bouton manuel — ne
  pas masquer les vraies erreurs derrière un reload automatique.

## Interdictions

- Ne mets pas en place de retry en boucle infinie si le rechargement ne
  résout pas le problème (garde-fou obligatoire, voir ci-dessus).
- Ne touche pas à `public/sw.js` — confirmé non impliqué, pas de mise en
  cache par le service worker.
