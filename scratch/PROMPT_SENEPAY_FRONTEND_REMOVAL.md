# Prompt — Retirer SenePay du frontend (React)

## Contexte

SenePay est abandonné comme prestataire de paiement. Le backend est déjà
nettoyé dans cette même session :

- **Supprimé de Supabase** : les 3 Edge Functions `senepay-initiate`,
  `senepay-webhook`, `senepay-payout-webhook` (undeploy + suppression des
  dossiers locaux `supabase/functions/senepay-*`).
- **Supprimé en base** (migration `20260802150000_remove_senepay_integration.sql`) :
  tables `senepay_payments`, `gerant_payout_info`, `gerant_payouts`,
  fonctions `create_senepay_payment_record`, `update_senepay_payment_status`,
  `create_pending_reservation_payment`, `process_reservation_payout`,
  `finalize_reservation_payout`, `upsert_gerant_payout_info`.
  `admin_review_terrain` a été restaurée à sa version pré-SenePay (plus de
  garde-fou sur les infos de versement).
- Secrets `SENEPAY_API_KEY`/`SENEPAY_API_SECRET`/`SENEPAY_API_BASE_URL`/
  `SENEPAY_WEBHOOK_SIGNING_SECRET` supprimés du projet Supabase.
- `supabase/config.toml` nettoyé des entrées `[functions.senepay-*]`.

**Décision produit : le paiement en ligne est désactivé, pas remplacé.**
Aucun autre prestataire ne prend le relais pour l'instant. Seul le paiement
"Sur place" doit rester utilisable pour les réservations. Les abonnements
gérant payants et les campagnes de boost visibilité deviennent
indisponibles jusqu'à l'intégration d'un nouveau prestataire (le plan Free
reste inchangé, il n'a jamais dépendu du paiement).

## Fichiers à supprimer entièrement

- `src/services/senepay.js`
- `src/components/PaymentFlow.jsx`

Rien d'autre n'importe ces deux fichiers en dehors de ceux listés ci-dessous
(vérifié via grep sur `senepay`/`SenePay`/`PaymentFlow` dans `src/`).

## `src/components/BookingFlow.jsx`

Utilise `PaymentFlow` (import ligne 24, rendu ~ligne 607-620) pour le
paiement en ligne (Wave/Orange Money) d'une réservation. Le mode "Sur
place" passe déjà par un chemin séparé (`createPaiement` avec
`mode: 'sur_place'`, lignes ~251-256) et n'a pas besoin de `PaymentFlow` —
**ce chemin doit rester intact**.

À faire :
- Retirer l'import et le rendu de `<PaymentFlow ... type_flux="reservation" .../>`.
- Dans le sélecteur de mode de paiement (celui qui alimente
  `paymentMethod`/`paymentModeMap` ligne ~245-249), retirer ou désactiver
  les options "Wave" et "Orange Money" (griser + message "Paiement en ligne
  indisponible pour le moment"), ne garder que "Sur place" comme option
  active.
- Vérifier qu'aucune variable d'état devenue inutile (`isPaymentModalOpen`,
  `pendingReservationId`, etc.) ne reste orpheline après le retrait — les
  garder seulement si encore utilisées par le flux "Sur place".

## `src/components/BoostCheckoutModal.jsx` et `src/components/SubscriptionCheckoutModal.jsx`

Ce sont de simples wrappers autour de `PaymentFlow` (rien d'autre dedans).
Une fois `PaymentFlow` supprimé, ces deux composants n'ont plus de raison
d'exister sous cette forme. Deux options, à ton choix selon ce qui est le
plus simple à intégrer proprement dans les pages appelantes :

1. **Supprimer les deux fichiers** et, dans leurs appelants (chercher
   `BoostCheckoutModal`/`SubscriptionCheckoutModal` dans `src/pages/` —
   probablement `Abonnement.jsx` et `GerantTerrain.jsx`), remplacer le
   déclenchement du modal par un message clair : "Paiement en ligne
   temporairement indisponible, contactez l'équipe PlaygroundSpot" (ou
   équivalent), et désactiver/masquer les boutons "Souscrire"/"Booster"
   pour les offres payantes. Le plan Free doit rester sélectionnable
   normalement (passe par `activate_free_plan`, jamais touché par SenePay).
2. **Garder les fichiers** mais remplacer le contenu de `PaymentFlow` par un
   simple modal d'indisponibilité (mêmes props `isOpen`/`onClose`, aucun
   appel réseau).

Préviens l'utilisateur du choix retenu.

## `src/components/GerantVersementsSection.jsx`

Affiche les informations de versement (Wave/Orange Money) et l'historique
des payouts gérant — entièrement adossé aux fonctions/table SenePay
supprimées (`upsertGerantPayoutInfo`, `fetchGerantPayoutInfo`,
`fetchGerantPayouts` dans `senepay.js`, déjà supprimé). Ce composant est
cassé dès que `senepay.js` disparaît.

À faire : supprimer ce composant et son import/rendu dans
`src/pages/GerantDashboard.jsx` (ligne 26 pour l'import, lignes ~471-472
pour le rendu, commentaire "Section Versements & Revenus Net SenePay" à
retirer aussi).

## Vérification finale

Après les changements, grep sur `senepay|SenePay|PaymentFlow` dans `src/`
ne doit plus rien retourner. Lancer le build (`npm run build` ou
équivalent) pour confirmer qu'aucun import cassé ne subsiste.
