-- ============================================================
-- Stats plateforme (ruban landing) : valeurs "jamais à la baisse" +
-- interrupteur admin pour afficher/masquer le ruban.
-- ============================================================
-- 1) refresh_stats_plateforme() compte désormais TOUS les comptes
--    joueur et TOUS les terrains homologués dès leur création, qu'ils
--    soient actuellement actifs ou non (un compte suspendu ou un terrain
--    temporairement désactivé reste compté). stats_plateforme_cache passe
--    en plus en "high-water mark" : les colonnes publiques (nombre_joueurs,
--    nombre_terrains, taux_satisfaction) ne peuvent plus jamais diminuer
--    d'un rafraîchissement à l'autre, même en cas de suppression de compte
--    ou de moyenne d'avis qui baisse. On ajoute des colonnes _live séparées
--    pour que l'admin garde une vraie transparence sur le chiffre réel
--    du moment, à côté du chiffre affiché publiquement.
-- 2) Nouveau réglage system_settings 'landing_stats_ribbon_visible'
--    (bool) pour masquer tout le ruban depuis Paramètres Plateforme.
-- 3) RPC admin_refresh_stats_plateforme() pour rafraîchir à la demande
--    depuis l'écran Paramètres (pas seulement via le cron mensuel).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colonnes "live" (valeurs réelles actuelles, non plafonnées)
-- ------------------------------------------------------------
ALTER TABLE public.stats_plateforme_cache
  ADD COLUMN IF NOT EXISTS nombre_joueurs_live    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nombre_terrains_live   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taux_satisfaction_live NUMERIC(5,2);

CREATE OR REPLACE FUNCTION public.refresh_stats_plateforme()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seuil_avis CONSTANT INTEGER := 20;
  v_joueurs    INTEGER;
  v_terrains   INTEGER;
  v_nb_avis    INTEGER;
  v_avg_note   NUMERIC;
  v_taux       NUMERIC(5,2);
BEGIN
  -- Compte tous les comptes joueur dès leur création, actif ou non (compte
  -- désactivé/suspendu par la suite) : "Joueurs Dakarois" est un total de
  -- joueurs inscrits, pas un nombre de comptes actuellement actifs.
  SELECT COUNT(*) INTO v_joueurs
  FROM public.profiles WHERE role = 'joueur';

  -- Idem pour les terrains : `statut` (actif/inactif/en_maintenance) ne doit
  -- plus filtrer, un terrain temporairement désactivé reste comptabilisé.
  -- En revanche `status = 'approved'` (workflow de validation, colonne
  -- distincte) reste requis : seuls les terrains réellement homologués par
  -- un admin doivent apparaître dans "Terrains Homologués".
  SELECT COUNT(*) INTO v_terrains
  FROM public.terrains WHERE status = 'approved';

  SELECT COUNT(*), AVG(note) INTO v_nb_avis, v_avg_note FROM public.avis;

  v_taux := CASE WHEN v_nb_avis >= v_seuil_avis
              THEN ROUND((v_avg_note / 5 * 100)::NUMERIC, 1)
              ELSE NULL END;

  INSERT INTO public.stats_plateforme_cache
    (id, nombre_joueurs, nombre_terrains, nombre_avis, taux_satisfaction,
     nombre_joueurs_live, nombre_terrains_live, taux_satisfaction_live, updated_at)
  VALUES (true, v_joueurs, v_terrains, v_nb_avis, v_taux, v_joueurs, v_terrains, v_taux, NOW())
  ON CONFLICT (id) DO UPDATE SET
    -- Valeurs publiques : "high-water mark", ne redescendent jamais.
    nombre_joueurs      = GREATEST(stats_plateforme_cache.nombre_joueurs, EXCLUDED.nombre_joueurs),
    nombre_terrains     = GREATEST(stats_plateforme_cache.nombre_terrains, EXCLUDED.nombre_terrains),
    taux_satisfaction   = CASE
                             WHEN stats_plateforme_cache.taux_satisfaction IS NULL THEN EXCLUDED.taux_satisfaction
                             WHEN EXCLUDED.taux_satisfaction IS NULL THEN stats_plateforme_cache.taux_satisfaction
                             ELSE GREATEST(stats_plateforme_cache.taux_satisfaction, EXCLUDED.taux_satisfaction)
                           END,
    nombre_avis         = EXCLUDED.nombre_avis, -- compteur brut, informatif seulement
    -- Valeurs live : toujours le calcul réel du moment, pour transparence admin.
    nombre_joueurs_live    = EXCLUDED.nombre_joueurs_live,
    nombre_terrains_live   = EXCLUDED.nombre_terrains_live,
    taux_satisfaction_live = EXCLUDED.taux_satisfaction_live,
    updated_at          = EXCLUDED.updated_at;
END;
$$;

COMMENT ON FUNCTION public.refresh_stats_plateforme IS
  'Recalcule stats_plateforme_cache. Les colonnes publiques (nombre_joueurs, nombre_terrains, taux_satisfaction) ne redescendent jamais (high-water mark, GREATEST avec la valeur précédente) — les colonnes _live gardent le calcul réel du moment pour la transparence admin.';

-- ------------------------------------------------------------
-- 2) Réglage visibilité du ruban (Paramètres Plateforme)
-- ------------------------------------------------------------
INSERT INTO public.system_settings (key, value) VALUES
  ('landing_stats_ribbon_visible', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 3) Rafraîchissement à la demande (admin), au lieu d'attendre le cron
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_refresh_stats_plateforme()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  PERFORM public.refresh_stats_plateforme();

  SELECT row_to_json(s) INTO v_result FROM public.stats_plateforme_cache s WHERE id = true;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_refresh_stats_plateforme IS
  'Force un recalcul immédiat de stats_plateforme_cache (au lieu d''attendre le cron mensuel) et retourne la ligne à jour — utilisé par l''écran Paramètres Plateforme.';

REVOKE ALL ON FUNCTION public.admin_refresh_stats_plateforme() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refresh_stats_plateforme() TO authenticated;

-- Premier recalcul immédiat pour peupler les nouvelles colonnes _live
-- sans attendre le prochain cron.
SELECT public.refresh_stats_plateforme();

-- ============================================================
-- Vérification post-migration :
-- SELECT * FROM public.stats_plateforme_cache;
-- -- nombre_joueurs/nombre_terrains/taux_satisfaction = valeurs "jamais à la baisse"
-- -- nombre_joueurs_live/nombre_terrains_live/taux_satisfaction_live = valeurs réelles actuelles
-- SELECT value FROM public.system_settings WHERE key = 'landing_stats_ribbon_visible'; -- 'true'
-- SELECT public.admin_refresh_stats_plateforme(); -- en session super_admin
-- ============================================================
