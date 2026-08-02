-- Corrige update_senepay_payment_status : `otp_required = (p_next_action =
-- 'OTP_REQUIRED')` renvoie NULL (logique ternaire SQL) quand p_next_action
-- est NULL (valeur par défaut, cas de la branche d'échec de senepay-initiate
-- et de la mise à jour post-webhook) — violant la contrainte NOT NULL de la
-- colonne et faisant échouer silencieusement CHAQUE appel de cette fonction.
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
      otp_required = CASE WHEN p_next_action IS NOT NULL THEN (p_next_action = 'OTP_REQUIRED') ELSE otp_required END,
      raw_response = COALESCE(p_raw_response, raw_response),
      updated_at = NOW()
  WHERE order_id = p_order_id
    AND status NOT IN ('completed', 'failed', 'cancelled');
END;
$$;
