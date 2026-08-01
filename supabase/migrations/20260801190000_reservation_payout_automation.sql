-- ============================================================
-- Migration : paiement de réservation créé côté serveur (SenePay) +
-- automatisation du payout marketplace vers le gérant.
--
-- 1. create_pending_reservation_payment — jusqu'ici le client insérait
--    directement une ligne `paiements` avant d'appeler l'Express
--    /api/payments/initiate (UnitechPay). L'Edge Function senepay-initiate
--    prend maintenant en charge les 3 flux (abonnement/boost/réservation) et
--    doit donc créer elle-même cette ligne, en relisant `reservations.montant`
--    côté serveur — même invariant "montant jamais fourni par le client" que
--    create_pending_subscription/create_pending_boost.
--
-- 2. process_reservation_payout / finalize_reservation_payout — dès qu'un
--    paiement de réservation est confirmé (handle_payment_webhook, migration
--    20260726100000, inchangée), la plateforme déclenche un virement
--    automatique vers le gérant : montant réservation moins la commission de
--    SON PLAN ACTUEL AU MOMENT DU WEBHOOK (pas celui en vigueur au moment de
--    la réservation — un gérant peut changer de plan entre les deux).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gerant_payouts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id             TEXT UNIQUE NOT NULL,
  disbursement_id         TEXT,
  reservation_id          UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  gerant_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  terrain_id              UUID REFERENCES public.terrains(id) ON DELETE SET NULL,
  amount                  INTEGER NOT NULL CHECK (amount >= 0),
  commission_rate_applied NUMERIC(5,2) NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending', -- pending|submitted|pending_verification|completed|failed
  raw_response            JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_payout_per_reservation ON public.gerant_payouts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_gerant_payouts_gerant ON public.gerant_payouts(gerant_id);

DO $$ BEGIN
  CREATE TRIGGER trg_gerant_payouts_updated_at BEFORE UPDATE ON public.gerant_payouts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.gerant_payouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "gerant_payouts_select_own_or_admin" ON public.gerant_payouts
    FOR SELECT USING (gerant_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE pour authenticated/anon : uniquement via
-- process_reservation_payout/finalize_reservation_payout (service_role).

-- ── create_pending_reservation_payment — appelée par l'Edge Function
-- senepay-initiate pour type_flux='reservation'. Remplace l'insertion
-- client-side historique de la ligne `paiements`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_pending_reservation_payment(
  p_reservation_id UUID,
  p_mode mode_paiement,
  p_numero_tel TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_terrain_id UUID;
  v_gerant_id UUID;
  v_ref TEXT;
  v_paiement_id UUID;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Réservation introuvable';
  END IF;

  IF v_reservation.joueur_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_reservation.statut <> 'en_attente' THEN
    RAISE EXCEPTION 'Cette réservation n''est pas en attente de paiement';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.paiements
    WHERE reservation_id = p_reservation_id AND statut = 'en_attente'
  ) THEN
    RAISE EXCEPTION 'Un paiement est déjà en attente pour cette réservation';
  END IF;

  SELECT id, gerant_id INTO v_terrain_id, v_gerant_id
  FROM public.terrains WHERE id = v_reservation.terrain_id;

  v_ref := 'RES-' || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.paiements (reservation_id, montant, mode, statut, ref_externe, numero_tel)
  VALUES (p_reservation_id, v_reservation.montant, p_mode, 'en_attente', v_ref, p_numero_tel)
  RETURNING id INTO v_paiement_id;

  RETURN json_build_object(
    'paiement_id', v_paiement_id, 'reservation_id', p_reservation_id,
    'reference', v_ref, 'montant', v_reservation.montant,
    'terrain_id', v_terrain_id, 'gerant_id', v_gerant_id
  );
END;
$$;

-- ── process_reservation_payout — appelée UNIQUEMENT par l'Edge Function
-- senepay-webhook, immédiatement après que handle_payment_webhook a confirmé
-- le paiement d'une réservation. Verrouillée service_role : c'est elle qui
-- calcule le montant réellement viré au gérant, un contournement client
-- serait un risque financier direct.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_reservation_payout(
  p_reservation_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terrain_id UUID;
  v_gerant_id UUID;
  v_montant INTEGER;
  v_rate NUMERIC(5,2);
  v_payout_amount INTEGER;
  v_external_id TEXT;
  v_payout_info public.gerant_payout_info%ROWTYPE;
  v_payout_id UUID;
BEGIN
  SELECT r.montant, t.id, t.gerant_id
  INTO v_montant, v_terrain_id, v_gerant_id
  FROM public.reservations r
  JOIN public.terrains t ON t.id = r.terrain_id
  WHERE r.id = p_reservation_id;

  IF v_gerant_id IS NULL THEN
    RETURN json_build_object('handled', false, 'reason', 'terrain_or_gerant_introuvable');
  END IF;

  v_external_id := 'PAYOUT-' || p_reservation_id;

  IF EXISTS (SELECT 1 FROM public.gerant_payouts WHERE external_id = v_external_id) THEN
    -- Idempotence : le webhook payin peut être relivré (jusqu'à 14 fois côté
    -- SenePay) — un payout ne doit jamais être déclenché deux fois.
    RETURN json_build_object('handled', false, 'reason', 'payout_already_processed');
  END IF;

  -- Taux du plan ACTIF au moment du webhook, pas celui en vigueur au moment
  -- de la réservation (_plan_limits_internal retombe sur Free si aucun
  -- abonnement actif n'est trouvé — jamais d'exception ici).
  v_rate := ((public._plan_limits_internal(v_gerant_id))->>'commission_rate')::NUMERIC(5,2);
  v_payout_amount := ROUND(v_montant * (1 - v_rate / 100));

  SELECT * INTO v_payout_info FROM public.gerant_payout_info WHERE gerant_id = v_gerant_id;
  IF NOT FOUND THEN
    -- Ne devrait pas arriver (admin_review_terrain bloque l'approbation sans
    -- payout info) mais un gérant a pu supprimer son terrain/compte entre
    -- temps — on log plutôt que de faire échouer tout le traitement du webhook.
    RETURN json_build_object('handled', false, 'reason', 'gerant_payout_info_manquant', 'gerant_id', v_gerant_id);
  END IF;

  INSERT INTO public.gerant_payouts
    (external_id, reservation_id, gerant_id, terrain_id, amount, commission_rate_applied, status)
  VALUES
    (v_external_id, p_reservation_id, v_gerant_id, v_terrain_id, v_payout_amount, v_rate, 'pending')
  ON CONFLICT (external_id) DO NOTHING
  RETURNING id INTO v_payout_id;

  IF v_payout_id IS NULL THEN
    RETURN json_build_object('handled', false, 'reason', 'payout_already_processed');
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

-- ── finalize_reservation_payout — appelée UNIQUEMENT par l'Edge Function
-- senepay-payout-webhook, et UNIQUEMENT sur un statut terminal
-- (disbursement.completed/disbursement.failed). Ne jamais appeler pour
-- pending_verification/submitted — le webhook ne les transmet pas ici,
-- cette fonction n'a donc pas besoin de les connaître.
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_reservation_payout(
  p_external_id TEXT,
  p_status TEXT,
  p_disbursement_id TEXT,
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
      disbursement_id = COALESCE(p_disbursement_id, disbursement_id),
      raw_response = COALESCE(p_raw_response, raw_response),
      updated_at = NOW()
  WHERE external_id = p_external_id
    AND status NOT IN ('completed', 'failed');

  -- p_status = 'failed' : le wallet plateforme est re-crédité automatiquement
  -- côté SenePay, mais le gérant n'a pas reçu son dû. Codes PROVIDER_ERROR/
  -- PROVIDER_EXCEPTION interdisent explicitement un retry automatique —
  -- aucune logique de nouvelle tentative ici, intervention manuelle requise
  -- (voir la ligne loggée par l'Edge Function elle-même).
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_reservation_payout(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_payout(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================
-- Vérification post-migration :
-- SELECT public.create_pending_reservation_payment('<reservation_id>', 'wave', '771234567'); -- en session joueur propriétaire
-- SELECT public.process_reservation_payout('<reservation_id>'); -- doit RAISE (revoked from PUBLIC) hors service_role
-- SELECT * FROM public.gerant_payouts WHERE reservation_id = '<reservation_id>';
-- ============================================================
