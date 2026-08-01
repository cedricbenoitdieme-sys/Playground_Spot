-- ============================================================
-- Migration : statistiques publiques réelles pour le ruban de la landing
-- page ("15 000+ joueurs" / "55+ terrains" / "98% satisfaction"), actuellement
-- des CountUp figés en dur (src/pages/Landing.jsx:358-380, hors scope SQL,
-- cf. prompt de suivi séparé pour le branchement frontend).
--
-- Source des vrais chiffres :
--   - nombre_joueurs    : COUNT(profiles) role='joueur' AND statut='actif'
--   - nombre_terrains   : COUNT(terrains) statut='actif' AND status='approved'
--                         (mêmes critères publics que get_terrains_populaires,
--                         migration 20260725110000 — pas de colonne is_test
--                         dans `terrains`, rien à exclure de plus)
--   - taux_satisfaction : moyenne réelle de public.avis.note (1-5, table
--                         existante depuis schema.sql), convertie en %.
--                         Fiabilité : sous SEUIL_AVIS avis au total, on
--                         renvoie NULL plutôt qu'un pourcentage instable —
--                         c'est au frontend de choisir l'affichage neutre
--                         (masquer la stat, "Nouveau !", etc.), jamais une
--                         valeur inventée côté base.
--
-- Pas de calcul temps réel demandé : matérialisé dans
-- stats_plateforme_cache (1 seule ligne, PK booléenne = pattern singleton
-- row standard Postgres), recalculé par un cron mensuel plutôt qu'à chaque
-- lecture — contrairement au classement boost (20260725110000), qui doit
-- décroître en continu, ces 3 chiffres n'ont aucune raison de bouger plus
-- vite qu'une fois par mois.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stats_plateforme_cache (
  id                 BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true), -- singleton : 1 seule ligne possible
  nombre_joueurs     INTEGER NOT NULL DEFAULT 0,
  nombre_terrains    INTEGER NOT NULL DEFAULT 0,
  nombre_avis        INTEGER NOT NULL DEFAULT 0,
  taux_satisfaction  NUMERIC(5,2), -- NULL tant que nombre_avis < SEUIL_AVIS (cf. refresh_stats_plateforme)
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stats_plateforme_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "stats_plateforme_cache_select_all" ON public.stats_plateforme_cache
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE/DELETE pour anon/authenticated : seule la
-- fonction SECURITY DEFINER ci-dessous (appelée par le cron) écrit ici.

-- ── refresh_stats_plateforme — recalcule et matérialise le cache ──────
CREATE OR REPLACE FUNCTION public.refresh_stats_plateforme()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seuil_avis CONSTANT INTEGER := 20; -- fiabilité minimale avant d'afficher un taux de satisfaction
  v_joueurs    INTEGER;
  v_terrains   INTEGER;
  v_nb_avis    INTEGER;
  v_avg_note   NUMERIC;
  v_taux       NUMERIC(5,2);
BEGIN
  SELECT COUNT(*) INTO v_joueurs
  FROM public.profiles WHERE role = 'joueur' AND statut = 'actif';

  SELECT COUNT(*) INTO v_terrains
  FROM public.terrains WHERE statut = 'actif' AND status = 'approved';

  SELECT COUNT(*), AVG(note) INTO v_nb_avis, v_avg_note FROM public.avis;

  v_taux := CASE WHEN v_nb_avis >= v_seuil_avis
              THEN ROUND((v_avg_note / 5 * 100)::NUMERIC, 1)
              ELSE NULL END;

  INSERT INTO public.stats_plateforme_cache
    (id, nombre_joueurs, nombre_terrains, nombre_avis, taux_satisfaction, updated_at)
  VALUES (true, v_joueurs, v_terrains, v_nb_avis, v_taux, NOW())
  ON CONFLICT (id) DO UPDATE SET
    nombre_joueurs    = EXCLUDED.nombre_joueurs,
    nombre_terrains   = EXCLUDED.nombre_terrains,
    nombre_avis       = EXCLUDED.nombre_avis,
    taux_satisfaction = EXCLUDED.taux_satisfaction,
    updated_at        = EXCLUDED.updated_at;
END;
$$;

-- ── Cron mensuel (1er du mois, 03h00 UTC — heure creuse) ───────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('refresh-stats-plateforme-monthly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'refresh-stats-plateforme-monthly',
  '0 3 1 * *',
  $$SELECT public.refresh_stats_plateforme();$$
);

-- Premier calcul immédiat pour ne pas laisser le cache vide jusqu'au 1er
-- du mois prochain.
SELECT public.refresh_stats_plateforme();

-- ============================================================
-- Vérification post-migration :
-- SELECT * FROM public.stats_plateforme_cache;
-- -> une seule ligne, nombre_joueurs/nombre_terrains réels, taux_satisfaction
--    NULL si moins de 20 avis en base (normal en phase de lancement).
-- ============================================================
