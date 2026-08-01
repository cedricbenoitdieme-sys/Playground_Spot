# Prompt — Brancher le frontend sur SenePay (remplace UnitechPay)

## Contexte

UnitechPay est intégralement retiré côté backend/base de données et remplacé
par SenePay (agrégateur mobile money). C'est fait pour les 3 flux
(abonnement gérant, boost visibilité, réservation joueur) :

- **Supprimé** : `supabase/functions/create-payment`,
  `supabase/functions/webhook-unitech`, `backend/routes/payments.js`,
  `backend/routes/webhooks.js`, et le bloc de routes
  `/api/payment/unitech/initiate|webhook|mock-redirect` qui existait
  directement dans `backend/server.js`/`api/index.js`.
- **Ajouté** : trois Edge Functions Deno —
  `supabase/functions/senepay-initiate` (remplace `create-payment` ET
  `POST /api/payments/initiate`), `supabase/functions/senepay-webhook`
  (payin), `supabase/functions/senepay-payout-webhook` (payout gérant,
  fonctionnalité qui n'existait pas avant).
- **Ajouté en base** : `senepay_payments` (suivi de transaction),
  `gerant_payout_info` (numéro Wave/Orange Money du gérant, requis avant
  qu'un terrain soit approuvé — `admin_review_terrain` bloque sinon),
  `gerant_payouts` (historique des virements automatiques après chaque
  réservation payée).

Ces migrations sont dans `supabase/migrations/20260801170000_*.sql` à
`20260801190000_*.sql` — à lire si tu as besoin du détail exact des RPC
(paramètres, valeurs de retour).

**Important — rien n'est câblé côté React pour l'instant.** Tant que ce
prompt n'est pas appliqué, le paiement de réservation est cassé (l'ancien
endpoint Express `/api/payments/initiate` que `BookingFlow.jsx` appelle
n'existe plus) et l'abonnement/boost gérant (`SubscriptionCheckoutModal.jsx`,
`BoostCheckoutModal.jsx`) ne peuvent plus s'initier (ils appellent l'Edge
Function `create-payment`, supprimée). C'est la priorité #1 de ce prompt.

## Contrat de `senepay-initiate` (nouveau point d'entrée unique)

`supabase.functions.invoke('senepay-initiate', { body: {...} })`, requiert
une session authentifiée (`Authorization` géré automatiquement par le client
Supabase). Corps attendu selon `type_flux` :

```js
// Abonnement (gérant)
{ type_flux: 'abonnement', plan, billing_period, payment_method, customer_number }
// billing_period: 'monthly' | 'annual' — payment_method: 'wave' | 'orange_money'

// Boost visibilité (gérant)
{ type_flux: 'boost', terrain_id, budget_fcfa, duree_jours, payment_method, customer_number }

// Réservation (joueur)
{ type_flux: 'reservation', reservation_id, payment_method, customer_number }
```

Réponse (succès) :

```js
{
  success: true,
  order_id: 'SUB-...' | 'BOOST-...' | 'RES-...',
  amount: 4900,
  status: 'pending' | ...,           // statut brut SenePay, informatif
  next_action: 'REDIRECT_TO_PROVIDER_LINK' | 'USSD_PUSH' | 'OTP_REQUIRED' | 'NONE',
  redirect_url: '...' | null,        // non-null seulement si next_action === 'REDIRECT_TO_PROVIDER_LINK' (wave)
  token: '...' | null,               // non-null pour USSD_PUSH ou OTP_REQUIRED
  otp_required: true | false
}
```

Ne rien afficher comme "payé" tant que le statut final n'est pas confirmé —
`order_id` est ce qu'il faut poller ensuite (voir plus bas).

### Les 4 branches `next_action` à gérer côté UI

1. **`REDIRECT_TO_PROVIDER_LINK`** (Wave) — ouvrir `redirect_url` (nouvel
   onglet, comme le faisait `payment_url` avant), puis démarrer le polling
   sur `order_id`. Comportement UI quasi identique à l'existant.
2. **`USSD_PUSH`** (mtn/moov/free/airtel/tmoney — hors périmètre Sénégal
   actuel mais le champ existe déjà) — afficher "Validez sur votre
   téléphone" et démarrer le polling sur `order_id`, pas de lien à ouvrir.
3. **`OTP_REQUIRED`** (Orange Money en SN) — **nouveau, n'existait pas avec
   UnitechPay**. Afficher un champ de saisie du code OTP reçu par SMS, puis
   rappeler `senepay-initiate` avec :
   ```js
   { type_flux, order_id, otp_code }
   ```
   La réponse a la même forme (`status`/`next_action`/...). Une fois
   `next_action` redevenu `REDIRECT_TO_PROVIDER_LINK`/`USSD_PUSH`/`NONE`,
   continuer le flow normalement (polling ou affichage direct du résultat).
4. **`NONE`** — transaction déjà dans un état terminal, afficher directement
   `status` sans lancer de polling.

### Second appel OTP — composant partagé suggéré

Comme Orange Money nécessite l'OTP pour les 3 flux, factoriser un petit
composant/hook `useOtpStep` (ou équivalent) plutôt que dupliquer la logique
dans `BoostCheckoutModal.jsx`, `SubscriptionCheckoutModal.jsx` et
`BookingFlow.jsx`.

## Tâche 1 — `src/services/subscriptions.js`

Remplacer les deux appels `supabase.functions.invoke('create-payment', ...)`
par `senepay-initiate` :

```js
export const initiateSubscriptionPayment = async ({ plan_id, cycle, phone_number, mode = 'wave' }) => {
  // ... inchangé jusqu'à l'appel invoke ...
  const { data, error } = await supabase.functions.invoke('senepay-initiate', {
    body: {
      type_flux: 'abonnement',
      plan: plan_id,
      billing_period: cycle === 'annuel' ? 'annual' : 'monthly',
      payment_method: mode,
      customer_number: phone_number,
    },
  });
  // ... reste inchangé ...
};

export const initiateBoostPayment = async ({ terrain_id, budget_fcfa, duree_jours, phone_number, mode = 'wave' }) => {
  // ... inchangé jusqu'à l'appel invoke ...
  const { data, error } = await supabase.functions.invoke('senepay-initiate', {
    body: {
      type_flux: 'boost',
      terrain_id, budget_fcfa, duree_jours,
      payment_method: mode,
      customer_number: phone_number,
    },
  });
  // ... reste inchangé ...
};
```

`fetchSubscriptionStatus`/`fetchBoostStatus` **ne changent pas** — ils lisent
`subscriptions`/`visibility_boosts` directement, tables inchangées par cette
migration.

Ajouter une nouvelle fonction pour la réservation (n'existait pas avant, le
paiement de réservation passait par Express, pas par ce fichier) :

```js
export const initiateReservationPayment = async ({ reservation_id, phone_number, mode = 'wave' }) => {
  try {
    const { data, error } = await supabase.functions.invoke('senepay-initiate', {
      body: { type_flux: 'reservation', reservation_id, payment_method: mode, customer_number: phone_number },
    });
    if (error) throw new Error(error.message || "Impossible d'initialiser le paiement.");
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    return handleServiceError(err, "Échec de l'initialisation du paiement");
  }
};

export const submitSenepayOtp = async ({ type_flux, order_id, otp_code }) => {
  const { data, error } = await supabase.functions.invoke('senepay-initiate', {
    body: { type_flux, order_id, otp_code },
  });
  if (error) throw new Error(error.message || 'Code OTP invalide.');
  if (data?.error) throw new Error(data.error);
  return data;
};
```

## Tâche 2 — `src/components/BookingFlow.jsx`

Remplacer le bloc `fetch(.../api/payments/initiate)` (mobile-payment branch,
autour de la ligne 268-290) par `initiateReservationPayment` (Tâche 1) et
adapter la gestion de réponse aux 4 `next_action` (voir section dédiée
ci-dessus) au lieu du seul cas `payment_url`/`transaction_ref` actuel. Le
hook `useReservationPaymentPolling` (`src/hooks/useReservationPaymentPolling.js`)
**ne change pas** — il continue de poller `get_reservation_payment_status`
par référence, qui reste `order_id` (le format `RES-...` remplace `PS-...`,
la mécanique est identique).

## Tâche 3 — `src/components/BoostCheckoutModal.jsx` /
`src/components/SubscriptionCheckoutModal.jsx`

Adapter la lecture de la réponse : `res.payment_url` → `res.redirect_url`
(uniquement si `res.next_action === 'REDIRECT_TO_PROVIDER_LINK'`), ajouter la
branche OTP. Le polling (`useBoostPaymentPolling`/`usePaymentPolling`) ne
change pas.

## Tâche 4 — Nouvelle page/section "Informations de versement" (gérant)

Nouveau formulaire (téléphone Wave/Orange Money + opérateur), quelque part
dans les paramètres gérant (`GerantParametres` ou équivalent), appelant :

```js
const { data, error } = await supabase.rpc('upsert_gerant_payout_info', {
  p_phone: '771234567', p_operator: 'wave', p_country: 'SN'
});
```

C'est **obligatoire avant qu'un terrain soit approuvable** —
`admin_review_terrain` rejette maintenant l'approbation si le gérant n'a pas
cette ligne. Si un gérant soumet un terrain sans l'avoir renseignée,
surfacer clairement le message d'erreur retourné par l'admin (ou, mieux,
bloquer/avertir dès la soumission du terrain côté gérant plutôt que de
laisser l'admin découvrir l'échec).

## Tâche 5 — Nettoyage (optionnel mais recommandé)

`src/hooks/usePayment.js` est déjà mort aujourd'hui (rien ne l'importe,
confirmé) — il appelait aussi l'ancien `/api/payments/initiate`. À supprimer
ou à réécrire au-dessus d'`initiateReservationPayment` si un futur usage est
prévu, plutôt que de le laisser comme code mort trompeur.

## Points d'attention

- Le numéro de téléphone reste validé Sénégal uniquement (`7XXXXXXXX`) — le
  périmètre multi-pays SenePay n'est pas construit dans cette passe.
- `payment_method` conserve les valeurs `'wave'`/`'orange_money'` côté
  frontend — le mapping vers le vocabulaire opérateur SenePay (`wave`/
  `orange`) se fait côté Edge Function, rien à changer niveau UI/formulaires.
- Ne jamais afficher un état "payé" en te basant sur la réponse immédiate de
  `senepay-initiate` — seul le polling (webhook déjà reçu et propagé en base)
  fait foi, exactement comme avec UnitechPay avant.
