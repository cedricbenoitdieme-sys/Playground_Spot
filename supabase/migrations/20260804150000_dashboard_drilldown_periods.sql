-- ============================================================
-- Dashboard admin : sélecteurs de période sur MRR/ARR (historique réel),
-- Funnel (cohorte par période d'inscription), Churn, Occupation, et
-- nouvelle tendance de volume de réservations.
-- ============================================================
-- Toutes les fonctions ci-dessous restent rétrocompatibles : appelées
-- sans argument, elles reproduisent EXACTEMENT le comportement actuel
-- (aucune régression pour le dashboard existant tant que le frontend
-- n'est pas mis à jour pour passer un p_preset).
-- ============================================================

-- Les 3 fonctions ci-dessous existaient jusqu'ici en version 0-argument
-- (admin_get_revenue_kpis(), admin_get_ltv_funnel(), admin_get_churn_rate()).
-- Changer leur nombre de paramètres créerait un nouvel overload Postgres
-- en laissant l'ancienne version 0-argument orpheline (toujours callable,
-- toujours GRANTée) à côté de la nouvelle — on les DROP explicitement
-- avant de les recréer avec la nouvelle signature.
DROP FUNCTION IF EXISTS public.admin_get_revenue_kpis();
DROP FUNCTION IF EXISTS public.admin_get_ltv_funnel();
DROP FUNCTION IF EXISTS public.admin_get_churn_rate();

-- ------------------------------------------------------------
-- 1) MRR/ARR historique réel à une date donnée ("as of")
-- ------------------------------------------------------------
-- Sans argument : comportement identique à avant (MRR "maintenant",
-- basé sur status = 'active', la source la plus fiable pour l'instant
-- présent).
-- Avec p_preset/p_date_debut : calcule le MRR/ARR/par_plan tels qu'ils
-- étaient à la date de DÉBUT de la période résolue (ex. preset '3m' =
-- "il y a 3 mois"), en reconstituant les abonnements actifs à cette
-- date via date_debut/date_fin (limite documentée : si un abonnement a
-- été suspendu/révoqué manuellement avant sa date_fin naturelle sans
-- que date_fin ait été mise à jour en conséquence, il sera compté à
-- tort comme actif jusqu'à date_fin — aucun historique de transition de
-- statut n'est conservé pour une reconstruction parfaite).
CREATE OR REPLACE FUNCTION public.admin_get_revenue_kpis(
  p_preset      TEXT DEFAULT NULL,
  p_date_debut  DATE DEFAULT NULL,
  p_date_fin    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_asof     DATE;
  v_is_now   BOOLEAN := (p_preset IS NULL AND p_date_debut IS NULL AND p_date_fin IS NULL);
  v_mrr      NUMERIC;
  v_par_plan JSON;
  v_tendance JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  IF v_is_now THEN
    v_asof := CURRENT_DATE;
  ELSE
    SELECT date_debut INTO v_asof
    FROM public.resolve_period_range(p_preset, p_date_debut, p_date_fin, NULL);
  END IF;

  IF v_is_now THEN
    -- MRR "maintenant" : source de vérité = status actuel (comportement historique inchangé).
    SELECT COALESCE(SUM(
      CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel / 12.0 ELSE pl.prix_mensuel END
    ), 0)
    INTO v_mrr
    FROM public.subscriptions s
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE s.status = 'active';

    SELECT COALESCE(json_agg(json_build_object(
      'plan_id', plan_id, 'plan_nom', plan_nom, 'nb_abonnes', nb, 'mrr_contribue', ROUND(mrr_plan)
    ) ORDER BY mrr_plan DESC), '[]'::json)
    INTO v_par_plan
    FROM (
      SELECT pl.plan_id, pl.nom AS plan_nom, COUNT(*) AS nb,
        SUM(CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel / 12.0 ELSE pl.prix_mensuel END) AS mrr_plan
      FROM public.subscriptions s
      JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
      WHERE s.status = 'active'
      GROUP BY pl.plan_id, pl.nom
    ) par_plan;
  ELSE
    -- MRR "à la date v_asof" : reconstruction approximative via date_debut/date_fin
    -- (voir limite documentée en tête de fonction).
    SELECT COALESCE(SUM(
      CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel / 12.0 ELSE pl.prix_mensuel END
    ), 0)
    INTO v_mrr
    FROM public.subscriptions s
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE s.plan_id <> 'free'
      AND s.status IN ('active', 'expired', 'suspended')
      AND s.date_debut IS NOT NULL AND s.date_debut <= v_asof
      AND (s.date_fin IS NULL OR s.date_fin >= v_asof);

    SELECT COALESCE(json_agg(json_build_object(
      'plan_id', plan_id, 'plan_nom', plan_nom, 'nb_abonnes', nb, 'mrr_contribue', ROUND(mrr_plan)
    ) ORDER BY mrr_plan DESC), '[]'::json)
    INTO v_par_plan
    FROM (
      SELECT pl.plan_id, pl.nom AS plan_nom, COUNT(*) AS nb,
        SUM(CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel / 12.0 ELSE pl.prix_mensuel END) AS mrr_plan
      FROM public.subscriptions s
      JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
      WHERE s.plan_id <> 'free'
        AND s.status IN ('active', 'expired', 'suspended')
        AND s.date_debut IS NOT NULL AND s.date_debut <= v_asof
        AND (s.date_fin IS NULL OR s.date_fin >= v_asof)
      GROUP BY pl.plan_id, pl.nom
    ) par_plan;
  END IF;

  -- Tendance 12 mois : inchangée, fenêtre fixe (voir admin_get_mrr_trend()
  -- pour une version à fenêtre ajustable, dédiée au graphique "Évolution du MRR").
  SELECT COALESCE(json_agg(json_build_object('mois', mois, 'nouveau_mrr', ROUND(nouveau_mrr)) ORDER BY mois), '[]'::json)
  INTO v_tendance
  FROM (
    SELECT date_trunc('month', s.date_debut)::date AS mois,
      SUM(CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel / 12.0 ELSE pl.prix_mensuel END) AS nouveau_mrr
    FROM public.subscriptions s
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE s.date_debut >= (CURRENT_DATE - INTERVAL '12 months')
      AND s.date_debut IS NOT NULL
      AND s.plan_id <> 'free'
    GROUP BY 1
  ) tendance;

  RETURN json_build_object(
    'mrr', ROUND(v_mrr),
    'arr', ROUND(v_mrr * 12),
    'par_plan', v_par_plan,
    'tendance_12_mois', v_tendance,
    'as_of_date', v_asof,
    'is_now', v_is_now
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_revenue_kpis IS
  'MRR/ARR/répartition par plan, "maintenant" (status=active) si appelée sans argument, ou reconstitués à une date passée (date_debut de la période résolue) via date_debut/date_fin des abonnements si un préréglage/période est fourni. tendance_12_mois reste une fenêtre fixe de 12 mois (voir admin_get_mrr_trend pour une fenêtre ajustable).';

REVOKE ALL ON FUNCTION public.admin_get_revenue_kpis(TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_revenue_kpis(TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 2) Tendance MRR à fenêtre ajustable (dédiée au graphique "Évolution
--    du MRR"), séparée de admin_get_revenue_kpis pour ne pas recalculer
--    mrr/arr/par_plan à chaque changement de fenêtre du graphique.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_mrr_trend(
  p_preset TEXT DEFAULT '1y'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut  DATE;
  v_fin    DATE;
  v_result JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT date_debut, date_fin INTO v_debut, v_fin
  FROM public.resolve_period_range(COALESCE(p_preset, '1y'), NULL, NULL, NULL);

  SELECT COALESCE(json_agg(json_build_object('mois', mois, 'nouveau_mrr', ROUND(nouveau_mrr)) ORDER BY mois), '[]'::json)
  INTO v_result
  FROM (
    SELECT date_trunc('month', s.date_debut)::date AS mois,
      SUM(CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel / 12.0 ELSE pl.prix_mensuel END) AS nouveau_mrr
    FROM public.subscriptions s
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE s.date_debut BETWEEN v_debut AND v_fin
      AND s.plan_id <> 'free'
    GROUP BY 1
  ) tendance;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_mrr_trend IS
  'Nouveau MRR démarré par mois sur la fenêtre résolue par resolve_period_range(p_preset) — préréglage libre (24h..all), défaut 1y. Dédiée au graphique "Évolution du MRR" avec sélecteur de période propre.';

REVOKE ALL ON FUNCTION public.admin_get_mrr_trend(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_mrr_trend(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3) Funnel d'activation + LTV, par cohorte d'inscription (période)
-- ------------------------------------------------------------
-- Sans argument : comportement identique à avant (tous les gérants,
-- tout historique confondu).
-- Avec p_preset/p_date_debut/p_date_fin : ne considère que les gérants
-- dont profiles.created_at tombe dans la période résolue (cohorte).
CREATE OR REPLACE FUNCTION public.admin_get_ltv_funnel(
  p_preset      TEXT DEFAULT NULL,
  p_date_debut  DATE DEFAULT NULL,
  p_date_fin    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut  DATE;
  v_fin    DATE;
  v_ltv    NUMERIC;
  v_funnel JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  IF p_preset IS NULL AND p_date_debut IS NULL AND p_date_fin IS NULL THEN
    v_debut := NULL; -- pas de filtre de cohorte : tout historique
    v_fin   := NULL;
  ELSE
    SELECT date_debut, date_fin INTO v_debut, v_fin
    FROM public.resolve_period_range(p_preset, p_date_debut, p_date_fin, NULL);
  END IF;

  WITH gerants AS (
    SELECT id FROM public.profiles
    WHERE role = 'gerant'
      AND (v_debut IS NULL OR created_at::date BETWEEN v_debut AND v_fin)
  ),
  avec_terrain AS (
    SELECT DISTINCT gerant_id AS id FROM public.terrains
    WHERE gerant_id IN (SELECT id FROM gerants)
  ),
  avec_terrain_approuve AS (
    SELECT DISTINCT gerant_id AS id FROM public.terrains
    WHERE status = 'approved' AND gerant_id IN (SELECT id FROM gerants)
  ),
  avec_reservation AS (
    SELECT DISTINCT t.gerant_id AS id
    FROM public.reservations r JOIN public.terrains t ON t.id = r.terrain_id
    WHERE t.gerant_id IN (SELECT id FROM gerants)
  ),
  avec_plan_payant AS (
    SELECT DISTINCT gerant_id AS id FROM public.subscriptions
    WHERE plan_id <> 'free' AND status = 'active' AND gerant_id IN (SELECT id FROM gerants)
  )
  SELECT json_build_object(
    'total_gerants', (SELECT COUNT(*) FROM gerants),
    'avec_terrain', (SELECT COUNT(*) FROM avec_terrain),
    'avec_terrain_approuve', (SELECT COUNT(*) FROM avec_terrain_approuve),
    'avec_reservation', (SELECT COUNT(*) FROM avec_reservation),
    'avec_plan_payant', (SELECT COUNT(*) FROM avec_plan_payant)
  ) INTO v_funnel;

  SELECT COALESCE(AVG(revenu_gerant), 0) INTO v_ltv
  FROM (
    SELECT s.gerant_id,
      SUM(CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel ELSE pl.prix_mensuel END) AS revenu_gerant
    FROM public.subscriptions s
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE s.plan_id <> 'free'
      AND s.status IN ('active', 'expired', 'suspended')
      AND (v_debut IS NULL OR s.gerant_id IN (SELECT id FROM gerants))
    GROUP BY s.gerant_id
  ) rev;

  RETURN json_build_object('ltv_moyen', ROUND(v_ltv), 'funnel', v_funnel, 'periode_debut', v_debut, 'periode_fin', v_fin);
END;
$$;

COMMENT ON FUNCTION public.admin_get_ltv_funnel IS
  'Funnel d''activation gérants et LTV moyen. Sans argument : tout historique confondu (comportement historique). Avec préréglage/période : limité à la cohorte de gérants inscrits (profiles.created_at) dans cette fenêtre.';

REVOKE ALL ON FUNCTION public.admin_get_ltv_funnel(TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ltv_funnel(TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 4) Taux de churn — fenêtre ajustable via resolve_period_range()
-- ------------------------------------------------------------
-- Sans argument : comportement identique à avant (30 derniers jours).
CREATE OR REPLACE FUNCTION public.admin_get_churn_rate(
  p_preset      TEXT DEFAULT '31d',
  p_date_debut  DATE DEFAULT NULL,
  p_date_fin    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut   DATE;
  v_fin     DATE;
  v_perdus  INTEGER;
  v_actifs  INTEGER;
  v_base    INTEGER;
  v_taux    NUMERIC;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT date_debut, date_fin INTO v_debut, v_fin
  FROM public.resolve_period_range(COALESCE(p_preset, '31d'), p_date_debut, p_date_fin, NULL);

  SELECT COUNT(DISTINCT s.gerant_id) INTO v_perdus
  FROM public.subscriptions s
  WHERE s.plan_id <> 'free'
    AND s.status IN ('expired', 'suspended', 'revoked')
    AND s.updated_at::date BETWEEN v_debut AND v_fin
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s2
      WHERE s2.gerant_id = s.gerant_id AND s2.plan_id <> 'free' AND s2.status = 'active'
    );

  SELECT COUNT(DISTINCT gerant_id) INTO v_actifs
  FROM public.subscriptions
  WHERE plan_id <> 'free' AND status = 'active';

  v_base := v_actifs + v_perdus;
  v_taux := CASE WHEN v_base > 0 THEN ROUND(v_perdus::NUMERIC / v_base * 100, 1) ELSE 0 END;

  RETURN json_build_object(
    'taux_churn_pct', v_taux,
    'abonnes_payants_actuels', v_actifs,
    'perdus_periode', v_perdus,
    'periode_debut', v_debut,
    'periode_fin', v_fin
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_churn_rate IS
  'Taux de churn sur la fenêtre résolue par resolve_period_range (défaut 31d, remplace l''ancien 30j fixe). Gérants dont un abonnement payant a expiré/suspendu/révoqué sur la période, sans nouvel abonnement payant actif.';

REVOKE ALL ON FUNCTION public.admin_get_churn_rate(TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_churn_rate(TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 5) Taux d'occupation — fenêtre ajustable (extrait de get_admin_dashboard_stats)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_occupation_rate(
  p_preset      TEXT DEFAULT '31d',
  p_date_debut  DATE DEFAULT NULL,
  p_date_fin    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut DATE;
  v_fin   DATE;
  v_taux  NUMERIC;
  v_total_creneaux BIGINT;
  v_reserves BIGINT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT date_debut, date_fin INTO v_debut, v_fin
  FROM public.resolve_period_range(COALESCE(p_preset, '31d'), p_date_debut, p_date_fin, NULL);

  SELECT COUNT(c.id), COUNT(r.id)
  INTO v_total_creneaux, v_reserves
  FROM public.creneaux c
  LEFT JOIN public.reservations r ON r.creneau_id = c.id AND r.statut IN ('confirmee', 'terminee')
  WHERE c.date BETWEEN v_debut AND v_fin;

  v_taux := CASE WHEN v_total_creneaux = 0 THEN 0 ELSE ROUND(v_reserves::NUMERIC / v_total_creneaux * 100, 1) END;

  RETURN json_build_object(
    'taux_occupation_pct', v_taux,
    'creneaux_total', v_total_creneaux,
    'creneaux_reserves', v_reserves,
    'periode_debut', v_debut,
    'periode_fin', v_fin
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_occupation_rate IS
  'Taux d''occupation des créneaux sur la fenêtre résolue par resolve_period_range (défaut 31d, équivalent du calcul fixe 30j déjà présent dans get_admin_dashboard_stats).';

REVOKE ALL ON FUNCTION public.admin_get_occupation_rate(TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_occupation_rate(TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 6) Volume de réservations dans le temps — nouvelle tendance ajustable
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_reservations_trend(
  p_preset TEXT DEFAULT '31d'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut  DATE;
  v_fin    DATE;
  v_result JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT date_debut, date_fin INTO v_debut, v_fin
  FROM public.resolve_period_range(COALESCE(p_preset, '31d'), NULL, NULL, NULL);

  SELECT COALESCE(json_agg(json_build_object(
    'jour', d.jour, 'nb_reservations', COALESCE(x.nb, 0), 'montant', COALESCE(x.montant, 0)
  ) ORDER BY d.jour), '[]'::json)
  INTO v_result
  FROM generate_series(v_debut, v_fin, INTERVAL '1 day') AS d(jour)
  LEFT JOIN (
    SELECT r.date_slot AS jour, COUNT(*) AS nb,
      SUM(r.montant) FILTER (WHERE r.statut IN ('confirmee', 'terminee')) AS montant
    FROM public.reservations r
    WHERE r.date_slot BETWEEN v_debut AND v_fin
    GROUP BY r.date_slot
  ) x ON x.jour = d.jour::date;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_reservations_trend IS
  'Volume de réservations (nombre + montant) par jour sur la fenêtre résolue par resolve_period_range(p_preset). Remplace la comparaison figée Jour/Semaine/Mois par une série ajustable.';

REVOKE ALL ON FUNCTION public.admin_get_reservations_trend(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_reservations_trend(TEXT) TO authenticated;

-- ============================================================
-- Vérification post-migration (en session super_admin) :
-- SELECT public.admin_get_revenue_kpis(); -- MRR "maintenant", inchangé
-- SELECT public.admin_get_revenue_kpis('3m'); -- MRR il y a 3 mois
-- SELECT public.admin_get_mrr_trend('6m');
-- SELECT public.admin_get_ltv_funnel(); -- tout historique, inchangé
-- SELECT public.admin_get_ltv_funnel('7d'); -- cohorte 7 derniers jours
-- SELECT public.admin_get_churn_rate(); -- 31j par défaut
-- SELECT public.admin_get_occupation_rate('7d');
-- SELECT public.admin_get_reservations_trend('14d');
-- ============================================================
