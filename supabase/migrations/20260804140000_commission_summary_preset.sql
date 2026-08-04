-- ============================================================
-- admin_get_commission_summary : support des préréglages de période
-- ============================================================
-- Jusqu'ici la fonction ne prenait que p_date_debut/p_date_fin (défaut :
-- "ce mois-ci"), sans lien avec le système unifié de préréglages déjà en
-- place ailleurs (resolve_period_range(), utilisé par get_gerant_stats_period
-- et get_admin_dashboard_stats_period). La page Abonnements & Commissions
-- affichait donc une période fixe non modifiable côté UI.
--
-- On ajoute p_preset en le déléguant à resolve_period_range() (même
-- convention que get_admin_dashboard_stats_period : p_preset en premier,
-- NULL/'custom' + p_date_debut/p_date_fin pour une période personnalisée).
-- Le changement de signature (2 → 3 paramètres) crée un nouvel overload
-- Postgres : on DROP explicitement l'ancienne version pour ne pas laisser
-- une fonction orpheline avec les mêmes droits.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_get_commission_summary(DATE, DATE);

CREATE OR REPLACE FUNCTION public.admin_get_commission_summary(
  p_preset      TEXT DEFAULT NULL,   -- '24h'|'72h'|'7d'|'14d'|'31d'|'45d'|'3m'|'6m'|'1y'|'all' ; NULL/'custom' = personnalisée
  p_date_debut  DATE DEFAULT NULL,
  p_date_fin    DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut                    DATE;
  v_fin                      DATE;
  v_total_montant            BIGINT;
  v_nb_reservations          BIGINT;
  v_total_commission         BIGINT;
  v_nb_paiements_sans_commission BIGINT;
  v_taux_moyen_effectif      NUMERIC;
  v_par_jour                 JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  IF p_preset IS NULL AND p_date_debut IS NULL AND p_date_fin IS NULL THEN
    -- Rétrocompatibilité : appel sans aucun argument = comportement
    -- historique "ce mois-ci", pas de RAISE de resolve_period_range()
    -- (qui exige start/end pour le mode custom).
    v_debut := date_trunc('month', CURRENT_DATE)::DATE;
    v_fin   := CURRENT_DATE;
  ELSE
    SELECT date_debut, date_fin INTO v_debut, v_fin
    FROM public.resolve_period_range(p_preset, p_date_debut, p_date_fin, NULL);
  END IF;

  SELECT COALESCE(SUM(r.montant), 0), COUNT(*)
  INTO v_total_montant, v_nb_reservations
  FROM public.reservations r
  WHERE r.date_slot BETWEEN v_debut AND v_fin
    AND r.statut IN ('confirmee', 'terminee');

  SELECT COALESCE(SUM(p.commission_montant), 0),
         COUNT(*) FILTER (WHERE p.commission_montant IS NULL)
  INTO v_total_commission, v_nb_paiements_sans_commission
  FROM public.paiements p
  JOIN public.reservations r ON r.id = p.reservation_id
  WHERE r.date_slot BETWEEN v_debut AND v_fin
    AND r.statut IN ('confirmee', 'terminee')
    AND p.statut = 'valide';

  v_taux_moyen_effectif := CASE WHEN v_total_montant > 0
    THEN ROUND(v_total_commission::NUMERIC / v_total_montant * 100, 2)
    ELSE 0 END;

  SELECT COALESCE(json_agg(json_build_object(
      'date', jour,
      'montant_total', montant_total,
      'commission', commission_jour
    ) ORDER BY jour), '[]'::json)
  INTO v_par_jour
  FROM (
    SELECT r.date_slot AS jour,
           SUM(r.montant) AS montant_total,
           COALESCE(SUM(p.commission_montant), 0) AS commission_jour
    FROM public.reservations r
    LEFT JOIN public.paiements p ON p.reservation_id = r.id AND p.statut = 'valide'
    WHERE r.date_slot BETWEEN v_debut AND v_fin
      AND r.statut IN ('confirmee', 'terminee')
    GROUP BY r.date_slot
  ) d;

  RETURN json_build_object(
    'periode_debut', v_debut,
    'periode_fin', v_fin,
    'taux_moyen_effectif', v_taux_moyen_effectif,
    'total_montant_reservations', v_total_montant,
    'total_commission', v_total_commission,
    'nb_reservations', v_nb_reservations,
    'nb_paiements_sans_commission', v_nb_paiements_sans_commission,
    'par_jour', v_par_jour
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_commission_summary IS
  'Résumé des commissions verrouillées par paiement (paiements.commission_montant), filtré par préréglage (resolve_period_range) ou période personnalisée. Sans argument : comportement historique "ce mois-ci".';

REVOKE ALL ON FUNCTION public.admin_get_commission_summary(TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_commission_summary(TEXT, DATE, DATE) TO authenticated;

-- ============================================================
-- Vérification post-migration :
-- SELECT public.admin_get_commission_summary(); -- comportement historique (ce mois)
-- SELECT public.admin_get_commission_summary('7d'); -- préréglage
-- SELECT public.admin_get_commission_summary(NULL, '2026-01-01', '2026-01-31'); -- personnalisée
-- ============================================================
