# Système d'abonnement gérants — mise en place

## Fichiers livrés

- `supabase/migrations/20260722150000_subscription_system.sql` — tables `plan_limits`, `subscriptions`, `visibility_boosts`, `rate_limits`, fonctions SQL, RLS, cron.
- `supabase/migrations/20260722160000_subscription_free_activation_and_fixed_expiry.sql` — `activate_subscription()` en durée fixe (30j/365j au lieu d'1 mois/1 an calendaire) + nouvelle RPC `activate_free_plan()` pour l'activation directe du plan Free sans paiement.
- `supabase/functions/create-payment/index.ts` — Edge Function d'initiation de paiement d'abonnement.
- `supabase/functions/webhook-unitech/index.ts` — Edge Function webhook UnitechPay (abonnements).

## Contrat d'API (create-payment)

Requête : `POST` avec `Authorization: Bearer <jwt gérant>` et body :
```json
{ "plan": "starter|pro|entreprise|free", "billing_period": "monthly|annual", "payment_method": "wave|orange_money", "customer_number": "7XXXXXXXX" }
```
`billing_period`/`payment_method`/`customer_number` sont ignorés et non requis si `plan: "free"` (activation directe, sans paiement, via `activate_free_plan()`).

Réponse (plan payant) : `{ success, payment_url, deep_links, subscription_id, unitech_reference, montant }`.
Réponse (plan free) : `{ success, plan: "free", payment_required: false, subscription_id, status: "active" }`.

Le montant n'est **jamais** lu depuis le corps de la requête — il est recalculé côté serveur à partir de `plan_limits` (via la RPC `create_pending_subscription`), qui fait foi.

## Contrat du webhook (webhook-unitech)

UnitechPay doit POSTer sur `webhook-unitech` avec le header `x-unitechpay-signature` (HMAC-SHA256 du corps brut avec `UNITECH_WEBHOOK_SECRET`) et un body incluant `reference` (celui généré par `create-payment`) et `event`. Seul `event === "payment_completed"` déclenche l'activation ; tout autre `event` (`payment_failed`, `payment_cancelled`, ...) marque la souscription `pending` correspondante comme `revoked`.

## Décision de conception : remplacement de `abonnements`/`abonnement_paliers`

La migration `20260721120000_super_admin_dashboard.sql` avait créé `abonnements` + `abonnement_paliers`, mais ces tables sont **vides en prod** (0 ligne, cf. `PROD_DATA_AUDIT.md`) et leur schéma (statuts `essai/actif/en_retard/expire`, pas de quotas, pas de commission verrouillée) ne correspond plus à la spec de cette tâche. La migration livrée les **supprime** (`DROP TABLE ... CASCADE`) et les remplace par `plan_limits`/`subscriptions`. Aucune donnée n'est perdue. `admin_list_subscriptions` est réécrite pour pointer sur les nouvelles tables ; `admin_get_commission_summary` n'a **pas** été touchée (elle utilise encore le taux plateforme unique de `system_settings`, distinct du taux par plan introduit ici — à unifier séparément si besoin).

## Secrets requis (noms uniquement — à définir via `supabase secrets set` ou le Dashboard → Edge Functions → Secrets)

| Secret | Utilisé par | Rôle |
|---|---|---|
| `UNITECH_WAVE_API_KEY` | `create-payment` | Clé API UnitechPay pour `create_wave_payment` |
| `UNITECH_OM_API_KEY` | `create-payment` | Clé API UnitechPay pour `create_orange_maxit` |
| `UNITECH_WEBHOOK_SECRET` | `webhook-unitech` | Secret HMAC-SHA256 partagé avec UnitechPay pour signer les webhooks d'abonnement |
| `APP_URL` | `create-payment` | Origine publique du frontend (ex: `https://playgroundspot.app`), utilisée pour construire `callback_success`/`callback_cancel` (`APP_URL/payment/success?sub=<id>` et `.../payment/cancel?sub=<id>`) |
| `SUPABASE_URL` | les deux | Auto-injecté par Supabase Edge Functions, pas besoin de le définir |
| `SUPABASE_ANON_KEY` | `create-payment` | Auto-injecté par Supabase Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | `webhook-unitech` | Auto-injecté par Supabase Edge Functions |

⚠️ Ces clés sont **distinctes** de `UNITECH_API_KEY` / `UNITECH_WEBHOOK_SECRET` déjà utilisées par `api/index.js` pour les paiements de **réservation** (booking) — les deux systèmes de paiement (réservation vs abonnement) sont volontairement indépendants.

## Prérequis d'infra

1. **pg_cron** doit être activé sur le projet (Dashboard → Database → Extensions → `pg_cron`). La migration tente `CREATE EXTENSION IF NOT EXISTS pg_cron;` mais ça peut échouer par permissions selon le SQL Editor — dans ce cas, active-le manuellement puis ré-exécute uniquement la section 8 de la migration (le job `cron.schedule`).
2. **Déclarer les secrets** :
   ```
   supabase secrets set UNITECH_WAVE_API_KEY=...
   supabase secrets set UNITECH_OM_API_KEY=...
   supabase secrets set UNITECH_WEBHOOK_SECRET=...
   supabase secrets set APP_URL=https://playgroundspot.app
   ```
3. **Déployer les Edge Functions** :
   ```
   supabase functions deploy create-payment
   supabase functions deploy webhook-unitech --no-verify-jwt
   ```
   `--no-verify-jwt` est nécessaire sur `webhook-unitech` car l'appelant est UnitechPay (pas un utilisateur Supabase authentifié) — la sécurité est assurée par la vérification HMAC interne, pas par le JWT Supabase.
4. ⚠️ **Rappel manuel (hors code)** : enregistrer l'URL publique `https://<project-ref>.supabase.co/functions/v1/webhook-unitech` dans le dashboard UnitechPay comme destination des notifications de paiement — sans ça, rien ne se confirme automatiquement côté abonnements.

## Points laissés en l'état (hors périmètre de cette tâche, à traiter séparément)

- **Nettoyage des `pending` orphelins** : si `create-payment` crée la ligne `pending` puis que l'appel UnitechPay échoue (réseau, clé invalide), la ligne reste `pending` indéfiniment (bloque toute nouvelle tentative via la contrainte "un seul pending par gérant"). Pas de job de nettoyage demandé dans la spec — à ajouter si ce cas se présente en pratique (ex: cron qui repasse en `revoked` tout `pending` de plus de 30 min).
- **Logique d'essai (`essai_utilise`)** : la colonne existe et est renseignée (passe à `true` à la première activation d'un plan payant), mais aucune règle métier de période d'essai (durée, plan concerné) n'était spécifiée — rien de plus n'a été implémenté pour éviter d'inventer une règle non demandée.
- **Application dure des quotas** : `check_quota()` est un vérificateur ; rien ne l'appelle automatiquement pour bloquer la création d'un terrain ou d'une réservation au-delà de la limite (pas demandé explicitement — la Tâche 2 ne demande qu'une fonction de vérification). À câbler dans le flux de création terrain/réservation (frontend ou policy RLS) si un blocage dur est voulu.
- **`admin_get_commission_summary`** reste sur l'ancien taux plateforme unique (`system_settings.commission_plateforme`), pas encore branchée sur les nouvelles colonnes `paiements.commission_rate_applique` / `commission_montant`.
