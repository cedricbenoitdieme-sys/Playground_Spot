# PROMPT — Correction du contrat entre usePaymentFlow.ts et create-payment (backend réel)

## Contexte

`usePaymentFlow.ts` / `SubscriptionCheckoutModal.jsx` / `BoostCheckoutModal.jsx` / `PaymentSuccess.jsx` viennent d'être construits, mais contre un contrat d'API différent de celui réellement implémenté dans `supabase/functions/create-payment/index.ts` (backend déjà déployé et testé en prod aujourd'hui — un paiement Wave réel pour un abonnement Pro a déjà généré une vraie référence UnitechPay). Résultat : au moins 4 points cassent l'intégration, listés ci-dessous avec le vrai contrat à respecter. Ne rien changer côté SQL ni côté `create-payment/index.ts` (déjà corrects et testés) — tout se corrige côté `src/`.

## 1. `get_payment_status` n'existe pas en base

`usePaymentFlow.ts` (`checkPaymentStatusImmediately`, `startPolling`) appelle `supabase.rpc('get_payment_status', { p_payment_id })`. Cette RPC n'a jamais été créée — aucune migration ne la définit. Chaque appel échoue silencieusement (erreur juste loggée), donc le statut ne passe jamais à `completed` : même un paiement réussi finit en `timeout` après 5 minutes.

**Le pattern déjà en prod et fonctionnel pour les réservations** (`src/pages/PaiementAttente.jsx`) n'utilise **aucune RPC** : lecture directe de la table + abonnement Realtime sur `postgres_changes` (event `UPDATE`, filtré sur `id=eq.<id>`), avec un bouton de vérification manuelle en filet de sécurité après 3 minutes. Reproduis ce pattern pour abonnement/boost au lieu d'inventer une RPC :

- Abonnement : `supabase.from('subscriptions').select('id, status, plan_id, cycle, date_debut, date_fin').eq('id', subscriptionId).single()` + Realtime sur `subscriptions` filtré `id=eq.<id>`. `fetchSubscriptionStatus` (`src/services/subscriptions.js`) fait déjà la lecture directe — il manque juste le canal Realtime, à ajouter sur le même modèle que `PaiementAttente.jsx`.
- Boost : `supabase.from('visibility_boosts').select('id, statut, date_debut, date_fin, duree_jours').eq('id', boostId).single()` + Realtime sur `visibility_boosts`. `fetchBoostStatus` fait déjà la lecture directe, il manque le canal Realtime.
- Statut "confirmé" pour un abonnement : `status === 'active'` (pas `'completed'` — l'enum réel est `pending | active | expired | suspended | revoked`, cf. `20260722150000_subscription_system.sql`).
- Statut "confirmé" pour un boost : `statut === 'actif'` (enum réel : `en_attente | actif | termine | annule`).
- Statut "échoué" : `status === 'revoked'` (abonnement) / `statut === 'annule'` (boost) — pas `'cancelled'`/`'failed'`.

## 2. Le corps envoyé à `create-payment` ne correspond pas à ce qu'il lit

Voir `supabase/functions/create-payment/index.ts` lignes 488-550 (dispatcher) et les handlers associés — c'est le code source de vérité, déployé aujourd'hui.

**Abonnement** — `usePaymentFlow.ts` doit envoyer :
```ts
{
  plan: params.plan,                 // ex: 'starter' | 'pro' | 'entreprise'
  billing_period: 'monthly' | 'annual',  // MANQUANT actuellement — obligatoire
  payment_method: 'wave' | 'orange_money',
  customer_number: string,
}
```
Pas de champ `kind`. Sans `billing_period`, le backend répond `400 { error: "Période de facturation invalide." }` à chaque fois — c'est très probablement déjà ce qui se passe si ce code a été testé contre le vrai backend.

**Boost** — `usePaymentFlow.ts` doit envoyer :
```ts
{
  payment_type: 'boost',   // OBLIGATOIRE, exact — pas `kind: 'campaign'`
  terrain_id: string,
  budget_fcfa: number,     // pas `budget`
  duree_jours: number,     // pas `duration_days`
  payment_method: 'wave' | 'orange_money',
  customer_number: string,
}
```
Sans `payment_type: 'boost'` exact, le dispatcher retombe sur le flux réservation par défaut et répond `400 { error: "creneau_id requis." }`.

**Réservation** (si `usePaymentFlow.ts` sert aussi ce cas ailleurs) : `{ creneau_id, methode, telephone }` — noms différents des deux autres cas, volontairement (trois contrats distincts, pas un contrat unifié `kind`).

## 3. L'identifiant retourné n'est jamais `payment_id`

```ts
const returnedPaymentId = response.payment_id || response.paymentId || response.id;
```
Ces trois clés n'existent dans aucune réponse réelle. Le backend renvoie :
- Réservation : `{ reservation_id, reference, montant, payment_url, qr_code, deep_links, expire_dans }`
- Abonnement : `{ subscription_id, reference, montant, payment_url, qr_code, deep_links }`
- Boost : `{ boost_id, reference, montant, payment_url, deep_links }`

Utilise `response.subscription_id` / `response.boost_id` / `response.reservation_id` selon le cas (le champ `kind` initial que tu passes en paramètre te dit lequel lire). C'est aussi cet ID qu'il faut passer à la lecture directe + Realtime du point 1 — pas de `payment_id` unique et générique.

## 4. URLs de callback incohérentes

Le backend fixe en dur (non paramétrable depuis le front) :
```ts
callback_success: `${SITE_URL}/paiement/succes`,
callback_cancel: `${SITE_URL}/paiement/annule`,
```
Aucun paramètre `?p=<id>` n'est jamais ajouté par UnitechPay à ces URLs. Deux options :

- **Option A (recommandée, 0 changement backend)** : fais pointer les pages de retour sur ces routes existantes (`/paiement/succes`, `/paiement/annule`) au lieu de `/payment/success`/`/payment/cancel`, et retrouve l'ID à afficher via `sessionStorage` (déjà le pattern utilisé par `ChoixPaiement.jsx` avec `pending_reservation_id`) plutôt que via un query param qui n'existera jamais.
- **Option B** : si tu préfères vraiment `/payment/success`/`/payment/cancel`, dis-le moi et je change les deux constantes `callback_success`/`callback_cancel` dans `create-payment/index.ts` pour matcher — c'est un changement backend trivial, mais il faut le redéployer côté Dashboard ensuite.

## Ce qui est déjà correct, à garder tel quel

- `paymentRedirect.ts` (stratégie desktop/mobile, deep links, QR) : consomme `payment_url`, `deep_links`, `qr_code` — ces noms correspondent exactement à la réponse réelle. Aucun changement nécessaire.
- Numéro de téléphone obligatoire en Orange Money : correct, correspond au comportement backend.
- **Numéro optionnel en Wave : à reconfirmer.** Le backend actuel (`normalizePhone` appelé pour toutes les méthodes dans les trois handlers) exige un téléphone valide y compris pour Wave — un envoi sans numéro recevra `400 { error: "Numéro de téléphone invalide (format sénégalais attendu)." }`. Si le produit veut vraiment rendre le numéro optionnel pour Wave, c'est un changement backend à faire séparément (pas juste front) — le signaler plutôt que de partir du principe que c'est déjà permissif côté serveur.

## Vérification demandée

Avant de considérer que c'est corrigé, retester les 4 cas suivants contre le **vrai** backend déployé (pas de mock) :
1. Abonnement Starter, Wave → doit obtenir un `payment_url` et une `reference` UnitechPay réelle.
2. Boost, Orange Money → idem.
3. Depuis la page d'attente (nouvelle version basée sur lecture directe + Realtime, pas RPC), confirmer qu'un changement de statut en base (test manuel via `UPDATE subscriptions SET status = 'active' WHERE id = '...'`) fait bien passer l'UI en "confirmé" sans rechargement.
4. Un paiement réel Wave (abonnement ou boost) mené jusqu'au bout, en vérifiant que la page de retour affiche bien la confirmation dans les secondes qui suivent le webhook.
