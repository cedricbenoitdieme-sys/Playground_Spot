-- ============================================================
-- CORRECTIF DE SÉCURITÉ URGENT — contournement d'autorisation par appel
-- anonyme, confirmé en prod sur public.update_terrain_location.
--
-- Bug : `IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
-- RAISE EXCEPTION ...` — en SQL, `<>` avec un NULL renvoie NULL, jamais
-- TRUE/FALSE. Pour un appel SANS session (anon, `auth.uid()` = NULL),
-- `p_gerant_id <> NULL` = NULL, donc `NULL AND ...` = NULL, et en
-- PL/pgSQL `IF NULL THEN` NE DÉCLENCHE PAS le RAISE EXCEPTION (NULL n'est
-- ni vrai ni faux) — le garde-fou est silencieusement contourné.
--
-- C'est exactement le même piège que celui déjà documenté et corrigé pour
-- `is_super_admin()` (migration 20260721120000, COALESCE(..., false)) —
-- mais il n'avait pas été appliqué à ce second pattern `<> auth.uid()`,
-- copié-collé dans 10 fonctions SECURITY DEFINER avant d'être réintroduit
-- une 11e fois dans update_terrain_location (migration 20260725150000).
--
-- Preuve du contournement (session anonyme, clé anon, aucun Authorization
-- Bearer valide) :
--   POST .../rpc/update_terrain_location {"p_terrain_id": "...", "p_lat":
--   14.72, "p_lng": -17.47} → 200 OK, position modifiée. Aucune exception
--   levée alors qu'aucun appelant authentifié n'était présent.
--
-- Correctif : remplacer chaque `<> auth.uid()` par `IS DISTINCT FROM
-- auth.uid()`, l'opérateur SQL conçu pour ce cas — jamais NULL, toujours
-- TRUE/FALSE, y compris quand l'un des deux côtés est NULL
-- (`x IS DISTINCT FROM NULL` = TRUE si x n'est pas NULL, FALSE si x est
-- NULL). Aucun autre changement de comportement.
--
-- 11 fonctions corrigées ci-dessous (CREATE OR REPLACE, signature
-- inchangée — les GRANT existants sont conservés automatiquement) :
--   get_user_plan_and_limits, check_quota, create_pending_subscription,
--   get_boost_stats, activate_free_plan, start_trial, get_trial_status,
--   get_gerant_terrains, set_principal_photo, create_pending_boost,
--   update_terrain_location.
-- ============================================================

-- ── 1. get_user_plan_and_limits (20260722150000) ───────────────────────
CREATE OR REPLACE FUNCTION public.get_user_plan_and_limits(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN public._plan_limits_internal(p_user_id);
END;
$$;

-- ── 2. check_quota (20260722150000) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_quota(p_user_id UUID, p_quota_type TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_limit INT;
  v_used  INT;
  v_plan  JSON;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_quota_type NOT IN ('terrains', 'reservations') THEN
    RAISE EXCEPTION 'Type de quota invalide : % (attendu terrains ou reservations)', p_quota_type;
  END IF;

  v_plan := public._plan_limits_internal(p_user_id);

  IF p_quota_type = 'terrains' THEN
    v_limit := (v_plan->>'max_terrains')::INT;
    SELECT COUNT(*) INTO v_used FROM public.terrains WHERE gerant_id = p_user_id;
  ELSE
    v_limit := (v_plan->>'max_reservations_mois')::INT;
    SELECT COUNT(*) INTO v_used
    FROM public.reservations r
    JOIN public.terrains t ON t.id = r.terrain_id
    WHERE t.gerant_id = p_user_id
      AND r.statut IN ('en_attente', 'confirmee', 'terminee')
      AND r.date_slot >= date_trunc('month', CURRENT_DATE)::DATE;
  END IF;

  RETURN json_build_object(
    'quota_type', p_quota_type,
    'limite', v_limit,
    'utilise', v_used,
    'illimite', v_limit IS NULL,
    'quota_atteint', v_limit IS NOT NULL AND v_used >= v_limit
  );
END;
$$;

-- ── 3. create_pending_subscription (20260722150000) ─────────────────────
CREATE OR REPLACE FUNCTION public.create_pending_subscription(
  p_gerant_id UUID,
  p_plan_id TEXT,
  p_cycle public.cycle_facturation,
  p_phone_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan public.plan_limits%ROWTYPE;
  v_montant INTEGER;
  v_ref TEXT;
  v_id UUID;
BEGIN
  IF p_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_gerant_id AND role = 'gerant') THEN
    RAISE EXCEPTION 'Seuls les gérants peuvent souscrire à un abonnement';
  END IF;

  SELECT * INTO v_plan FROM public.plan_limits WHERE plan_id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan inconnu : %', p_plan_id;
  END IF;

  IF p_plan_id = 'free' THEN
    RAISE EXCEPTION 'Le plan Free ne nécessite aucun paiement';
  END IF;

  IF p_cycle IS NULL THEN
    RAISE EXCEPTION 'Cycle (mensuel/annuel) requis pour un plan payant';
  END IF;

  IF p_cycle = 'annuel' AND v_plan.prix_annuel IS NULL THEN
    RAISE EXCEPTION 'Le plan % ne propose pas de cycle annuel', p_plan_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE gerant_id = p_gerant_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Une souscription est déjà en attente de paiement pour ce gérant';
  END IF;

  v_montant := CASE p_cycle WHEN 'annuel' THEN v_plan.prix_annuel ELSE v_plan.prix_mensuel END;
  v_ref := 'SUB-' || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.subscriptions (gerant_id, plan_id, cycle, status, unitech_reference, phone_number)
  VALUES (p_gerant_id, p_plan_id, p_cycle, 'pending', v_ref, p_phone_number)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'subscription_id', v_id, 'unitech_reference', v_ref,
    'montant', v_montant, 'plan_id', p_plan_id, 'cycle', p_cycle
  );
END;
$$;

-- ── 4. get_boost_stats (version courante : 20260724150000) ─────────────
CREATE OR REPLACE FUNCTION public.get_boost_stats(p_boost_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_boost         public.visibility_boosts%ROWTYPE;
  v_terrain_nom   TEXT;
  v_jours_ecoules INT;
  v_jours_totaux  INT;
BEGIN
  SELECT * INTO v_boost FROM public.visibility_boosts WHERE id = p_boost_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boost introuvable';
  END IF;

  IF v_boost.gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT nom INTO v_terrain_nom FROM public.terrains WHERE id = v_boost.terrain_id;
  v_jours_totaux := CASE WHEN v_boost.date_debut IS NOT NULL AND v_boost.date_fin IS NOT NULL
                     THEN v_boost.date_fin - v_boost.date_debut ELSE NULL END;
  v_jours_ecoules := CASE WHEN v_boost.date_debut IS NOT NULL
                     THEN LEAST(GREATEST(CURRENT_DATE - v_boost.date_debut, 0), COALESCE(v_jours_totaux, 0))
                     ELSE NULL END;

  RETURN json_build_object(
    'boost_id', v_boost.id,
    'terrain_id', v_boost.terrain_id,
    'terrain_nom', v_terrain_nom,
    'budget_alloue', v_boost.budget_alloue,
    'duree_jours', v_boost.duree_jours,
    'date_debut', v_boost.date_debut,
    'date_fin', v_boost.date_fin,
    'statut', v_boost.statut,
    'is_currently_active', v_boost.statut = 'actif' AND v_boost.date_fin IS NOT NULL AND v_boost.date_fin >= CURRENT_DATE,
    'vues_generees', v_boost.vues_generees,
    'jours_ecoules', v_jours_ecoules,
    'jours_totaux', v_jours_totaux,
    'cout_par_vue', CASE WHEN v_boost.vues_generees > 0
                      THEN ROUND(v_boost.budget_alloue::NUMERIC / v_boost.vues_generees, 2)
                      ELSE NULL END
  );
END;
$$;

-- ── 5. activate_free_plan (20260722160000) ──────────────────────────────
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
  IF p_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
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

-- ── 6. start_trial (20260723110000) ─────────────────────────────────────
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
  IF p_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_gerant_id AND role = 'gerant') THEN
    RAISE EXCEPTION 'L''essai gratuit est réservé aux gérants';
  END IF;

  SELECT * INTO v_plan FROM public.plan_limits WHERE plan_id = p_plan_id;
  IF NOT FOUND OR p_plan_id = 'free' THEN
    RAISE EXCEPTION 'Plan invalide pour un essai : %', p_plan_id;
  END IF;

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

-- ── 7. get_trial_status (20260723110000) ────────────────────────────────
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
  IF p_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
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

-- ── 8. get_gerant_terrains (20260724110000) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_gerant_terrains(p_gerant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF p_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT json_build_object('gerant_id', v.gerant_id, 'terrain_count', v.terrain_count, 'terrains', v.terrains)
  INTO v_result
  FROM public.v_gerant_terrains v
  WHERE v.gerant_id = p_gerant_id;

  RETURN COALESCE(v_result, json_build_object('gerant_id', p_gerant_id, 'terrain_count', 0, 'terrains', '[]'::json));
END;
$$;

-- ── 9. set_principal_photo (20260723130000) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_principal_photo(p_photo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terrain_id UUID;
  v_gerant_id  UUID;
BEGIN
  SELECT tp.terrain_id, t.gerant_id INTO v_terrain_id, v_gerant_id
  FROM public.terrain_photos tp JOIN public.terrains t ON t.id = tp.terrain_id
  WHERE tp.id = p_photo_id;

  IF v_terrain_id IS NULL THEN
    RAISE EXCEPTION 'Photo introuvable';
  END IF;

  IF v_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.terrain_photos SET is_principale = false WHERE terrain_id = v_terrain_id AND is_principale = true;
  UPDATE public.terrain_photos SET is_principale = true WHERE id = p_photo_id;
END;
$$;

-- ── 10. create_pending_boost (20260724150000) ───────────────────────────
CREATE OR REPLACE FUNCTION public.create_pending_boost(
  p_gerant_id UUID,
  p_terrain_id UUID,
  p_montant INTEGER,
  p_duree_jours INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id TEXT;
  v_ref     TEXT;
  v_id      UUID;
BEGIN
  IF p_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_montant IS NULL OR p_montant < 500 THEN
    RAISE EXCEPTION 'Le budget alloué doit être d''au moins 500 FCFA';
  END IF;
  IF p_duree_jours IS NULL OR p_duree_jours <= 0 OR p_duree_jours > 90 THEN
    RAISE EXCEPTION 'La durée doit être comprise entre 1 et 90 jours';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.terrains WHERE id = p_terrain_id AND gerant_id = p_gerant_id) THEN
    RAISE EXCEPTION 'Ce terrain n''appartient pas à ce gérant';
  END IF;

  v_plan_id := (public._plan_limits_internal(p_gerant_id))->>'plan_id';
  IF v_plan_id = 'free' THEN
    RAISE EXCEPTION 'Le boost de visibilité est réservé aux plans payants (Starter, Pro, Entreprise)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.visibility_boosts
    WHERE terrain_id = p_terrain_id AND statut IN ('en_attente', 'actif')
  ) THEN
    RAISE EXCEPTION 'Un boost est déjà en attente ou actif pour ce terrain';
  END IF;

  v_ref := 'BOOST-' || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.visibility_boosts
    (gerant_id, terrain_id, budget_alloue, duree_jours, statut, unitech_reference)
  VALUES
    (p_gerant_id, p_terrain_id, p_montant, p_duree_jours, 'en_attente', v_ref)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'boost_id', v_id, 'unitech_reference', v_ref,
    'montant', p_montant, 'terrain_id', p_terrain_id, 'duree_jours', p_duree_jours
  );
END;
$$;

-- ── 11. update_terrain_location (20260725150000) — celle qui a servi à
-- confirmer le bug par test réel ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_terrain_location(
  p_terrain_id UUID,
  p_lat NUMERIC,
  p_lng NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gerant_id UUID;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Latitude et longitude requises';
  END IF;
  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'Coordonnées hors des bornes valides (lat -90..90, lng -180..180)';
  END IF;

  SELECT gerant_id INTO v_gerant_id FROM public.terrains WHERE id = p_terrain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  IF v_gerant_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.terrains SET lat = p_lat, lng = p_lng WHERE id = p_terrain_id;

  RETURN json_build_object('terrain_id', p_terrain_id, 'lat', p_lat, 'lng', p_lng);
END;
$$;

-- ============================================================
-- Vérification post-migration — en session ANONYME (clé anon, PAS de
-- Bearer token, ou un Bearer invalide), chacun des appels suivants doit
-- désormais lever une erreur (401/403 selon le canal), jamais réussir :
--
-- SELECT public.update_terrain_location('<terrain_id_existant>', 14.72, -17.47);
-- SELECT public.get_user_plan_and_limits('<user_id_existant>');
-- SELECT public.check_quota('<user_id_existant>', 'terrains');
-- SELECT public.get_gerant_terrains('<gerant_id_existant>');
-- SELECT public.get_trial_status('<gerant_id_existant>');
-- SELECT public.create_pending_subscription('<gerant_id_existant>', 'pro', 'mensuel', '771234567');
-- SELECT public.activate_free_plan('<gerant_id_existant>');
-- SELECT public.start_trial('<gerant_id_existant>', 'pro');
-- SELECT public.create_pending_boost('<gerant_id_existant>', '<terrain_id>', 5000, 7);
-- SELECT public.set_principal_photo('<photo_id_existante>');
-- SELECT public.get_boost_stats('<boost_id_existant>');
-- -> ERROR: Accès refusé (ou équivalent), dans TOUS les cas.
-- ============================================================
