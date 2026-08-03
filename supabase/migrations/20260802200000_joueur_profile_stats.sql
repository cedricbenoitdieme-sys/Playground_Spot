-- ============================================================
-- Stats réelles du profil joueur (remplace les mocks de JoueurProfile.jsx)
-- ============================================================
-- Contexte : src/pages/JoueurProfile.jsx initialise ses stats via un
-- useState() avec des valeurs codées en dur (matchs: 18, hours: 36, spent:
-- "240K FCFA", "VIP Or 🥇" en JSX brut) — jamais branché sur une source de
-- données réelle, jamais recalculé pour l'utilisateur connecté. Tout
-- nouveau compte affiche donc les mêmes fausses stats.
--
-- Cette fonction calcule les vraies valeurs pour l'utilisateur APPELANT
-- (auth.uid()) — SECURITY INVOKER par défaut, RLS "reservations_select"
-- (joueur_id = auth.uid()) suffit à sécuriser l'accès, pas besoin de
-- paramètre d'ID ni de DEFINER.
--
-- Note de conception : le statut 'terminee' est défini dans l'enum
-- statut_reservation mais n'est actuellement JAMAIS positionné nulle part
-- dans le code (ni trigger SQL, ni frontend) — une réservation reste
-- 'confirmee' indéfiniment après la date du match. "matchs_joues" compte
-- donc 'confirmee' + 'terminee', comme le fait déjà tout le reste du
-- schéma (revenus gérant, dépenses joueur dans fetchProfileWithHistory,
-- etc.) — pas une distinction "joué / à venir" qui n'existe pas encore
-- ailleurs dans l'app. Si un futur mécanisme vient marquer 'terminee'
-- après la date du créneau, cette fonction restera correcte sans
-- modification (elle compte déjà les deux statuts).
CREATE OR REPLACE FUNCTION public.get_joueur_profile_stats()
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT json_build_object(
    'matchs_joues',      COUNT(*) FILTER (WHERE statut IN ('confirmee', 'terminee')),
    'heures_cumulees',   COALESCE(SUM(duree_heures) FILTER (WHERE statut IN ('confirmee', 'terminee')), 0),
    'montant_depense',   COALESCE(SUM(montant) FILTER (WHERE statut IN ('confirmee', 'terminee')), 0),
    'reservations_total', COUNT(*)
  ) INTO v_result
  FROM public.reservations
  WHERE joueur_id = auth.uid();

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_joueur_profile_stats IS
  'Stats réelles (matchs, heures, dépenses) du joueur connecté (auth.uid()), calculées depuis reservations. Remplace les mocks de JoueurProfile.jsx. Pas de paramètre : toujours scopé à l''appelant.';

GRANT EXECUTE ON FUNCTION public.get_joueur_profile_stats() TO authenticated;

-- ============================================================
-- Vérification post-migration (en tant qu'utilisateur connecté, via
-- SQL Editor "Run as" ou côté client) :
-- SELECT public.get_joueur_profile_stats();
-- -- Pour un compte tout juste créé, sans aucune réservation :
-- -- {"matchs_joues":0,"heures_cumulees":0,"montant_depense":0,"reservations_total":0}
-- ============================================================
