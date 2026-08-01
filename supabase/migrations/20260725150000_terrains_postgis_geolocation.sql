-- ============================================================
-- Migration : géolocalisation terrains — indexation spatiale pour la
-- recherche par proximité (PlaygroundSpot reste sur Leaflet + tuiles
-- CartoDB + Nominatim, tous gratuits sans clé API — PostGIS est une
-- extension Postgres open-source, sans rapport avec le budget carto
-- payant : le moteur de requête spatiale côté base est indépendant du
-- fournisseur de tuiles/carte affiché côté frontend).
--
-- État réel constaté avant cette migration : PostGIS n'était PAS activé
-- sur ce projet (seules les extensions `uuid-ossp` et `pg_cron`
-- existaient) et `terrains.lat`/`terrains.lng` sont de simples colonnes
-- `NUMERIC(10,7)` (schema.sql), pas de type géographique, pas d'index
-- spatial. Aucun calcul de distance/proximité serveur n'existe nulle part
-- dans le code (`Discovery.jsx`/`DiscoveryFilters.jsx` filtrent par
-- `quartier` textuel, pas par distance réelle).
--
-- Choix : garder `lat`/`lng` (NUMERIC) comme SOURCE DE VÉRITÉ — c'est ce
-- que tout le code actuel lit/écrit (formulaire gérant, carte Leaflet).
-- On ajoute une colonne `geog GEOGRAPHY(Point, 4326)` tenue à jour
-- automatiquement par trigger à chaque INSERT/UPDATE de lat/lng, réservée
-- aux requêtes spatiales (index GIST, fonction de proximité ci-dessous).
-- Le frontend Leaflet n'a besoin de rien connaître de cette colonne.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.terrains
  ADD COLUMN IF NOT EXISTS geog GEOGRAPHY(Point, 4326);

-- Sanity check sur les coordonnées (n'empêche pas NULL : un terrain en
-- cours de création par un gérant peut ne pas encore avoir de position —
-- forcer NOT NULL casserait ce flux de création progressive).
DO $$ BEGIN
  ALTER TABLE public.terrains
    ADD CONSTRAINT check_terrain_coords_valid_range
    CHECK (
      (lat IS NULL AND lng IS NULL) OR
      (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.sync_terrain_geog()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::GEOGRAPHY;
  ELSE
    NEW.geog := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_sync_terrain_geog
    BEFORE INSERT OR UPDATE OF lat, lng ON public.terrains
    FOR EACH ROW EXECUTE FUNCTION public.sync_terrain_geog();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill des lignes existantes (le trigger ne joue que sur INSERT/UPDATE
-- futurs) — inoffensif si `terrains` est vide ou déjà à jour.
UPDATE public.terrains
SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::GEOGRAPHY
WHERE lat IS NOT NULL AND lng IS NOT NULL AND geog IS NULL;

CREATE INDEX IF NOT EXISTS idx_terrains_geog ON public.terrains USING GIST (geog);

-- ── update_terrain_location — endpoint pour "utiliser ma position" /
-- point choisi sur la carte Leaflet (Tâche 2) ──────────────────────────
-- Mêmes règles d'autorisation que la policy RLS "terrains_update_admin_gerant"
-- (gérant propriétaire ou admin), dupliquées ici explicitement plutôt que
-- de compter sur RLS seule : une RPC SECURITY DEFINER contourne RLS par
-- construction, donc le contrôle d'accès DOIT être fait dans le corps de
-- la fonction.
CREATE OR REPLACE FUNCTION public.update_terrain_location(
  p_terrain_id UUID,
  p_lat NUMERIC,
  p_lng NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gerant_id UUID;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Latitude et longitude requises';
  END IF;
  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'Coordonnées hors des bornes valides (lat -90..90, lng -180..180)';
  END IF;

  SELECT gerant_id INTO v_gerant_id FROM public.terrains WHERE id = p_terrain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  IF v_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.terrains SET lat = p_lat, lng = p_lng WHERE id = p_terrain_id;

  RETURN json_build_object('terrain_id', p_terrain_id, 'lat', p_lat, 'lng', p_lng);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_terrain_location(UUID, NUMERIC, NUMERIC) TO authenticated;

-- ── terrains_nearby — recherche par proximité (Tâche 1 : "exploitables
-- pour la recherche par proximité"). Mêmes critères de visibilité publique
-- que get_terrains_populaires (migration 20260725110000) : uniquement les
-- terrains actifs + approuvés.
-- ============================================================
CREATE OR REPLACE FUNCTION public.terrains_nearby(
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_radius_km NUMERIC DEFAULT 10,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  nom           TEXT,
  quartier      TEXT,
  price         INTEGER,
  rating        NUMERIC,
  lat           NUMERIC,
  lng           NUMERIC,
  distance_km   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.nom, t.quartier, t.price, t.rating, t.lat, t.lng,
    ROUND((ST_Distance(t.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY) / 1000)::NUMERIC, 2) AS distance_km
  FROM public.terrains t
  WHERE t.statut = 'actif' AND t.status = 'approved'
    AND t.geog IS NOT NULL
    AND ST_DWithin(t.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY, GREATEST(p_radius_km, 0) * 1000)
  ORDER BY distance_km ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.terrains_nearby(NUMERIC, NUMERIC, NUMERIC, INT) TO anon, authenticated;

-- ============================================================
-- Vérification post-migration :
-- SELECT id, nom, lat, lng, geog IS NOT NULL AS geog_ok FROM public.terrains;
-- SELECT * FROM public.terrains_nearby(14.7167, -17.4677, 15, 10);
-- -- en session gérant propriétaire ou admin :
-- SELECT public.update_terrain_location('<terrain_id>', 14.72, -17.47);
-- -- en session d'un AUTRE gérant : doit lever "Accès refusé"
-- ============================================================
