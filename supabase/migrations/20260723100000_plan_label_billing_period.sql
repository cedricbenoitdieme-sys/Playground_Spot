-- ============================================================
-- Migration : expose billing_period (monthly/annual) en plus de cycle
-- (mensuel/annuel) dans get_user_plan_and_limits(), pour que le badge
-- plan du header front n'ait pas à connaître le vocabulaire interne
-- français — cohérent avec le contrat déjà utilisé par create-payment
-- (billing_period: 'monthly'|'annual'). `cycle` est conservé (additif,
-- rien ne casse pour un appelant existant qui le lit déjà).
-- ============================================================

CREATE OR REPLACE FUNCTION public._plan_limits_internal(p_gerant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'subscription_id', s.id, 'plan_id', pl.plan_id, 'plan_nom', pl.nom,
    'cycle', s.cycle,
    'billing_period', CASE s.cycle WHEN 'annuel' THEN 'annual' WHEN 'mensuel' THEN 'monthly' ELSE NULL END,
    'status', s.status, 'date_debut', s.date_debut, 'date_fin', s.date_fin,
    'max_terrains', pl.max_terrains, 'max_reservations_mois', pl.max_reservations_mois,
    'commission_rate', pl.commission_rate, 'pdf_export', pl.pdf_export,
    'dashboard_avance', pl.dashboard_avance, 'multi_sites', pl.multi_sites
  ) INTO v_result
  FROM public.subscriptions s
  JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
  WHERE s.gerant_id = p_gerant_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_result IS NULL THEN
    SELECT json_build_object(
      'subscription_id', NULL, 'plan_id', pl.plan_id, 'plan_nom', pl.nom,
      'cycle', NULL, 'billing_period', NULL,
      'status', 'active', 'date_debut', NULL, 'date_fin', NULL,
      'max_terrains', pl.max_terrains, 'max_reservations_mois', pl.max_reservations_mois,
      'commission_rate', pl.commission_rate, 'pdf_export', pl.pdf_export,
      'dashboard_avance', pl.dashboard_avance, 'multi_sites', pl.multi_sites
    ) INTO v_result
    FROM public.plan_limits pl WHERE pl.plan_id = 'free';
  END IF;

  RETURN v_result;
END;
$$;
