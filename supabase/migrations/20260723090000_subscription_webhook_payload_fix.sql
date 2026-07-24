-- ============================================================
-- Migration : ajustement suite à l'inspection réelle du payload webhook
-- UnitechPay (dashboard "Configuration Webhooks") :
--   {"event":"payment_success","reference":"TXN_...","amount":5000,
--    "net_amount":4925,"status":"completed","timestamp":...}
-- → pas de numéro de téléphone dans ce payload. activate_subscription()
-- recevait donc p_phone_number = NULL depuis le webhook et écrasait le
-- numéro déjà enregistré à l'étape create-payment. Fix : ne mettre à jour
-- phone_number que si une valeur non NULL est fournie.
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_unitech_reference TEXT,
  p_status TEXT,
  p_phone_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub             public.subscriptions%ROWTYPE;
  v_prev_active     public.subscriptions%ROWTYPE;
  v_had_paid_before BOOLEAN;
  v_new_debut       DATE;
  v_new_fin         DATE;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE unitech_reference = p_unitech_reference AND status = 'pending';

  IF NOT FOUND THEN
    RETURN json_build_object('handled', false, 'reason', 'no_pending_subscription_for_reference');
  END IF;

  IF p_status NOT IN ('success', 'approved', 'completed', 'paid') THEN
    UPDATE public.subscriptions SET status = 'revoked', updated_at = NOW() WHERE id = v_sub.id;
    RETURN json_build_object('handled', true, 'subscription_id', v_sub.id, 'status', 'revoked');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE gerant_id = v_sub.gerant_id AND plan_id <> 'free' AND status IN ('active', 'expired')
  ) INTO v_had_paid_before;

  SELECT * INTO v_prev_active FROM public.subscriptions
  WHERE gerant_id = v_sub.gerant_id AND status = 'active' AND id <> v_sub.id;

  IF FOUND AND v_prev_active.date_fin IS NOT NULL AND v_prev_active.date_fin > CURRENT_DATE THEN
    v_new_debut := v_prev_active.date_fin;
  ELSE
    v_new_debut := CURRENT_DATE;
  END IF;

  v_new_fin := CASE v_sub.cycle
    WHEN 'annuel' THEN v_new_debut + 365
    ELSE v_new_debut + 30
  END;

  UPDATE public.subscriptions SET status = 'expired', updated_at = NOW()
  WHERE gerant_id = v_sub.gerant_id AND status = 'active' AND id <> v_sub.id;

  UPDATE public.subscriptions
  SET status = 'active',
      date_debut = v_new_debut,
      date_fin = v_new_fin,
      -- Ne remplace le numéro que si le webhook en fournit un (le payload
      -- réel UnitechPay n'en contient pas) : sinon on garde celui déjà
      -- enregistré à la création du paiement (create_pending_subscription).
      phone_number = COALESCE(p_phone_number, phone_number),
      essai_utilise = essai_utilise OR NOT v_had_paid_before,
      updated_at = NOW()
  WHERE id = v_sub.id;

  RETURN json_build_object(
    'handled', true, 'subscription_id', v_sub.id, 'status', 'active',
    'date_debut', v_new_debut, 'date_fin', v_new_fin
  );
END;
$$;
