-- ============================================================
-- Filtre temporel unifié (préréglages + période personnalisée)
-- ============================================================
-- 1) public.resolve_period_range()  : fonction partagée de calcul de plage
--    de dates, réutilisable par toute RPC ayant besoin d'un filtre période.
-- 2) public.get_gerant_stats_period(): remplace l'agrégation cliente de
--    src/services/stats.js (fetchGerantKpis / fetchRevenusParJour /
--    fetchReservationsParCreneau / fetchTopJoueurs) par un seul aller-retour
--    serveur, avec support des préréglages 24h/48h/3d/1w/2w/1m/3m/1y/all
--    et d'une période personnalisée { start_date, end_date }.
-- 3) Index de performance pour les requêtes "1y" / "all".
--
-- N'affecte aucun endpoint existant : ce sont des fonctions additives.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Résolveur de plage de dates partagé
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_period_range(
  p_preset      TEXT DEFAULT NULL,   -- '24h'|'48h'|'3d'|'1w'|'2w'|'1m'|'3m'|'1y'|'all' ; NULL/'custom' = personnalisée
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

  IF p_preset NOT IN ('24h', '48h', '3d', '1w', '2w', '1m', '3m', '1y', 'all') THEN
    RAISE EXCEPTION 'Préréglage de période inconnu : %', p_preset;
  END IF;

  RETURN QUERY SELECT
    (CASE p_preset
      WHEN '24h'  THEN CURRENT_DATE - INTERVAL '1 day'
      WHEN '48h'  THEN CURRENT_DATE - INTERVAL '2 days'
      WHEN '3d'   THEN CURRENT_DATE - INTERVAL '3 days'
      WHEN '1w'   THEN CURRENT_DATE - INTERVAL '7 days'
      WHEN '2w'   THEN CURRENT_DATE - INTERVAL '14 days'
      WHEN '1m'   THEN CURRENT_DATE - INTERVAL '1 month'
      WHEN '3m'   THEN CURRENT_DATE - INTERVAL '3 months'
      WHEN '1y'   THEN CURRENT_DATE - INTERVAL '1 year'
      WHEN 'all'  THEN COALESCE(p_floor_date, DATE '2020-01-01')
    END)::DATE,
    CURRENT_DATE;
END;
$$;

COMMENT ON FUNCTION public.resolve_period_range IS
  'Résout un préréglage de période (24h/48h/3d/1w/2w/1m/3m/1y/all) ou une plage personnalisée en bornes de dates [date_debut, date_fin]. Fonction partagée à réutiliser par toute RPC de stats/revenus.';

GRANT EXECUTE ON FUNCTION public.resolve_period_range(TEXT, DATE, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 2) Stats gérant, filtrées par période, calculées côté serveur
-- ------------------------------------------------------------
-- SECURITY INVOKER (défaut) : s'appuie sur les policies RLS existantes
-- (reservations_select, avis_select_all, paiements_select) et sur
-- auth.uid() — un gérant ne peut donc jamais lire les stats d'un autre.
CREATE OR REPLACE FUNCTION public.get_gerant_stats_period(
  p_terrain_id  UUID DEFAULT NULL,   -- NULL = tous les terrains du gérant
  p_preset      TEXT DEFAULT NULL,   -- '24h'|'48h'|'3d'|'1w'|'2w'|'1m'|'3m'|'1y'|'all'|NULL
  p_start_date  DATE DEFAULT NULL,   -- requis si p_preset est NULL (période personnalisée)
  p_end_date    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
  v_result     JSON;
BEGIN
  SELECT date_debut, date_fin INTO v_date_debut, v_date_fin
  FROM public.resolve_period_range(
    p_preset, p_start_date, p_end_date,
    (SELECT created_at::date FROM public.profiles WHERE id = auth.uid())
  );

  WITH all_terrains AS (
    SELECT id FROM public.terrains WHERE gerant_id = auth.uid()
  ),
  scoped_terrains AS (
    SELECT id FROM all_terrains WHERE p_terrain_id IS NULL OR id = p_terrain_id
  ),
  res_scoped AS (
    SELECT r.*
    FROM public.reservations r
    WHERE r.terrain_id IN (SELECT id FROM scoped_terrains)
      AND r.date_slot BETWEEN v_date_debut AND v_date_fin
  ),
  res_all AS (
    SELECT r.*
    FROM public.reservations r
    WHERE r.terrain_id IN (SELECT id FROM all_terrains)
      AND r.date_slot BETWEEN v_date_debut AND v_date_fin
      AND r.statut IN ('confirmee', 'terminee')
  ),
  kpi AS (
    SELECT
      COALESCE(SUM(montant) FILTER (WHERE statut IN ('confirmee', 'terminee')), 0) AS revenus,
      COUNT(*)                                                     AS reservations,
      COUNT(*) FILTER (WHERE statut IN ('confirmee', 'terminee'))  AS confirmees,
      COUNT(*) FILTER (WHERE statut = 'confirmee')                 AS c_confirmee,
      COUNT(*) FILTER (WHERE statut = 'terminee')                  AS c_terminee,
      COUNT(*) FILTER (WHERE statut = 'annulee')                   AS c_annulee,
      COUNT(*) FILTER (WHERE statut = 'en_attente')                AS c_en_attente
    FROM res_scoped
  ),
  avis_agg AS (
    SELECT
      ROUND(AVG(a.note)::NUMERIC, 1)             AS note_moyenne,
      COUNT(*)                                   AS total,
      COUNT(*) FILTER (WHERE a.note = 5)         AS n5,
      COUNT(*) FILTER (WHERE a.note = 4)         AS n4,
      COUNT(*) FILTER (WHERE a.note <= 3)        AS n3m
    FROM public.avis a
    WHERE a.terrain_id IN (SELECT id FROM scoped_terrains)
      AND a.created_at::date BETWEEN v_date_debut AND v_date_fin
  ),
  jours AS (
    SELECT
      r.date_slot,
      SUM(r.montant) FILTER (WHERE p_terrain_id IS NULL OR r.terrain_id = p_terrain_id) AS montant,
      SUM(r.montant) AS all_montant
    FROM res_all r
    GROUP BY r.date_slot
  ),
  creneaux AS (
    SELECT
      LEFT(r.heure_slot::TEXT, 2) || 'h' AS heure,
      COUNT(*) AS nb,
      json_agg(json_build_object(
        'id', r.id, 'joueur', r.joueur_nom, 'terrain', r.terrain_nom,
        'montant', r.montant, 'statut', r.statut
      ) ORDER BY r.created_at DESC) AS reservations
    FROM res_scoped r
    GROUP BY LEFT(r.heure_slot::TEXT, 2)
  ),
  joueurs AS (
    SELECT
      r.joueur_id,
      MAX(r.joueur_nom) AS nom,
      COUNT(*) AS reservations,
      SUM(r.montant) AS montant,
      json_agg(json_build_object(
        'date', r.date_slot, 'terrain', r.terrain_nom,
        'montant', r.montant, 'statut', r.statut
      ) ORDER BY r.date_slot DESC) AS historique
    FROM res_scoped r
    WHERE r.statut IN ('confirmee', 'terminee')
    GROUP BY r.joueur_id
    ORDER BY COUNT(*) DESC
    LIMIT 5
  ),
  paiements_agg AS (
    SELECT p.mode, SUM(p.montant) AS montant, COUNT(*) AS cnt
    FROM public.paiements p
    JOIN public.reservations r ON r.id = p.reservation_id
    WHERE r.terrain_id IN (SELECT id FROM scoped_terrains)
      AND p.statut = 'valide'
      AND p.created_at::date BETWEEN v_date_debut AND v_date_fin
    GROUP BY p.mode
  )
  SELECT json_build_object(
    'date_debut', v_date_debut,
    'date_fin', v_date_fin,
    'kpi', (
      SELECT json_build_object(
        'revenus', k.revenus,
        'reservations', k.reservations,
        'tauxOccupation', CASE WHEN k.reservations = 0 THEN 0
                                ELSE ROUND(k.confirmees::NUMERIC / k.reservations * 100) END,
        'noteMoyenne', (SELECT note_moyenne FROM avis_agg),
        'parStatut', json_build_object(
          'confirmee', k.c_confirmee, 'terminee', k.c_terminee,
          'annulee', k.c_annulee, 'en_attente', k.c_en_attente
        ),
        'noteDistribution', (
          SELECT CASE WHEN total = 0 THEN NULL ELSE json_build_object(
            'cinq', ROUND(n5::NUMERIC / total * 100),
            'quatre', ROUND(n4::NUMERIC / total * 100),
            'troisOuMoins', ROUND(n3m::NUMERIC / total * 100)
          ) END FROM avis_agg
        )
      ) FROM kpi k
    ),
    'revenus_par_jour', (
      SELECT COALESCE(json_agg(json_build_object(
        'date_slot', j.date_slot, 'montant', COALESCE(j.montant, 0), 'all', j.all_montant
      ) ORDER BY j.date_slot), '[]'::json) FROM jours j
    ),
    'reservations_par_creneau', (
      SELECT COALESCE(json_agg(json_build_object(
        'heure', c.heure, 'nb', c.nb, 'reservations', c.reservations
      ) ORDER BY c.heure), '[]'::json) FROM creneaux c
    ),
    'top_joueurs', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', jo.joueur_id, 'nom', jo.nom, 'reservations', jo.reservations,
        'montant', jo.montant, 'historique', jo.historique
      )), '[]'::json) FROM joueurs jo
    ),
    'repartition_paiements', (
      SELECT COALESCE(json_agg(json_build_object(
        'mode', pa.mode, 'montant', pa.montant, 'transactions', pa.cnt
      )), '[]'::json) FROM paiements_agg pa
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_gerant_stats_period IS
  'Statistiques gérant (KPIs, revenus/jour, réservations/créneau, top joueurs, répartition paiements) filtrées par période via resolve_period_range(). Remplace les agrégations côté client de src/services/stats.js.';

GRANT EXECUTE ON FUNCTION public.get_gerant_stats_period(UUID, TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 3) Stats admin plateforme, filtrées par période (variante de
--    get_admin_dashboard_stats() qui reste inchangée pour ne rien casser).
--    À utiliser quand src/components/StatsGrid.jsx sera branché sur de
--    vraies données au lieu du mock 'metricsMap' actuel.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats_period(
  p_preset      TEXT DEFAULT NULL,
  p_start_date  DATE DEFAULT NULL,
  p_end_date    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin   DATE;
  v_taux       NUMERIC;
  v_result     JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT date_debut, date_fin INTO v_date_debut, v_date_fin
  FROM public.resolve_period_range(p_preset, p_start_date, p_end_date, NULL);

  SELECT (value#>>'{}')::NUMERIC INTO v_taux
  FROM public.system_settings WHERE key = 'commission_plateforme';
  v_taux := COALESCE(v_taux, 10);

  SELECT json_build_object(
    'date_debut', v_date_debut,
    'date_fin', v_date_fin,
    'terrains_actifs', (SELECT COUNT(*) FROM public.terrains WHERE statut = 'actif'),
    'reservations', (
      SELECT COUNT(*) FROM public.reservations
      WHERE date_slot BETWEEN v_date_debut AND v_date_fin
    ),
    'revenus', (
      SELECT COALESCE(SUM(montant), 0) FROM public.reservations
      WHERE date_slot BETWEEN v_date_debut AND v_date_fin AND statut IN ('confirmee', 'terminee')
    ),
    'revenus_commissions', (
      SELECT ROUND(COALESCE(SUM(montant), 0) * v_taux / 100, 0) FROM public.reservations
      WHERE date_slot BETWEEN v_date_debut AND v_date_fin AND statut IN ('confirmee', 'terminee')
    ),
    'joueurs_inscrits', (
      SELECT COUNT(*) FROM public.profiles WHERE role = 'joueur' AND created_at::date <= v_date_fin
    ),
    'taux_occupation_moyen', (
      SELECT CASE WHEN COUNT(c.id) = 0 THEN 0
        ELSE ROUND(COUNT(r.id)::NUMERIC / COUNT(c.id) * 100, 1)
      END
      FROM public.creneaux c
      LEFT JOIN public.reservations r ON r.creneau_id = c.id AND r.statut IN ('confirmee', 'terminee')
      WHERE c.date BETWEEN v_date_debut AND v_date_fin
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard_stats_period IS
  'Variante de get_admin_dashboard_stats() acceptant un préréglage ou une période personnalisée via resolve_period_range(). N''affecte pas get_admin_dashboard_stats() existante.';

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats_period(TEXT, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 4) Index de performance pour les plages larges ("1y" / "all")
-- ------------------------------------------------------------
-- Les requêtes gérant filtrent par terrain_id IN (...) puis par date_slot :
-- un index composite sert bien mieux ce pattern que les deux index séparés.
CREATE INDEX IF NOT EXISTS idx_reservations_terrain_date ON public.reservations(terrain_id, date_slot);

-- Utilisé par avis_agg (filtrage par terrain_id + période sur created_at).
CREATE INDEX IF NOT EXISTS idx_avis_terrain            ON public.avis(terrain_id);

-- Utilisé par paiements_agg (jointure reservation_id + période sur created_at).
CREATE INDEX IF NOT EXISTS idx_paiements_reservation    ON public.paiements(reservation_id);
CREATE INDEX IF NOT EXISTS idx_paiements_created_at     ON public.paiements(created_at);

-- Utilisé par get_admin_dashboard_stats_period() (joueurs_inscrits par période).
CREATE INDEX IF NOT EXISTS idx_profiles_role_created_at ON public.profiles(role, created_at);
