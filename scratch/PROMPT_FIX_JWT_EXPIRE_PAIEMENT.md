# PROMPT — Paiement : JWT périmé + message d'erreur jamais affiché

## Contexte

Un paiement (abonnement/boost/réservation) a échoué avec l'erreur générique
"Edge Function returned a non-2xx status code". Après une longue session de
diagnostic backend, deux causes distinctes ont été trouvées — aucune des
deux n'a de rapport avec Wave/Orange Money ni avec UnitechPay :

1. Le token de session envoyé à `create-payment` était périmé, rejeté par
   le gateway Supabase avant même d'atteindre la fonction, avec l'erreur
   `{"code":"UNAUTHORIZED_ASYMMETRIC_JWT","message":"Invalid JWT"}`. Une
   déconnexion/reconnexion a immédiatement résolu le problème.
2. **Plus grave** : `usePaymentFlow.js` n'affiche JAMAIS le vrai message
   d'erreur renvoyé par `create-payment`, quelle que soit la cause réelle
   (JWT expiré, rate limit 429, plan gratuit non éligible, boost déjà
   actif, refus UnitechPay...). L'utilisateur voit systématiquement le
   même texte générique, ce qui a rendu tout le diagnostic du jour
   beaucoup plus long qu'il n'aurait dû l'être — à chaque échec, il a fallu
   aller lire la réponse brute dans l'onglet Network du navigateur pour
   connaître la vraie raison.

## Cause probable n°1 — JWT périmé

`src/hooks/usePaymentFlow.js`, fonction `start()`, appelle :

```js
const { data: sessionData } = await supabase.auth.getSession();
if (!sessionData?.session?.access_token) {
  throw new Error('Vous devez être connecté pour initier une transaction.');
}
```

`getSession()` renvoie le token **en cache** (local storage), sans vérifier
qu'il est encore valide. `src/lib/supabase.js` configure bien
`autoRefreshToken: true`, mais ce rafraîchissement automatique tourne sur un
timer qui peut rater son échéance si l'onglet reste longtemps inactif/en
arrière-plan (ce qui était le cas ici) — au réveil, le SDK peut retenter
d'utiliser un token déjà expiré le temps que le refresh se déclenche.

## Cause probable n°2 — le vrai message d'erreur n'est jamais lu

Toujours dans `start()` :

```js
const { data, error: invokeError } = await supabase.functions.invoke('create-payment', { body });

if (invokeError) {
  if (invokeError.status === 403 || invokeError.message?.includes('403')) {
    throw new Error('Ce module nécessite un abonnement Starter ou supérieur.');
  }
  throw new Error(invokeError.message || 'Impossible d\'initialiser le paiement.');
}

if (data?.error) {
  // ... ce bloc ne sert à rien dans notre cas : voir explication ci-dessous
}
```

`create-payment/index.ts` répond TOUJOURS à une erreur avec un statut HTTP
non-2xx et un corps `{ error: "message clair en français" }` (ex: "Trop de
tentatives, réessayez dans quelques minutes.", "Un boost est déjà en
attente ou actif pour ce terrain.", "Le boost de visibilité est réservé aux
plans payants..."). Mais côté `supabase-js`, dès qu'une Edge Function
répond en non-2xx, l'appel `functions.invoke()` place l'erreur dans
`invokeError` (une `FunctionsHttpError`) et laisse `data` à `null` — le
bloc `if (data?.error)` plus bas n'est donc **jamais atteint** dans notre
architecture. Et `invokeError.message` vaut littéralement la chaîne fixe
`"Edge Function returned a non-2xx status code"` — ce n'est PAS le corps
JSON de notre réponse. Le vrai message existe mais est piégé dans
`invokeError.context`, qui est l'objet `Response` brut du fetch sous-jacent.

## Ta tâche

1. Dans `usePaymentFlow.js`, sur le bloc `if (invokeError)`, lis le corps
   réel de la réponse avant de construire le message d'erreur, par exemple :
   ```js
   if (invokeError) {
     let serverMessage = null;
     try {
       // invokeError.context est le Response brut (FunctionsHttpError)
       const body = await invokeError.context?.json();
       serverMessage = body?.error ?? null;
     } catch (_) { /* corps non-JSON ou déjà consommé, tant pis */ }

     if (invokeError.status === 403 || serverMessage?.includes('Starter')) {
       throw new Error('Ce module nécessite un abonnement Starter ou supérieur.');
     }
     throw new Error(serverMessage || invokeError.message || 'Impossible d\'initialiser le paiement.');
   }
   ```
   Vérifie la forme exacte de `invokeError` avec la version de
   `@supabase/supabase-js` utilisée dans ce projet (`FunctionsHttpError` a
   normalement une propriété `context` de type `Response` — teste en
   conditions réelles, ex. en redéclenchant volontairement un 429 ou un
   boost déjà actif, pour confirmer que `serverMessage` affiche bien le
   vrai texte).
2. Le bloc `if (data?.error)` existant peut rester tel quel (inoffensif,
   simplement mort dans notre cas actuel) — pas besoin de le supprimer sauf
   si tu préfères nettoyer.

3. Avant d'appeler `supabase.functions.invoke('create-payment', ...)`,
   force un rafraîchissement de session plutôt que de faire confiance au
   cache : soit `await supabase.auth.refreshSession()`, soit vérifier
   `session.expires_at` (en secondes epoch) contre `Date.now()` et ne
   rafraîchir que si périmé/proche de l'être (évite un aller-retour réseau
   systématique si le token est encore frais).

4. Gère explicitement le cas où l'invocation renvoie quand même un 401 avec
   un message lié au JWT (`invalid JWT`, `UNAUTHORIZED_ASYMMETRIC_JWT`,
   `JWT expired`) : au lieu du message générique actuel, affiche un message
   clair du type "Votre session a expiré, veuillez vous reconnecter" plutôt
   que de laisser remonter le message brut de `supabase-js`.

5. Ne retente PAS automatiquement le paiement après un refresh silencieux
   sans re-solliciter l'utilisateur si le rafraîchissement échoue aussi
   (session vraiment invalide → il faut relogin, pas de boucle infinie).

## Interdictions

- Ne touche pas à `create-payment/index.ts` (backend) — le problème est
  entièrement côté client, la fonction elle-même n'a jamais été atteinte
  lors de l'incident.
- Ne désactive pas `verify_jwt` sur `create-payment` pour contourner le
  problème — la vérification JWT au gateway est une protection de sécurité
  volontaire, pas un bug.

## Contexte annexe (non lié, à ignorer sauf si demandé séparément)

Le Network tab montrait aussi des appels répétés en échec vers
`GET https://.../api/settings` → `Cannot GET /api/settings` (404, réponse
Express brute). C'est un problème distinct, probablement un vieux endpoint
d'un serveur Express qui n'existe plus — à ne pas confondre avec le sujet
JWT ci-dessus.

## Livrable attendu

- Les deux correctifs dans `usePaymentFlow.js` (lecture du vrai message
  d'erreur + rafraîchissement JWT préalable).
- Confirmation que le paiement (Wave et Orange Money, abonnement et boost)
  fonctionne toujours normalement après le changement.
- Confirmation qu'un échec volontaire (ex: redéclencher le rate limit en
  soumettant 6 fois de suite) affiche maintenant le vrai message serveur
  ("Trop de tentatives, réessayez dans quelques minutes.") au lieu du texte
  générique.
