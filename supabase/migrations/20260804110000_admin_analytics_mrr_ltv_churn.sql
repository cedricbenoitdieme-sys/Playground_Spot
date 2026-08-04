-- ============================================================
-- Migration : 3 nouvelles RPC analytics pour le Dashboard Super Admin
-- (MRR/ARR, LTV + funnel d'activation, taux de churn) + tendance des
-- inscriptions (proxy "trafic/conversion" basé sur nos propres données,
-- en complément d'Amplitude réactivé côté frontend séparément).
--
-- Périmètre volontairement réduit (décision produit 2026-08-04) :
--   - Pas de motifs de résiliation : aucun flux d'auto-annulation
--     n'existe côté gérant, donc pas de donnée à afficher.
--   - Pas de CAC : aucune donnée de coût marketing n'est trackée nulle
--     part dans le SaaS, impossible à calculer honnêtement.
-- ============================================================

-- ── 1. MRR / ARR ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_revenue_kpis()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_mrr      NUMERIC;
  v_par_plan JSON;
  v_tendance JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  -- MRR actuel : abonnements 'active', ramenés à un équivalent mensuel
  -- (annuel / 12). Le plan Free contribue 0 (prix_mensuel = 0).
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

  -- Tendance 12 mois : nouveau MRR démarré chaque mois (pas un solde net
  -- cumulé — on n'a pas d'historique de snapshot MRR jour par jour, donc
  -- on mesure les nouveaux abonnements payants démarrés par mois).
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
    'tendance_12_mois', v_tendance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_revenue_kpis() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_revenue_kpis() TO authenticated;

-- ── 2. LTV + Funnel d'activation ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_ltv_funnel()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_ltv    NUMERIC;
  v_funnel JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  -- LTV moyen : revenu total historique par gérant ayant payé au moins
  -- une fois (statut ayant atteint 'active' au moins une fois : active,
  -- expired ou suspended — 'revoked'/'pending' n'ont jamais été payés
  -- avec succès, voir handle_unitech_webhook/activate_subscription),
  -- moyenné sur l'ensemble de ces gérants.
  SELECT COALESCE(AVG(revenu_gerant), 0) INTO v_ltv
  FROM (
    SELECT s.gerant_id,
      SUM(CASE s.cycle WHEN 'annuel' THEN pl.prix_annuel ELSE pl.prix_mensuel END) AS revenu_gerant
    FROM public.subscriptions s
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE s.plan_id <> 'free'
      AND s.status IN ('active', 'expired', 'suspended')
    GROUP BY s.gerant_id
  ) rev;

  -- Funnel d'activation : Gérant créé -> Terrain créé -> Terrain approuvé
  -- -> Reçoit une réservation -> Passe sur un plan payant.
  WITH gerants AS (
    SELECT id FROM public.profiles WHERE role = 'gerant'
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

  RETURN json_build_object('ltv_moyen', ROUND(v_ltv), 'funnel', v_funnel);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_ltv_funnel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_ltv_funnel() TO authenticated;

-- ── 3. Taux de churn (30 derniers jours) ─────────────────────────
-- Définition retenue (simple et défendable, faute d'un vrai snapshot
-- MRR historique) : parmi les gérants dont un abonnement payant est
-- passé à expired/suspended/revoked dans les 30 derniers jours, combien
-- n'ont PAS de nouvel abonnement payant actif aujourd'hui (= vraiment
-- perdus, pas juste renouvelés/changés de plan). Rapporté à la base
-- "actifs actuels + perdus ce mois" comme dénominateur approximatif du
-- nombre de payants au début de la période.
CREATE OR REPLACE FUNCTION public.admin_get_churn_rate()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_perdus  INTEGER;
  v_actifs  INTEGER;
  v_base    INTEGER;
  v_taux    NUMERIC;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT COUNT(DISTINCT s.gerant_id) INTO v_perdus
  FROM public.subscriptions s
  WHERE s.plan_id <> 'free'
    AND s.status IN ('expired', 'suspended', 'revoked')
    AND s.updated_at >= NOW() - INTERVAL '30 days'
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
    'perdus_30j', v_perdus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_churn_rate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_churn_rate() TO authenticated;

-- ── 4. Tendance des inscriptions (proxy trafic/conversion maison) ──
-- Complète Amplitude (réactivé côté frontend séparément) avec un signal
-- immédiatement disponible sans dépendance externe : nouveaux comptes
-- créés par jour, sur les N derniers jours, par rôle.
CREATE OR REPLACE FUNCTION public.admin_get_signups_trend(p_jours INTEGER DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  IF p_jours IS NULL OR p_jours <= 0 OR p_jours > 365 THEN
    RAISE EXCEPTION 'p_jours doit être compris entre 1 et 365';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'jour', jour, 'joueurs', nb_joueurs, 'gerants', nb_gerants
  ) ORDER BY jour), '[]'::json)
  INTO v_result
  FROM (
    SELECT d.jour,
      COUNT(*) FILTER (WHERE p.role = 'joueur') AS nb_joueurs,
      COUNT(*) FILTER (WHERE p.role = 'gerant') AS nb_gerants
    FROM generate_series((CURRENT_DATE - (p_jours - 1))::date, CURRENT_DATE::date, INTERVAL '1 day') AS d(jour)
    LEFT JOIN public.profiles p ON p.created_at::date = d.jour
    GROUP BY d.jour
  ) x;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_signups_trend(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_signups_trend(INTEGER) TO authenticated;

-- ============================================================
-- Vérification post-migration (en session admin) :
-- SELECT public.admin_get_revenue_kpis();
-- SELECT public.admin_get_ltv_funnel();
-- SELECT public.admin_get_churn_rate();
-- SELECT public.admin_get_signups_trend(30);
-- ============================================================
