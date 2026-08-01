# Prompt — Déployer l'intégration SenePay sur une branche Supabase de test

## Contexte

L'intégration SenePay (remplace UnitechPay comme prestataire de paiement)
est entièrement écrite en local dans ce repo mais **rien n'a encore été
appliqué à distance** — ni migrations, ni Edge Functions, ni variables
d'environnement. Projet Supabase : **PlaygroundSpot**, ref `ahqtcgxrewrfbowblygu`.

Objectif de cette tâche : déployer et tester tout ça sur un environnement
**isolé de la production** (branche Supabase), pas directement en prod.

## Fichiers concernés (déjà écrits, à appliquer tels quels — ne rien réécrire)

Migrations SQL (à appliquer **dans cet ordre exact**, elles dépendent les
unes des autres) :
- `supabase/migrations/20260801170000_senepay_payments_tracking.sql`
- `supabase/migrations/20260801180000_gerant_payout_info_and_gate.sql`
- `supabase/migrations/20260801190000_reservation_payout_automation.sql`

Edge Functions (Deno) à déployer :
- `supabase/functions/senepay-initiate`
- `supabase/functions/senepay-webhook`
- `supabase/functions/senepay-payout-webhook`

Config `verify_jwt` déjà à jour dans `supabase/config.toml` (senepay-webhook
et senepay-payout-webhook doivent avoir `verify_jwt = false`, senepay-initiate
`verify_jwt = true` — ne pas modifier, juste vérifier que le déploiement les
respecte).

## Tâche 1 — Créer une branche de test

Créer une branche Supabase isolée sur le projet `ahqtcgxrewrfbowblygu`
(nom suggéré : `test-senepay`). **Ne rien appliquer directement sur la
branche de production.** Si la fonctionnalité "branches" n'est pas
disponible sur ce projet (selon le plan Supabase), le signaler avant de
continuer plutôt que d'appliquer en prod par défaut.

## Tâche 2 — Appliquer les 3 migrations sur la branche de test

Dans l'ordre indiqué ci-dessus. Vérifier après coup que les objets suivants
existent : tables `senepay_payments`, `gerant_payout_info`, `gerant_payouts` ;
fonctions `create_senepay_payment_record`, `update_senepay_payment_status`,
`upsert_gerant_payout_info`, `create_pending_reservation_payment`,
`process_reservation_payout`, `finalize_reservation_payout` ; et que
`admin_review_terrain` a bien été remplacée (elle doit maintenant bloquer une
approbation si `gerant_payout_info` est absente pour le gérant).

## Tâche 3 — Déployer les 3 Edge Functions sur la branche de test

`senepay-initiate`, `senepay-webhook`, `senepay-payout-webhook`.

## Tâche 4 — Configurer les secrets sur la branche de test

Ces valeurs sont détenues par l'utilisateur (Q-Consulting) — les lui
demander directement, ne jamais les inventer ni les laisser vides en
silence :

- `SENEPAY_API_KEY`
- `SENEPAY_API_SECRET`
- `SENEPAY_WEBHOOK_SIGNING_SECRET` (préfixe `whsec_` — **différent** de
  `SENEPAY_API_SECRET**, ne pas les confondre)
- `SENEPAY_API_BASE_URL` (URL de base de l'API SenePay, sans slash final)

## Tâche 5 — Enregistrer les URLs de webhook côté SenePay (dashboard marchand)

Deux endpoints **distincts** à renseigner dans le dashboard SenePay, en
utilisant l'URL de la branche de test (pas celle de prod) :

- Webhook paiement entrant (payin) → `{URL_BRANCHE}/functions/v1/senepay-webhook`
- Webhook payout → `{URL_BRANCHE}/functions/v1/senepay-payout-webhook`

## Tâche 6 — Tests de bout en bout à effectuer

Pour chacun des 3 flux (abonnement gérant, boost visibilité, réservation
joueur), en appelant `senepay-initiate` avec `type_flux` correspondant :

1. Vérifier qu'une ligne apparaît dans `senepay_payments` avec le bon
   `type_flux` et `status='pending'`.
2. Vérifier la branche `next_action` réellement renvoyée par SenePay
   (`REDIRECT_TO_PROVIDER_LINK` / `USSD_PUSH` / `OTP_REQUIRED` / `NONE`) —
   **remonter à l'utilisateur si le nom exact de l'opérateur Orange Money
   attendu par SenePay diffère de `'orange'`** (valeur actuellement supposée
   dans `senepay-initiate/index.ts`, à confirmer/corriger si besoin).
3. Simuler/déclencher le webhook payin correspondant, vérifier :
   - `senepay_payments.status` passe à `completed`/`failed`
   - abonnement → `subscriptions.status` passe à `active`
   - boost → `visibility_boosts.statut` passe à `actif`
   - réservation → `paiements.statut` passe à `valide` ET
     `reservations.statut` passe à `confirmee`
4. Pour le flux réservation uniquement, vérifier qu'une ligne apparaît dans
   `gerant_payouts` (statut `pending`/`submitted` après l'appel automatique à
   l'API payout SenePay déclenché par `senepay-webhook`).
5. **Rejouer exactement le même payload webhook une seconde fois** (test
   d'idempotence) — rien ne doit changer/se dupliquer (pas de deuxième
   payout, pas de double activation).
6. Vérifier que `admin_review_terrain('<terrain>', 'approved')` échoue tant
   que le gérant n'a pas de ligne `gerant_payout_info`, et réussit une fois
   `upsert_gerant_payout_info` appelée.

## Ne pas faire dans cette tâche

- Ne pas fusionner la branche de test vers la production sans validation
  explicite de l'utilisateur.
- Ne pas toucher au frontend (`src/`) — c'est une tâche backend/déploiement
  uniquement.
- Ne pas modifier le contenu des migrations/Edge Functions déjà écrites sauf
  si un test révèle une erreur réelle (dans ce cas, corriger et signaler
  clairement quoi et pourquoi).
