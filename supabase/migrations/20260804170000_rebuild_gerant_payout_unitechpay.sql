-- ============================================================
-- Reconstruction du versement automatique gérant (payout), pour UnitechPay.
--
-- Contexte : ce mécanisme existait pour l'ancien prestataire SenePay
-- (migrations 20260801180000/20260801190000 : gerant_payout_info,
-- gerant_payouts, process_reservation_payout, finalize_reservation_payout)
-- mais a été entièrement supprimé lors de l'abandon de SenePay
-- (20260802150000). Il n'a jamais été reconstruit pour UnitechPay — depuis,
-- calculate_commission() (20260803220000) calcule bien la commission
-- plateforme à chaque paiement de réservation confirmé, mais AUCUN virement
-- n'était déclenché vers le gérant : l'intégralité du paiement restait sur
-- le solde UnitechPay de la plateforme.
--
-- Décision produit (confirmée) : un seul compte de versement fixe par
-- gérant (numéro + opérateur Wave OU Orange Money), pas un compte par
-- opérateur — reprend exactement le design d'origine SenePay.
--
-- Différence volontaire par rapport à l'ancien design SenePay : le montant
-- du versement est dérivé de paiements.commission_montant (déjà verrouillé
-- par calculate_commission() au moment du paiement, qui tient compte d'une
-- éventuelle dérogation de commission active), et non recalculé depuis le
-- taux du plan courant — évite une double source de vérité avec le
-- dashboard "Commissions Totales" (admin_get_commission_summary), qui lit
-- déjà commission_montant.
--
-- ⚠️ Point non vérifiable depuis cette session (pas d'accès à la doc
-- complète de l'action UnitechPay `withdraw_funds` ni au format exact des
-- webhooks `withdrawal_processed`/`withdrawal_failed`) : le matching de
-- finalize_reservation_payout() se fait par disbursement_id (identifiant
-- renvoyé par UnitechPay à l'appel withdraw_funds, stocké immédiatement par
-- mark_payout_submitted()). Si le webhook de confirmation UnitechPay
-- utilise un autre champ pour identifier le retrait, adapter le WHERE de
-- finalize_reservation_payout() et le point d'appel dans
-- handle_unitech_webhook en conséquence avant mise en production.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Informations de versement du gérant (compte fixe, auto-service)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gerant_payout_info (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gerant_id  UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  operator   TEXT NOT NULL CHECK (operator IN ('wave', 'orange_money')),
  country    TEXT NOT NULL DEFAULT 'SN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER trg_gerant_payout_info_updated_at BEFORE UPDATE ON public.gerant_payout_info FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.gerant_payout_info ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "gerant_payout_info_select_own_or_admin" ON public.gerant_payout_info
    FOR SELECT USING (gerant_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE pour authenticated : uniquement via
-- upsert_gerant_payout_info ci-dessous (auto-service, jamais pour un tiers).

CREATE OR REPLACE FUNCTION public.upsert_gerant_payout_info(
  p_phone TEXT,
  p_operator TEXT,
  p_country TEXT DEFAULT 'SN'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.gerant_payout_info%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'gerant') THEN
    RAISE EXCEPTION 'Seuls les gérants peuvent renseigner des informations de versement';
  END IF;

  IF p_operator NOT IN ('wave', 'orange_money') THEN
    RAISE EXCEPTION 'Opérateur invalide : % (attendu wave ou orange_money)', p_operator;
  END IF;

  IF p_phone IS NULL OR p_phone !~ '^7[0-9]{8}$' THEN
    RAISE EXCEPTION 'Numéro invalide : format attendu 7XXXXXXXX';
  END IF;

  INSERT INTO public.gerant_payout_info (gerant_id, phone, operator, country)
  VALUES (auth.uid(), p_phone, p_operator, COALESCE(p_country, 'SN'))
  ON CONFLICT (gerant_id) DO UPDATE SET
    phone = EXCLUDED.phone,
    operator = EXCLUDED.operator,
    country = EXCLUDED.country,
    updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'gerant_id', v_row.gerant_id, 'phone', v_row.phone,
    'operator', v_row.operator, 'country', v_row.country
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gerant_payout_info(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_gerant_payout_info(TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) Garde-fou à l'approbation d'un terrain (reprend admin_review_terrain
--    dans sa version actuelle — avec log_admin_action, migration
--    20260802150000 — en réintroduisant uniquement le contrôle payout_info)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_terrain(
  p_terrain_id UUID,
  p_decision public.statut_validation_terrain,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gerant_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle admin requis';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Décision invalide : % (attendu approved ou rejected)', p_decision;
  END IF;

  IF p_decision = 'rejected' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Un motif de refus est requis';
  END IF;

  SELECT gerant_id INTO v_gerant_id FROM public.terrains WHERE id = p_terrain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  IF p_decision = 'approved' THEN
    IF v_gerant_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.gerant_payout_info WHERE gerant_id = v_gerant_id
    ) THEN
      RAISE EXCEPTION 'Impossible d''approuver : le gérant doit renseigner ses informations de versement (Wave/Orange Money) avant qu''un terrain soit réservable';
    END IF;
  END IF;

  UPDATE public.terrains
  SET status = p_decision,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_terrain_id;

  PERFORM public.log_admin_action(
    'admin_review_terrain', 'terrain', p_terrain_id,
    jsonb_build_object('decision', p_decision, 'rejection_reason', p_rejection_reason)
  );

  RETURN json_build_object('success', true, 'terrain_id', p_terrain_id, 'status', p_decision);
END;
$$;

-- ------------------------------------------------------------
-- 3) Traçabilité des versements
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gerant_payouts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id             TEXT UNIQUE NOT NULL,
  disbursement_id         TEXT,
  reservation_id          UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  gerant_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  terrain_id              UUID REFERENCES public.terrains(id) ON DELETE SET NULL,
  amount                  INTEGER NOT NULL CHECK (amount >= 0),
  commission_rate_applied NUMERIC(5,2) NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending', -- pending|submitted|completed|failed
  raw_response            JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_payout_per_reservation ON public.gerant_payouts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_gerant_payouts_gerant ON public.gerant_payouts(gerant_id);
CREATE INDEX IF NOT EXISTS idx_gerant_payouts_disbursement ON public.gerant_payouts(disbursement_id);

DO $$ BEGIN
  CREATE TRIGGER trg_gerant_payouts_updated_at BEFORE UPDATE ON public.gerant_payouts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.gerant_payouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "gerant_payouts_select_own_or_admin" ON public.gerant_payouts
    FOR SELECT USING (gerant_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE pour authenticated/anon : uniquement via les
-- fonctions ci-dessous, verrouillées service_role.

-- ------------------------------------------------------------
-- 4) process_reservation_payout — appelée par handle_unitech_webhook juste
--    après calculate_commission(), pour un paiement de réservation confirmé.
--    Prépare l'enregistrement du versement et renvoie les infos nécessaires
--    (montant, téléphone, opérateur) pour que l'Edge Function déclenche
--    l'appel HTTP réel à UnitechPay (withdraw_funds) — Postgres ne fait pas
--    l'appel HTTP lui-même.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_reservation_payout(
  p_reservation_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terrain_id    UUID;
  v_gerant_id     UUID;
  v_montant       INTEGER;
  v_commission    INTEGER;
  v_rate          NUMERIC(5,2);
  v_payout_amount INTEGER;
  v_external_id   TEXT;
  v_payout_info   public.gerant_payout_info%ROWTYPE;
  v_payout_id     UUID;
BEGIN
  SELECT p.montant, p.commission_montant, p.commission_rate_applique, t.id, t.gerant_id
  INTO v_montant, v_commission, v_rate, v_terrain_id, v_gerant_id
  FROM public.paiements p
  JOIN public.reservations r ON r.id = p.reservation_id
  JOIN public.terrains t ON t.id = r.terrain_id
  WHERE p.reservation_id = p_reservation_id;

  IF v_gerant_id IS NULL THEN
    RETURN json_build_object('handled', false, 'reason', 'terrain_ou_gerant_introuvable');
  END IF;

  IF v_commission IS NULL THEN
    -- calculate_commission() doit avoir tourné avant (handle_unitech_webhook
    -- l'appelle systématiquement en premier) — défensif seulement.
    RETURN json_build_object('handled', false, 'reason', 'commission_non_calculee');
  END IF;

  v_external_id := 'PAYOUT-' || p_reservation_id;

  IF EXISTS (SELECT 1 FROM public.gerant_payouts WHERE external_id = v_external_id) THEN
    -- Idempotence : le webhook payin peut être relivré par UnitechPay — un
    -- versement ne doit jamais être déclenché deux fois.
    RETURN json_build_object('handled', false, 'reason', 'payout_deja_traite');
  END IF;

  v_payout_amount := GREATEST(v_montant - v_commission, 0);

  SELECT * INTO v_payout_info FROM public.gerant_payout_info WHERE gerant_id = v_gerant_id;
  IF NOT FOUND THEN
    -- Ne devrait pas arriver (admin_review_terrain bloque l'approbation sans
    -- payout info) mais on log plutôt que de faire échouer tout le
    -- traitement du webhook de paiement.
    RETURN json_build_object('handled', false, 'reason', 'gerant_payout_info_manquant', 'gerant_id', v_gerant_id);
  END IF;

  INSERT INTO public.gerant_payouts
    (external_id, reservation_id, gerant_id, terrain_id, amount, commission_rate_applied, status)
  VALUES
    (v_external_id, p_reservation_id, v_gerant_id, v_terrain_id, v_payout_amount, v_rate, 'pending')
  ON CONFLICT (external_id) DO NOTHING
  RETURNING id INTO v_payout_id;

  IF v_payout_id IS NULL THEN
    RETURN json_build_object('handled', false, 'reason', 'payout_deja_traite');
  END IF;

  RETURN json_build_object(
    'handled', true,
    'payout_id', v_payout_id,
    'external_id', v_external_id,
    'amount', v_payout_amount,
    'commission_rate', v_rate,
    'phone', v_payout_info.phone,
    'operator', v_payout_info.operator,
    'country', v_payout_info.country
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_reservation_payout(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_reservation_payout(UUID) TO service_role;

-- ------------------------------------------------------------
-- 5) mark_payout_submitted — appelée par l'Edge Function juste après que
--    l'appel HTTP withdraw_funds à UnitechPay a réussi (statut intermédiaire,
--    avant confirmation async par webhook).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_payout_submitted(
  p_external_id TEXT,
  p_disbursement_id TEXT,
  p_raw_response JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.gerant_payouts
  SET status = 'submitted',
      disbursement_id = COALESCE(p_disbursement_id, disbursement_id),
      raw_response = COALESCE(p_raw_response, raw_response),
      updated_at = NOW()
  WHERE external_id = p_external_id
    AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_payout_submitted(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payout_submitted(TEXT, TEXT, JSONB) TO service_role;

-- ------------------------------------------------------------
-- 6) finalize_reservation_payout — appelée par handle_unitech_webhook sur
--    réception d'un webhook withdrawal_processed/withdrawal_failed
--    (statut terminal uniquement).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_reservation_payout(
  p_disbursement_id TEXT,
  p_status TEXT,
  p_raw_response JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'finalize_reservation_payout: statut inattendu % (attendu completed ou failed)', p_status;
  END IF;

  UPDATE public.gerant_payouts
  SET status = p_status,
      raw_response = COALESCE(p_raw_response, raw_response),
      updated_at = NOW()
  WHERE disbursement_id = p_disbursement_id
    AND status NOT IN ('completed', 'failed');

  -- p_status = 'failed' : le solde plateforme UnitechPay n'est pas débité
  -- (retrait non abouti), mais le gérant n'a pas reçu son dû. Aucune
  -- logique de nouvelle tentative automatique ici — intervention manuelle
  -- requise (relancer via l'API UnitechPay ou corriger gerant_payout_info
  -- puis rejouer manuellement process_reservation_payout).
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_reservation_payout(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_payout(TEXT, TEXT, JSONB) TO service_role;

-- ------------------------------------------------------------
-- 7) handle_unitech_webhook — branche le déclenchement du payout après
--    calculate_commission(), et route les évènements withdrawal_* vers
--    finalize_reservation_payout() au lieu de les ignorer.
--
--    ⚠️ Le format exact du payload withdrawal_processed/withdrawal_failed
--    n'est pas documenté dans ce dont je dispose : on suppose ici un champ
--    `disbursement_id` (ou à défaut `transaction_id`) identifiant le
--    retrait, à vérifier/ajuster contre un vrai webhook UnitechPay avant
--    mise en production.
-- ------------------------------------------------------------
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
  v_gerant_id        UUID;
  v_pref_on          BOOLEAN;
  v_disbursement_id  TEXT;
BEGIN
  INSERT INTO public.webhook_logs (provider, payload) VALUES ('unitechpay', p_payload);

  IF v_event LIKE 'withdrawal_%' THEN
    v_disbursement_id := COALESCE(p_payload->>'disbursement_id', p_payload->>'transaction_id');

    IF v_disbursement_id IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'withdrawal_sans_identifiant');
    END IF;

    IF v_event = 'withdrawal_processed' THEN
      PERFORM public.finalize_reservation_payout(v_disbursement_id, 'completed', p_payload);
    ELSIF v_event = 'withdrawal_failed' THEN
      PERFORM public.finalize_reservation_payout(v_disbursement_id, 'failed', p_payload);
    END IF;

    RETURN jsonb_build_object('ok', true, 'kind', 'withdrawal', 'event', v_event);
  END IF;

  -- ── 1. Réservation (paiements) ──────────────────────────────────
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

      -- Commission plateforme (par plan, ou dérogation active) — verrouillée
      -- une fois pour toutes sur ce paiement.
      PERFORM public.calculate_commission(v_paiement.reservation_id);

      -- Notification "Paiement reçu" au gérant du terrain concerné.
      SELECT t.gerant_id INTO v_gerant_id
      FROM public.reservations r JOIN public.terrains t ON t.id = r.terrain_id
      WHERE r.id = v_paiement.reservation_id;

      IF v_gerant_id IS NOT NULL THEN
        SELECT COALESCE((p.notification_prefs->>'paiementRecu')::boolean, true)
          INTO v_pref_on FROM public.profiles p WHERE p.id = v_gerant_id;

        IF v_pref_on THEN
          INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
          VALUES (
            v_gerant_id, 'paiement_recu', 'Paiement reçu',
            'Paiement confirmé pour une réservation — ' || v_paiement.montant || ' FCFA',
            'reservation', v_paiement.reservation_id
          );
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'ok', true, 'kind', 'reservation', 'statut', 'confirmee',
        'reservation_id', v_paiement.reservation_id
      );

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

  -- ── 2. Abonnement (subscriptions) — inchangé ─────────────────────
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

  -- ── 3. Boost de visibilité (visibility_boosts) — inchangé ────────
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

  RETURN jsonb_build_object('ok', true, 'skipped', 'paiement_inconnu');
END;
$$;

REVOKE ALL ON FUNCTION public.handle_unitech_webhook(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_unitech_webhook(JSONB) TO service_role;

-- ============================================================
-- Vérification post-migration :
-- SELECT public.upsert_gerant_payout_info('771234567', 'wave', 'SN'); -- en session gérant
-- SELECT public.admin_review_terrain('<terrain_sans_payout_info>', 'approved'); -- doit RAISE EXCEPTION
-- SELECT public.process_reservation_payout('<reservation_id>'); -- doit RAISE (revoked from PUBLIC) hors service_role
-- SELECT * FROM public.gerant_payouts WHERE reservation_id = '<reservation_id>';
--
-- Test bout-en-bout (nécessite le déploiement de la modification
-- payment-webhook/index.ts, prompt séparé) : confirmer un paiement de
-- réservation de test dont le gérant a bien un gerant_payout_info, puis
-- vérifier qu'une ligne apparaît dans gerant_payouts avec status='pending'
-- (ou 'submitted' après déploiement de l'Edge Function).
-- ============================================================
