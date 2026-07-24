-- ============================================================
-- Migration : essai gratuit (Tâche "get_trial_status") — décisions produit
-- confirmées : plan choisi par le gérant (pas un plan fixe), 14 jours,
-- déclenché par une action explicite du gérant (pas automatique à
-- l'inscription). Un seul essai par gérant, jamais pour un joueur.
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- start_trial(gerant_id, plan_id) — démarre l'essai de 14 jours sur le
-- plan choisi. Un seul essai par compte, jamais si déjà sur un plan payant
-- réel (non-essai).
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_trial(
  p_gerant_id UUID,
  p_plan_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan          public.plan_limits%ROWTYPE;
  v_current_id    UUID;
  v_current_plan  TEXT;
  v_current_trial BOOLEAN;
  v_essai_utilise BOOLEAN;
  v_new_id        UUID;
  v_date_fin      DATE;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_gerant_id AND role = 'gerant') THEN
    RAISE EXCEPTION 'L''essai gratuit est réservé aux gérants';
  END IF;

  SELECT * INTO v_plan FROM public.plan_limits WHERE plan_id = p_plan_id;
  IF NOT FOUND OR p_plan_id = 'free' THEN
    RAISE EXCEPTION 'Plan invalide pour un essai : %', p_plan_id;
  END IF;

  -- Un seul essai gratuit, jamais renouvelable, même sur un plan différent.
  SELECT bool_or(essai_utilise) INTO v_essai_utilise
  FROM public.subscriptions WHERE gerant_id = p_gerant_id;
  IF v_essai_utilise THEN
    RAISE EXCEPTION 'Essai gratuit déjà utilisé pour ce compte';
  END IF;

  SELECT id, plan_id, is_trial INTO v_current_id, v_current_plan, v_current_trial
  FROM public.subscriptions WHERE gerant_id = p_gerant_id AND status = 'active';

  IF v_current_plan IS NOT NULL AND v_current_plan <> 'free' AND NOT COALESCE(v_current_trial, false) THEN
    RAISE EXCEPTION 'Un abonnement payant est déjà actif sur ce compte';
  END IF;

  IF v_current_id IS NOT NULL THEN
    UPDATE public.subscriptions SET status = 'expired', updated_at = NOW() WHERE id = v_current_id;
  END IF;

  v_date_fin := CURRENT_DATE + 14;

  INSERT INTO public.subscriptions (gerant_id, plan_id, status, date_debut, date_fin, is_trial, essai_utilise)
  VALUES (p_gerant_id, p_plan_id, 'active', CURRENT_DATE, v_date_fin, true, true)
  RETURNING id INTO v_new_id;

  RETURN json_build_object(
    'subscription_id', v_new_id, 'plan_id', p_plan_id, 'plan_nom', v_plan.nom,
    'status', 'active', 'is_trial', true, 'date_debut', CURRENT_DATE, 'date_fin', v_date_fin
  );
END;
$$;

-- ============================================================
-- get_trial_status(gerant_id) — statut de l'essai : en cours (avec plan et
-- jours restants), déjà utilisé, ou éligible à en démarrer un. Ne
-- s'applique jamais à un compte joueur (retourne applicable=false plutôt
-- qu'une erreur, pour un usage défensif côté front).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_trial_status(p_gerant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_role          public.role_utilisateur;
  v_sub           public.subscriptions%ROWTYPE;
  v_plan_nom      TEXT;
  v_essai_utilise BOOLEAN;
  v_jours_restants INT;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_gerant_id;
  IF v_role IS NULL OR v_role <> 'gerant' THEN
    RETURN json_build_object('applicable', false);
  END IF;

  SELECT bool_or(essai_utilise) INTO v_essai_utilise
  FROM public.subscriptions WHERE gerant_id = p_gerant_id;
  v_essai_utilise := COALESCE(v_essai_utilise, false);

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE gerant_id = p_gerant_id AND status = 'active' AND is_trial = true;

  IF FOUND THEN
    SELECT nom INTO v_plan_nom FROM public.plan_limits WHERE plan_id = v_sub.plan_id;
    v_jours_restants := GREATEST(v_sub.date_fin - CURRENT_DATE, 0);
    RETURN json_build_object(
      'applicable', true,
      'in_trial', true,
      'expired', v_sub.date_fin < CURRENT_DATE,
      'plan_id', v_sub.plan_id,
      'plan_nom', v_plan_nom,
      'date_debut', v_sub.date_debut,
      'date_fin', v_sub.date_fin,
      'jours_restants', v_jours_restants,
      'essai_utilise', true
    );
  END IF;

  RETURN json_build_object(
    'applicable', true,
    'in_trial', false,
    'expired', false,
    'plan_id', NULL,
    'plan_nom', NULL,
    'date_debut', NULL,
    'date_fin', NULL,
    'jours_restants', NULL,
    'essai_utilise', v_essai_utilise
  );
END;
$$;
