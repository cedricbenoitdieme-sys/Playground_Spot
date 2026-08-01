-- ============================================================
-- Migration : intégration SenePay — table de suivi des transactions
-- SenePay, commune aux 3 flux (abonnement, boost, réservation).
--
-- Remplace UnitechPay comme prestataire de paiement (agrégateur mobile
-- money, headers X-Api-Key/X-Api-Secret, webhooks HMAC-SHA256 signés avec
-- un secret DÉDIÉ webhookSigningSecret — jamais X-Api-Secret).
--
-- Design : cette table ne remplace PAS `subscriptions`/`visibility_boosts`/
-- `paiements` — elle vient EN PLUS, pour tracer les champs propres à
-- SenePay (token, internal_id, next_action, statut OTP/USSD) pendant que
-- l'activation métier continue de passer par les RPC existantes
-- (create_pending_subscription/create_pending_boost, activate_subscription/
-- activate_boost) ou, pour les réservations, par handle_payment_webhook via
-- paiements.ref_externe (migration 20260801190000). Le `order_id` envoyé à
-- SenePay est systématiquement la référence déjà générée par ces RPC
-- (SUB-.../BOOST-.../RES-...) — aucun renommage de colonne nécessaire.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.senepay_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       TEXT UNIQUE NOT NULL,
  token          TEXT,
  internal_id    TEXT,
  type_flux      TEXT NOT NULL CHECK (type_flux IN ('abonnement', 'boost', 'reservation')),
  gerant_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  terrain_id     UUID REFERENCES public.terrains(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  operator       TEXT,
  phone          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  next_action    TEXT,
  otp_required   BOOLEAN NOT NULL DEFAULT false,
  raw_response   JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_senepay_payments_gerant ON public.senepay_payments(gerant_id);
CREATE INDEX IF NOT EXISTS idx_senepay_payments_reservation ON public.senepay_payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_senepay_payments_internal_id ON public.senepay_payments(internal_id);

DO $$ BEGIN
  CREATE TRIGGER trg_senepay_payments_updated_at BEFORE UPDATE ON public.senepay_payments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.senepay_payments ENABLE ROW LEVEL SECURITY;

-- Lecture : le gérant propriétaire (abonnement/boost), le joueur propriétaire
-- de la réservation (paiement réservation), ou l'admin. Pas de policy
-- INSERT/UPDATE pour authenticated/anon : toute écriture passe par les RPC
-- SECURITY DEFINER ci-dessous, même convention que subscriptions/visibility_boosts.
DO $$ BEGIN
  CREATE POLICY "senepay_payments_select_own_or_admin" ON public.senepay_payments
    FOR SELECT USING (
      gerant_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.reservations r
        WHERE r.id = senepay_payments.reservation_id AND r.joueur_id = auth.uid()
      )
      OR public.is_super_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── create_senepay_payment_record — appelée par l'Edge Function senepay-initiate
-- juste avant l'appel HTTP à SenePay, pour tracer la transaction. Auto ou
-- admin uniquement (même garde que create_pending_boost).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_senepay_payment_record(
  p_order_id TEXT,
  p_type_flux TEXT,
  p_gerant_id UUID,
  p_terrain_id UUID,
  p_reservation_id UUID,
  p_amount INTEGER,
  p_operator TEXT,
  p_phone TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_joueur_id UUID;
BEGIN
  IF p_type_flux NOT IN ('abonnement', 'boost', 'reservation') THEN
    RAISE EXCEPTION 'type_flux invalide : %', p_type_flux;
  END IF;

  IF p_gerant_id IS NOT NULL AND p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_type_flux = 'reservation' THEN
    SELECT joueur_id INTO v_joueur_id FROM public.reservations WHERE id = p_reservation_id;
    IF v_joueur_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;
  END IF;

  INSERT INTO public.senepay_payments
    (order_id, type_flux, gerant_id, terrain_id, reservation_id, amount, operator, phone, status)
  VALUES
    (p_order_id, p_type_flux, p_gerant_id, p_terrain_id, p_reservation_id, p_amount, p_operator, p_phone, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── update_senepay_payment_status — appelée par DEUX appelants distincts :
-- senepay-initiate (client JWT-scopé, réponse SYNCHRONE immédiate à l'appel
-- initiate — doit persister token/next_action avant même qu'un webhook
-- n'arrive) ET senepay-webhook (service_role, confirmation asynchrone,
-- aucun contexte utilisateur). Contrairement à activate_subscription/
-- activate_boost (verrouillées service_role car elles ACTIVENT un objet
-- métier payant — le contournement doit être impossible), cette fonction ne
-- fait que tracer un statut de transport SenePay (pending/otp_required/...),
-- jamais l'activation elle-même : verrouiller par propriétaire (ou
-- service_role, où auth.uid() est NULL faute de JWT) suffit.
-- Idempotente : no-op si déjà dans un statut terminal, pour ne jamais
-- régresser un statut confirmé sur un rejeu tardif de webhook.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_senepay_payment_status(
  p_order_id TEXT,
  p_status TEXT,
  p_next_action TEXT DEFAULT NULL,
  p_token TEXT DEFAULT NULL,
  p_internal_id TEXT DEFAULT NULL,
  p_raw_response JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gerant_id UUID;
  v_reservation_id UUID;
  v_joueur_id UUID;
BEGIN
  SELECT gerant_id, reservation_id INTO v_gerant_id, v_reservation_id
  FROM public.senepay_payments WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_reservation_id IS NOT NULL THEN
    SELECT joueur_id INTO v_joueur_id FROM public.reservations WHERE id = v_reservation_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND v_gerant_id IS DISTINCT FROM auth.uid()
     AND v_joueur_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.senepay_payments
  SET status = p_status,
      next_action = COALESCE(p_next_action, next_action),
      token = COALESCE(p_token, token),
      internal_id = COALESCE(p_internal_id, internal_id),
      otp_required = (p_next_action = 'OTP_REQUIRED'),
      raw_response = COALESCE(p_raw_response, raw_response),
      updated_at = NOW()
  WHERE order_id = p_order_id
    AND status NOT IN ('completed', 'failed', 'cancelled');
END;
$$;

-- ============================================================
-- Vérification post-migration :
-- SELECT public.create_senepay_payment_record('TEST-123', 'reservation', NULL, NULL, '<reservation_id>', 5000, 'wave', '771234567');
-- SELECT public.update_senepay_payment_status('TEST-123', 'completed', 'NONE');
-- SELECT * FROM public.senepay_payments WHERE order_id = 'TEST-123'; -- status doit être 'completed'
-- ============================================================
