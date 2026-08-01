# Audit — webhooks UnitechPay (réservation joueur)

Date : 2026-07-29

## Partie 1 — Nettoyage

`supabase/functions/payment-webhook/` **supprimé**. C'était une edge function orpheline
(jamais déployée — pas de `config.toml` référençant des functions, `git status` la montrait
non modifiée depuis son commit initial), secret par défaut `"test-secret"`, vérification de
signature entièrement commentée. Seule référence trouvée dans tout le repo : un changelog
historique (`gemini_part5.md`, texte descriptif, pas du code exécuté) — confirmé sans impact,
suppression sûre.

## Partie 2 — Les 4 handlers webhook (pas 3)

En plus des 3 endpoints Express listés dans la demande, il existe une **4ᵉ implémentation**,
`supabase/functions/webhook-unitech/index.ts` — une edge function Deno déjà écrite en tant que
handler unique et consolidé pour les 3 types de paiement (abonnement gérant `SUB-`, boost
`BOOST-`, réservation joueur = tout le reste). Son en-tête de fichier documente explicitement
l'intention : remplacer les 3 handlers Express en une seule URL, à l'image de Sama Boutik
(même compte UnitechPay, déjà en prod).

**Point clé** : ce travail de consolidation a déjà commencé au niveau du code, mais est
**entièrement non commité** (`git status` : les 5 fichiers webhook + `webhook-unitech/index.ts`
sont tous en `M`, aucun commit derrière). La version actuellement déployée sur Vercel (dernier
commit `d8e67ba`/`68e0a46`) ne contient probablement pas encore ces changements.

### Qui construit quelle `webhook_url` aujourd'hui (working tree)

| Point d'entrée qui initie un paiement | `webhook_url` envoyée à UnitechPay |
|---|---|
| `supabase/functions/create-payment/index.ts` (abonnement/boost gérant) | `${SUPABASE_URL}/functions/v1/webhook-unitech` |
| `backend/routes/payments.js` `/initiate` (réservation joueur) | `${SUPABASE_URL}/functions/v1/webhook-unitech` |
| `api/index.js` `/api/payment/unitech/initiate` (réservation, legacy) | `${SUPABASE_URL}/functions/v1/webhook-unitech` |
| `backend/server.js` `/api/payment/unitech/initiate` (réservation, dev-only) | `${SUPABASE_URL}/functions/v1/webhook-unitech` |

**Les 4 chemins d'initiation pointent déjà vers `webhook-unitech`.** Aucun ne construit plus
d'URL vers `/api/payment/unitech/webhook` ni `/api/webhooks/unitech`. C'est cohérent avec
l'intention documentée dans le fichier de la edge function.

⚠️ Nuance importante, documentée dans le commentaire même de `webhook-unitech/index.ts` : un
compte marchand UnitechPay n'accepte qu'**une seule URL de webhook, enregistrée manuellement
dans leur dashboard** — le champ `webhook_url` envoyé par requête n'est pas documenté comme
paramètre honoré. Donc le fait que le code envoie cette URL ne garantit pas qu'UnitechPay
l'utilise réellement. **Impossible à vérifier depuis le code** — je n'ai pas accès au dashboard
UnitechPay. `PROD_READINESS_CHECKLIST.md` §5 note déjà ce point comme non résolu.

### Lequel est "le vrai" endpoint en prod aujourd'hui

D'après `PROD_READINESS_CHECKLIST.md` §5 (audit antérieur, 2026-07-22/27), déjà établi :
- `vercel.json` route tout `/api/(.*)` vers `api/index.js` → **`api/index.js` est le seul
  serveur Express réellement déployé en prod (Vercel)**.
- `backend/server.js` est un doublon quasi-identique utilisé uniquement en dev local
  (`npm run dev`/nodemon) — jamais déployé.
- `backend/routes/webhooks.js` (`/api/webhooks/unitech`) est monté à la fois dans `api/index.js`
  et `backend/server.js`, mais **rien ne lui envoie jamais de trafic UnitechPay** — aucun flux
  d'initiation ne construit une `webhook_url` pointant vers `/api/webhooks/unitech`.
- La edge function `webhook-unitech` (Deno), en revanche, n'est démontrée nulle part comme
  étant *déployée* (`supabase functions deploy` n'apparaît dans aucun script/CI trouvé) ni
  comme étant la callback URL réellement enregistrée côté dashboard UnitechPay.

**Conclusion factuelle, pas supposée** : je ne peux pas confirmer avec certitude lequel des 4
reçoit réellement le trafic UnitechPay en prod aujourd'hui — ça dépend de la config du
dashboard marchand UnitechPay, hors de portée du code. Ce que le code montre sans ambiguïté :
`api/index.js` est le seul serveur Express déployé, et son écriture récente de `webhook_url`
pointe vers `webhook-unitech`, pas vers sa propre route `/api/payment/unitech/webhook` — donc
même *son propre code* ne s'attend plus à recevoir ces webhooks lui-même.

### Différences de comportement entre les 4

| | `api/index.js` | `backend/server.js` | `backend/routes/webhooks.js` | `webhook-unitech` (Deno) |
|---|---|---|---|---|
| Déployé en prod ? | Oui (Vercel) | Non (dev local) | Monté dans les deux, mais jamais ciblé par `webhook_url` | Statut de déploiement inconnu |
| Lecture signature | header `x-unitechpay-signature` (fallback `body.signature`) | idem | header `x-unitechpay-signature` uniquement | header `x-unitechpay-signature` uniquement |
| HMAC calculé sur | `req.rawBody \|\| JSON.stringify(req.body)` | idem | corps brut (`express.raw`) | corps brut (`req.text()`) |
| Comparaison signature | `computedSignature !== signature` (**pas** timing-safe) | idem | `crypto.timingSafeEqual` (timing-safe) | comparaison maison en temps constant (timing-safe) |
| Secret absent → | fail-closed (401/500) | fail-closed | fail-closed | fail-closed |
| Écriture DB | RPC `handle_payment_webhook` (toujours) | RPC `handle_payment_webhook`, **sauf** si `reference` commence par `PS-` → écrit `paiements`/`reservations` **directement**, en dur (pas de `confirmed_at`, pas de `webhook_payload`, pas de ligne `webhook_logs`) | Écrit `paiements`/`reservations` **directement**, toujours (même logique que la branche `PS-` de `server.js`) | RPC `handle_payment_webhook` (réservation) ou RPC `activate_subscription`/`activate_boost` |
| Bypass démo `mock-*` | Oui, avant toute vérification de signature | Oui, idem | Non | Non |

Les 3 handlers Express **ne sont donc pas identiques** malgré l'apparence — `server.js` a une
branche `PS-` (le préfixe réel généré par `payments.js` pour toute réservation) qui **écrit
directement en base au lieu d'appeler la RPC**, contournant l'audit `webhook_logs` et les
colonnes `confirmed_at`/`webhook_payload` ajoutées par la migration
`20260726100000_reservation_payment_status_tracking.sql`. `routes/webhooks.js` fait la même
chose, systématiquement. Seuls `api/index.js` et la edge function `webhook-unitech` passent
toujours par la RPC `handle_payment_webhook`.

### Risque concret d'incohérence

Oui, un risque réel existe **si plus d'un endpoint reçoit un jour le même webhook** (dashboard
UnitechPay mal configuré, ou changé sans mise à jour du code) :

- **Pas de double confirmation/écrasement** : tous les chemins d'écriture DB (RPC comme accès
  direct) protègent la transition par `WHERE statut = 'en_attente'` — au plus un des deux gagne
  la course, l'autre voit `rowCount = 0` et abandonne silencieusement. Donc pas de corruption
  de statut par une double transition.
- **Mais incohérence de richesse des données selon qui gagne la course** : si `server.js`
  (branche `PS-`) ou `routes/webhooks.js` gagnent la course au lieu de `api/index.js`/
  `webhook-unitech`, le paiement confirmé n'aura **ni `confirmed_at`, ni `webhook_payload`, ni
  ligne d'audit dans `webhook_logs`** — cassant la traçabilité que la migration
  `20260726100000` a justement ajoutée, et rendant `get_reservation_payment_status` (RPC de
  polling front) incomplet de façon aléatoire selon l'endpoint qui a gagné.
- Le risque est **latent, pas actif** aujourd'hui, tant qu'un seul endpoint reçoit réellement le
  trafic (à confirmer côté dashboard UnitechPay — hors de portée du code).

## Proposition de consolidation (à valider — rien touché en prod)

**Aucun changement appliqué aux endpoints actifs.** Proposition, dans l'ordre :

1. **Confirmer côté dashboard UnitechPay** quelle URL de callback est réellement enregistrée
   pour le compte marchand PlaygroundSpot. C'est le seul fait qui tranche définitivement lequel
   des 4 est "le vrai" en prod — le code seul ne peut pas le prouver.
2. **Adopter `supabase/functions/webhook-unitech/index.ts` comme unique endpoint canonique** —
   il remplit déjà les critères demandés : HMAC-SHA256 sur header `x-unitechpay-signature`,
   comparaison en temps constant, fail-closed si secret absent, écriture cohérente via les RPC
   existantes (`handle_payment_webhook`/`activate_subscription`/`activate_boost`). Rien à
   réécrire ici, juste à déployer (`supabase functions deploy webhook-unitech`) et enregistrer
   son URL comme callback unique dans le dashboard UnitechPay.
3. **Une fois (2) confirmé actif en prod**, supprimer dans cet ordre (chacun sur validation
   séparée, pas en un seul coup) :
   - `app.post('/api/payment/unitech/webhook', ...)` dans `backend/server.js` (dev-only, sans
     utilité une fois l'edge function seule enregistrée) — et sa branche `PS-` à risque
     d'incohérence en particulier.
   - `app.post('/api/payment/unitech/webhook', ...)` dans `api/index.js` (actif en prod
     aujourd'hui — **ne pas couper avant que (1) et (2) soient confirmés**, sous peine de
     couper la confirmation de paiement en prod).
   - `backend/routes/webhooks.js` en entier (jamais ciblé par aucune `webhook_url` générée dans
     le code — le plus sûr des 3 à retirer, mais à confirmer aussi via (1) au cas où il aurait
     été enregistré manuellement par le passé).
4. Corriger au passage l'item déjà noté dans `PROD_READINESS_CHECKLIST.md` §5 : la comparaison
   de signature dans `api/index.js`/`backend/server.js` (`computedSignature !== signature`)
   n'est pas en temps constant, contrairement à `routes/webhooks.js` et `webhook-unitech` — sans
   objet si ces deux fichiers sont supprimés par l'étape 3, sinon à corrigir en
   `crypto.timingSafeEqual` avant tout maintien en prod.

## Fichier modifié

- `supabase/functions/payment-webhook/` — supprimé (Partie 1).
