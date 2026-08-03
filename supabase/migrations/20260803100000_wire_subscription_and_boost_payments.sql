-- ============================================================
-- Migration : rebranche les paiements d'abonnement et de boost de
-- visibilité sur UnitechPay.
--
-- Contexte : depuis le retrait de SenePay (20260802150000) et la
-- réécriture de create-payment/payment-webhook pour UnitechPay
-- (commit e7366ed), seul le flux réservation a été rebranché.
-- create_pending_subscription/activate_subscription et
-- create_pending_boost/activate_boost existent toujours mais ne sont
-- appelés par aucun code (Edge Function ni frontend) : un gérant qui
-- souscrit un plan payant ou active un boost reçoit une erreur
-- (create-payment ne lit que { creneau_id, methode, telephone }).
--
-- Cette migration ne touche que handle_unitech_webhook (le seul point
-- d'entrée SQL du webhook) : côté Edge Function, create-payment/index.ts
-- est mis à jour séparément pour appeler create_pending_subscription /
-- create_pending_boost ; payment-webhook/index.ts n'a besoin d'aucun
-- changement, il délègue déjà tout à handle_unitech_webhook.
-- ============================================================

-- ============================================================
-- 1. handle_unitech_webhook — ajoute la reconnaissance des références
-- subscriptions.unitech_reference et visibility_boosts.unitech_reference
-- en plus de paiements.ref_externe (réservations). Chaque référence est
-- générée indépendamment (gen_random_uuid()) donc jamais ambiguë entre
-- les trois tables.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_unitech_webhook(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event            TEXT := p_payload->>'event';
  v_reference        TEXT := p_payload->>'reference';
  v_paiement         public.paiements%ROWTYPE;
  v_sub              public.subscriptions%ROWTYPE;
  v_boost            public.visibility_boosts%ROWTYPE;
  v_montant_recu     NUMERIC;
  v_montant_attendu  NUMERIC;
  v_activation       JSONB;
BEGIN
  INSERT INTO public.webhook_logs (provider, payload) VALUES ('unitechpay', p_payload);

  IF v_event LIKE 'withdrawal_%' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_retrait');
  END IF;

  -- ── 1. Réservation (paiements) — inchangé ────────────────────────
  SELECT * INTO v_paiement FROM public.paiements WHERE ref_externe = v_reference FOR UPDATE;

  IF FOUND THEN
    IF v_paiement.statut IN ('valide', 'rembourse') THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'deja_traite');
    END IF;

    IF v_event = 'payment_completed' THEN
      v_montant_recu := (p_payload->>'amount')::NUMERIC;

      IF v_montant_recu IS DISTINCT FROM v_paiement.montant::NUMERIC THEN
        RAISE WARNING 'handle_unitech_webhook: montant incohérent pour paiement % (attendu %, reçu %, ref %)',
          v_paiement.id, v_paiement.montant, v_montant_recu, v_reference;
        RETURN jsonb_build_object('ok', true, 'skipped', 'montant_incoherent');
      END IF;

      UPDATE public.paiements
      SET statut          = 'valide',
          commission      = (p_payload->>'commission')::INTEGER,
          montant_net     = (p_payload->>'net_amount')::INTEGER,
          provider_txn_id = (p_payload->>'transaction_id')::BIGINT,
          updated_at      = NOW()
      WHERE id = v_paiement.id;

      UPDATE public.reservations
      SET statut = 'confirmee', updated_at = NOW()
      WHERE id = v_paiement.reservation_id AND statut = 'en_attente';

      INSERT INTO public.tickets (booking_id)
      VALUES (v_paiement.reservation_id)
      ON CONFLICT (booking_id) DO NOTHING;

      RETURN jsonb_build_object('ok', true, 'kind', 'reservation', 'statut', 'confirmee');

    ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
      UPDATE public.paiements
      SET statut = 'echoue', updated_at = NOW()
      WHERE id = v_paiement.id;

      UPDATE public.reservations
      SET statut = 'annulee',
          motif_annulation = CASE v_event
            WHEN 'payment_failed' THEN 'Paiement UnitechPay refusé'
            ELSE 'Paiement UnitechPay expiré côté prestataire'
          END,
          updated_at = NOW()
      WHERE id = v_paiement.reservation_id AND statut = 'en_attente';

      RETURN jsonb_build_object('ok', true, 'kind', 'reservation', 'statut', 'echoue');
    END IF;

    RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
  END IF;

  -- ── 2. Abonnement (subscriptions) ────────────────────────────────
  SELECT * INTO v_sub FROM public.subscriptions WHERE unitech_reference = v_reference FOR UPDATE;

  IF FOUND THEN
    IF v_sub.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'deja_traite');
    END IF;

    IF v_event = 'payment_completed' THEN
      SELECT CASE v_sub.cycle WHEN 'annuel' THEN pl.prix_annuel ELSE pl.prix_mensuel END
      INTO v_montant_attendu
      FROM public.plan_limits pl WHERE pl.plan_id = v_sub.plan_id;

      v_montant_recu := (p_payload->>'amount')::NUMERIC;

      IF v_montant_recu IS DISTINCT FROM v_montant_attendu THEN
        RAISE WARNING 'handle_unitech_webhook: montant incohérent pour abonnement % (attendu %, reçu %, ref %)',
          v_sub.id, v_montant_attendu, v_montant_recu, v_reference;
        RETURN jsonb_build_object('ok', true, 'skipped', 'montant_incoherent');
      END IF;

      v_activation := public.activate_subscription(v_reference, 'success', v_sub.phone_number)::JSONB;
    ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
      v_activation := public.activate_subscription(v_reference, v_event, v_sub.phone_number)::JSONB;
    ELSE
      RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
    END IF;

    RETURN jsonb_build_object('ok', true, 'kind', 'subscription') || v_activation;
  END IF;

  -- ── 3. Boost de visibilité (visibility_boosts) ───────────────────
  SELECT * INTO v_boost FROM public.visibility_boosts WHERE unitech_reference = v_reference FOR UPDATE;

  IF FOUND THEN
    IF v_boost.statut <> 'en_attente' THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'deja_traite');
    END IF;

    IF v_event = 'payment_completed' THEN
      v_montant_recu := (p_payload->>'amount')::NUMERIC;

      IF v_montant_recu IS DISTINCT FROM v_boost.budget_alloue::NUMERIC THEN
        RAISE WARNING 'handle_unitech_webhook: montant incohérent pour boost % (attendu %, reçu %, ref %)',
          v_boost.id, v_boost.budget_alloue, v_montant_recu, v_reference;
        RETURN jsonb_build_object('ok', true, 'skipped', 'montant_incoherent');
      END IF;

      v_activation := public.activate_boost(v_reference, 'success')::JSONB;
    ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
      v_activation := public.activate_boost(v_reference, v_event)::JSONB;
    ELSE
      RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
    END IF;

    RETURN jsonb_build_object('ok', true, 'kind', 'boost') || v_activation;
  END IF;

  -- Jamais de RAISE ici : référence inconnue -> UnitechPay ne doit pas
  -- retenter indéfiniment un webhook qu'on ne pourra jamais rattacher.
  RETURN jsonb_build_object('ok', true, 'skipped', 'paiement_inconnu');
END;
$$;

REVOKE ALL ON FUNCTION public.handle_unitech_webhook(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_unitech_webhook(JSONB) TO service_role;

-- ============================================================
-- 2. Nettoyage des abonnements/boosts 'pending' abandonnés.
--
-- Au-delà de la demande initiale : en rebranchant create_pending_subscription
-- (réutilisable seulement) et create_pending_boost, on réactive
-- idx_one_active_subscription_per_gerant / idx_one_pending_subscription_per_gerant
-- (contrainte déjà en place depuis 20260722150000) et l'équivalent implicite
-- pour visibility_boosts (un seul boost en_attente/actif par terrain, posé
-- dans create_pending_boost). Sans nettoyage, un gérant dont l'appel
-- UnitechPay échoue en dehors des cas déjà gérés par create-payment/index.ts
-- (crash, timeout de la fonction Edge elle-même) resterait bloqué avec une
-- ligne 'pending'/'en_attente' à vie, sans pouvoir retenter — même défaut
-- que celui déjà corrigé pour les paiements de réservation par
-- expirer_paiements_abandonnes (20260802160000).
-- ============================================================
CREATE OR REPLACE FUNCTION public.expirer_abonnements_boosts_en_attente()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_tmp   INTEGER;
BEGIN
  UPDATE public.subscriptions
  SET status = 'revoked', updated_at = NOW()
  WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  UPDATE public.visibility_boosts
  SET statut = 'annule', updated_at = NOW()
  WHERE statut = 'en_attente' AND created_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expirer_abonnements_boosts_en_attente() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirer_abonnements_boosts_en_attente() TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('expire-pending-subscriptions-boosts');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'expire-pending-subscriptions-boosts',
  '*/10 * * * *',
  $$SELECT public.expirer_abonnements_boosts_en_attente();$$
);

-- ============================================================
-- Vérification post-migration :
--
-- SELECT public.handle_unitech_webhook('{}'::jsonb); -- doit échouer en
--   session authenticated normale (permission denied)
--
-- SELECT jobname FROM cron.job WHERE jobname = 'expire-pending-subscriptions-boosts'; -- 1 ligne
-- ============================================================
