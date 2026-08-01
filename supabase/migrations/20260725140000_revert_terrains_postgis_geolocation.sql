-- ============================================================
-- Rollback : annule la migration 20260725130000_terrains_postgis_geolocation
-- (géolocalisation PostGIS / préparation Google Maps), demandée puis
-- annulée juste après exécution. Le fichier de migration original a été
-- supprimé du dépôt ; celui-ci défait ce qui avait déjà été appliqué en
-- base.
--
-- Ordre explicite (plutôt que DROP EXTENSION ... CASCADE) pour rester
-- prévisible sur une base de prod : chaque objet créé par la migration
-- d'origine est retiré un par un, dans l'ordre inverse de dépendance.
-- ============================================================

DROP FUNCTION IF EXISTS public.terrains_nearby(NUMERIC, NUMERIC, NUMERIC, INT);
DROP FUNCTION IF EXISTS public.update_terrain_location(UUID, NUMERIC, NUMERIC);

DROP TRIGGER IF EXISTS trg_sync_terrain_geog ON public.terrains;
DROP FUNCTION IF EXISTS public.sync_terrain_geog();

DROP INDEX IF EXISTS public.idx_terrains_geog;

DROP VIEW IF EXISTS public.v_terrains_discovery CASCADE;

ALTER TABLE public.terrains DROP CONSTRAINT IF EXISTS check_terrain_coords_valid_range;
ALTER TABLE public.terrains DROP COLUMN IF EXISTS geog;

CREATE OR REPLACE VIEW public.v_terrains_discovery AS
SELECT
  t.*,
  COALESCE(vb.budget_alloue, 0) AS boost_weight,
  (vb.id IS NOT NULL) AS boost_actif
FROM public.terrains t
LEFT JOIN LATERAL (
  SELECT id, budget_alloue FROM public.visibility_boosts b
  WHERE b.terrain_id = t.id AND b.statut = 'actif' AND CURRENT_DATE BETWEEN b.date_debut AND b.date_fin
  ORDER BY b.budget_alloue DESC LIMIT 1
) vb ON true;

-- Rien d'autre dans le schéma n'utilise PostGIS : retrait complet de
-- l'extension (au lieu de la laisser installée sans usage).
DROP EXTENSION IF EXISTS postgis;

-- ============================================================
-- Vérification post-rollback :
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='terrains' AND column_name='geog';
-- -> aucune ligne
-- SELECT extname FROM pg_extension WHERE extname = 'postgis';
-- -> aucune ligne
-- ============================================================
