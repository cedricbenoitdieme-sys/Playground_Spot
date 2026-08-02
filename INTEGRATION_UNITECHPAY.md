# Intégration UnitechPay — PlaygroundSpot

## 1. Ordre de déploiement

```bash
# 1. Migration (corrige F1-F4 + colonnes/RPC UnitechPay)
supabase db push

# 2. Secrets
supabase secrets set UNITECHPAY_API_KEY="<clé_api_unitechpay>"
supabase secrets set SITE_URL="https://playgroundspot.sn"   # sans slash final

# 3. Edge Functions
supabase functions deploy create-payment
supabase functions deploy payment-webhook --no-verify-jwt

# 4. Enregistrement du webhook côté UnitechPay (une seule fois, cf. §2)

# 5. Planification pg_cron (cf. §3)

# 6. Activer Realtime sur reservations (cf. §5) — à faire manuellement
#    dans le Dashboard Supabase, Database → Replication.
```

`payment-webhook` DOIT être déployée avec `--no-verify-jwt` : UnitechPay
n'envoie aucun JWT Supabase, seulement le header `x-unitechpay-signature`.
`create-payment` garde `verify_jwt = true` (le client envoie le JWT du
joueur, qui est relayé tel quel au client "user" à l'intérieur de la
fonction).

## 2. Enregistrement du webhook

```bash
curl -X POST "https://api.unitech.sn/api?action=configure_webhook" \
  -H "Authorization: Bearer <CLE_API_UNITECHPAY>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://<project-ref>.supabase.co/functions/v1/payment-webhook",
    "events": ["payment_completed", "payment_failed", "payment_expired", "withdrawal_processed", "withdrawal_failed"]
  }'
```

Remplacer `<project-ref>` par la référence du projet Supabase
(`ahqtcgxrewrfbowblygu`).

## 3. Planification pg_cron

La migration crée `public.expirer_paiements_abandonnes()` mais ne la
planifie PAS automatiquement (contrairement à l'ancien job générique
`expire-pending-reservation-payments`, qui reste actif — voir la note dans
la migration). À exécuter une fois, via le SQL Editor Supabase ou une
nouvelle migration :

```sql
SELECT cron.schedule(
  'expirer-paiements-unitechpay',
  '*/5 * * * *',
  $$SELECT public.expirer_paiements_abandonnes();$$
);
```

Vérification :

```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'expirer-paiements-unitechpay';
```

## 4. Procédure de remboursement manuel

UnitechPay n'expose aucune API de remboursement. Un remboursement est un
retrait (`withdraw_funds`) vers le numéro du joueur concerné.

1. Lister les paiements à traiter :
   ```sql
   SELECT * FROM public.v_remboursements_a_traiter;
   ```
2. Pour chaque ligne, déclencher le retrait :
   ```bash
   curl -X POST "https://api.unitech.sn/api?action=withdraw_funds" \
     -H "Authorization: Bearer <CLE_API_UNITECHPAY>" \
     -H "Content-Type: application/json" \
     -d '{
       "amount": <montant>,
       "method": "<wave|orange>",
       "account": "<joueur_tel_profil ou numero_tel>"
     }'
   ```
3. Une fois le retrait confirmé, marquer la ligne comme traitée :
   ```sql
   UPDATE public.paiements
   SET rembourse_at = NOW(), payout_ref = '<reference_retrait>'
   WHERE id = '<paiement_id>';
   ```

Cette procédure est manuelle par construction (pas d'automatisation tant
qu'aucun webhook `withdrawal_processed`/`withdrawal_failed` n'est raccordé
à une mise à jour d'état ; `handle_unitech_webhook` les reçoit déjà mais
les ignore volontairement pour l'instant — à étendre si un besoin de
suivi automatique du statut de retrait apparaît).

## 5. Realtime sur `reservations`

Le front observe `reservations.statut` via Supabase Realtime
(`en_attente` → `confirmee` ou `annulee`), aucune confirmation ne transite
par les URLs de callback. Activer Realtime :

Dashboard Supabase → Database → Replication → activer la table
`reservations`.

**⚠️ Cette étape n'a pas pu être effectuée depuis cette session (aucun
accès MCP Supabase fonctionnel) — à confirmer manuellement.**

## 6. Test de signature HMAC

Vérifier que la Edge Function rejette bien une signature falsifiée (401,
aucune écriture), puis qu'elle accepte une signature correctement calculée
sur le corps exact envoyé :

```bash
BODY='{"event":"payment_completed","transaction_id":18,"reference":"wave_test_123","amount":5000,"status":"completed","method":"wave","commission":75,"net_amount":4925,"timestamp":1716540300}'

# Signature correcte (HMAC-SHA256 hex, clé = clé API UnitechPay)
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "<CLE_API_UNITECHPAY>" | sed 's/^.* //')

curl -X POST "https://<project-ref>.supabase.co/functions/v1/payment-webhook" \
  -H "Content-Type: application/json" \
  -H "x-unitechpay-signature: $SIG" \
  -d "$BODY"
# -> 200, {"ok":true,"skipped":"paiement_inconnu"} si "wave_test_123" n'existe
#    pas encore en base (normal pour ce test isolé)

# Signature falsifiée
curl -X POST "https://<project-ref>.supabase.co/functions/v1/payment-webhook" \
  -H "Content-Type: application/json" \
  -H "x-unitechpay-signature: 0000000000000000000000000000000000000000000000000000000000000000" \
  -d "$BODY"
# -> 401, "Signature invalide", et RIEN dans webhook_logs
```

## 7. Rupture de compatibilité frontend (important)

Cette migration supprime la policy RLS `reservations_insert_joueur`
(faille F3 : un joueur pouvait insérer directement une réservation avec un
montant arbitraire). Conséquence directe : `create_reservation_safe()` et
`src/services/reservations.js#createReservation()` cessent de fonctionner
pour un joueur — l'EXECUTE a aussi été explicitement révoqué sur
`create_reservation_safe`.

Toute création de réservation doit désormais passer par la nouvelle RPC
`creer_reservation_en_attente(p_creneau_id)`, qui exige un **vrai
`creneau_id`** existant dans `public.creneaux` — contrairement au flux
actuel de `BookingFlow.jsx`, qui invente une date/heure côté client sans
jamais lire cette table. C'est un changement d'architecture (sélection
d'un créneau réel), pas un simple renommage de fonction. Un prompt de
handoff détaillé pour l'agent frontend doit être produit séparément avant
tout déploiement en production, sous peine de casser entièrement la
création de réservations (y compris "sur place").

## 8. Enums à vérifier côté frontend

- `mode_paiement` : `wave`, `orange_money`, `sur_place`, `carte`,
  `pay_unitech` (inchangé — `orange_maxit`/`orange_qr` ne sont PAS des
  valeurs d'enum, ils se rangent sous `orange_money` en base).
- `statut_paiement` : `en_attente`, `valide`, `echoue`, `rembourse`,
  `expire` (inchangé).
- `statut_reservation` : `en_attente`, `confirmee`, `terminee`, `annulee`
  (inchangé).
- `methode` (paramètre `create-payment`, pas un enum SQL) :
  `wave`, `orange_money`, `orange_maxit`, `orange_qr`.
