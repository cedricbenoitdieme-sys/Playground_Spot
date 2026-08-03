-- ============================================================
-- Migration : admin_get_commission_summary — arrête de ré-appliquer un
-- taux global unique (system_settings.commission_plateforme, jamais
-- vraiment maintenu) au volume total des réservations, et somme à la
-- place les VRAIES commissions verrouillées par paiement
-- (paiements.commission_montant), désormais réellement calculées depuis
-- la migration 20260803220000 (calculate_commission() enfin branchée
-- dans handle_unitech_webhook).
--
-- Nécessaire car les gérants n'ont plus tous le même taux (par plan,
-- potentiellement dérogation temporaire active sur certaines dates) — un
-- taux fixe unique appliqué au volume global n'a plus de sens et sous/
-- sur-estimait déjà la réalité avant ce changement.
--
-- Les paiements confirmés AVANT cette migration (ou avant la 20260803220000)
-- ont `commission_montant IS NULL` (jamais calculé) — comptés séparément
-- (`nb_paiements_sans_commission`) plutôt que silencieusement ignorés à 0,
-- pour que l'admin sache que le total peut être sous-estimé sur les
-- périodes anciennes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_commission_summary(
  p_date_debut DATE DEFAULT NULL,
  p_date_fin   DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut                    DATE := COALESCE(p_date_debut, date_trunc('month', CURRENT_DATE)::DATE);
  v_fin                      DATE := COALESCE(p_date_fin, CURRENT_DATE);
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

-- ============================================================
-- Vérification post-migration :
-- SELECT public.admin_get_commission_summary(); -- en session admin
-- -- total_commission doit désormais provenir de vraies sommes
-- -- paiements.commission_montant, pas d'un taux fixe réappliqué.
-- ============================================================
