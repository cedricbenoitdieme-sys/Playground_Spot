-- ============================================================
-- Migration : ajustements suite au contrat d'intégration UnitechPay
-- final (alignement sur le schéma Sama Boutik) :
--   1. expires_at en jours FIXES (30 / 365), pas en mois/année calendaires
--      (évite les écarts de durée selon le mois de souscription).
--   2. activate_free_plan() : le plan Free s'active directement, sans
--      passer par create_pending_subscription/UnitechPay (0 FCFA = pas de
--      paiement). Utile pour un gérant qui rétrograde vers Free depuis un
--      plan payant, en plus de l'attribution automatique à l'inscription
--      déjà gérée par handle_new_user().
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
    v_new_debut := v_prev_active.date_fin; -- prolonge un abonnement actif existant
  ELSE
    v_new_debut := CURRENT_DATE;
  END IF;

  -- Durée FIXE : 30 jours (monthly) / 365 jours (annual) — pas de mois/année
  -- calendaire, pour un décompte prévisible quel que soit le mois de départ.
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
      phone_number = p_phone_number,
      essai_utilise = essai_utilise OR NOT v_had_paid_before,
      updated_at = NOW()
  WHERE id = v_sub.id;

  RETURN json_build_object(
    'handled', true, 'subscription_id', v_sub.id, 'status', 'active',
    'date_debut', v_new_debut, 'date_fin', v_new_fin
  );
END;
$$;

-- Activation directe du plan Free (0 FCFA, aucun paiement). Auth : le
-- gérant lui-même ou un super_admin, comme les autres RPC du module.
CREATE OR REPLACE FUNCTION public.activate_free_plan(p_gerant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_id   UUID;
  v_current_plan TEXT;
  v_new_id       UUID;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_gerant_id AND role = 'gerant') THEN
    RAISE EXCEPTION 'Seuls les gérants ont un abonnement';
  END IF;

  SELECT id, plan_id INTO v_current_id, v_current_plan
  FROM public.subscriptions WHERE gerant_id = p_gerant_id AND status = 'active';

  IF v_current_plan = 'free' THEN
    RETURN json_build_object('subscription_id', v_current_id, 'plan_id', 'free', 'status', 'active', 'already_free', true);
  END IF;

  IF v_current_id IS NOT NULL THEN
    UPDATE public.subscriptions SET status = 'expired', updated_at = NOW() WHERE id = v_current_id;
  END IF;

  INSERT INTO public.subscriptions (gerant_id, plan_id, status, date_debut, date_fin)
  VALUES (p_gerant_id, 'free', 'active', CURRENT_DATE, NULL)
  RETURNING id INTO v_new_id;

  RETURN json_build_object('subscription_id', v_new_id, 'plan_id', 'free', 'status', 'active', 'already_free', false);
END;
$$;
