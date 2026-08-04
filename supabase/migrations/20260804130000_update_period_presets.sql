-- ============================================================
-- Élargissement des préréglages de période (resolve_period_range)
-- ============================================================
-- Remplace l'ancien set '24h'/'48h'/'3d'/'1w'/'2w'/'1m'/'3m'/'1y'/'all'
-- par un set plus fin demandé par l'utilisateur :
-- '24h'/'72h'/'7d'/'14d'/'31d'/'45d'/'3m'/'6m'/'1y'/'all'.
--
-- CREATE OR REPLACE sur la même signature que la migration
-- 20260802180000_unified_period_filter.sql : aucune fonction appelante
-- (get_gerant_stats_period, get_admin_dashboard_stats_period) n'a besoin
-- d'être modifiée, elles délèguent déjà entièrement le mapping preset →
-- dates à resolve_period_range().
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_period_range(
  p_preset      TEXT DEFAULT NULL,   -- '24h'|'72h'|'7d'|'14d'|'31d'|'45d'|'3m'|'6m'|'1y'|'all' ; NULL/'custom' = personnalisée
  p_start_date  DATE DEFAULT NULL,
  p_end_date    DATE DEFAULT NULL,
  p_floor_date  DATE DEFAULT NULL    -- borne inférieure utilisée pour 'all' (ex: date de création du compte gérant)
)
RETURNS TABLE(date_debut DATE, date_fin DATE)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_preset IS NULL OR p_preset = 'custom' THEN
    IF p_start_date IS NULL OR p_end_date IS NULL THEN
      RAISE EXCEPTION 'p_start_date et p_end_date sont requis pour une période personnalisée';
    END IF;
    IF p_start_date > p_end_date THEN
      RAISE EXCEPTION 'p_start_date doit être antérieure ou égale à p_end_date';
    END IF;
    RETURN QUERY SELECT p_start_date, p_end_date;
    RETURN;
  END IF;

  IF p_preset NOT IN ('24h', '72h', '7d', '14d', '31d', '45d', '3m', '6m', '1y', 'all') THEN
    RAISE EXCEPTION 'Préréglage de période inconnu : %', p_preset;
  END IF;

  RETURN QUERY SELECT
    (CASE p_preset
      WHEN '24h'  THEN CURRENT_DATE - INTERVAL '1 day'
      WHEN '72h'  THEN CURRENT_DATE - INTERVAL '3 days'
      WHEN '7d'   THEN CURRENT_DATE - INTERVAL '7 days'
      WHEN '14d'  THEN CURRENT_DATE - INTERVAL '14 days'
      WHEN '31d'  THEN CURRENT_DATE - INTERVAL '31 days'
      WHEN '45d'  THEN CURRENT_DATE - INTERVAL '45 days'
      WHEN '3m'   THEN CURRENT_DATE - INTERVAL '3 months'
      WHEN '6m'   THEN CURRENT_DATE - INTERVAL '6 months'
      WHEN '1y'   THEN CURRENT_DATE - INTERVAL '1 year'
      WHEN 'all'  THEN COALESCE(p_floor_date, DATE '2020-01-01')
    END)::DATE,
    CURRENT_DATE;
END;
$$;

COMMENT ON FUNCTION public.resolve_period_range IS
  'Résout un préréglage de période (24h/72h/7d/14d/31d/45d/3m/6m/1y/all) ou une plage personnalisée en bornes de dates [date_debut, date_fin]. Fonction partagée à réutiliser par toute RPC de stats/revenus.';
