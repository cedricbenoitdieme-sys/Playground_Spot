-- ============================================================
-- Migration : élargit la source canonique "terrains d'un gérant"
-- (v_gerant_terrains / get_gerant_terrains, migration 20260724110000)
-- pour qu'elle renvoie les terrains COMPLETS (tous les champs + amenities),
-- pas juste id/nom/quartier/status/statut.
--
-- Raison : l'objectif est qu'UN SEUL hook/fonction serve TOUS les
-- consommateurs (Gestion des Gérants, Mon Terrain, Budget Visibilité,
-- Dashboard...). La version précédente ne suffisait qu'à l'écran admin
-- (juste un compteur) ; Mon Terrain et Budget Visibilité ont besoin de
-- price/surface/size/capacite/horaires/image_url/amenities pour
-- fonctionner (c'est ce que fetchTerrainsByGerant renvoie aujourd'hui).
-- Sans cet élargissement, remplacer fetchTerrainsByGerant par le nouveau
-- hook aurait cassé ces deux pages.
-- ============================================================

CREATE OR REPLACE VIEW public.v_gerant_terrains AS
SELECT
  p.id AS gerant_id,
  COALESCE(gt.terrain_count, 0) AS terrain_count,
  COALESCE(gt.terrains, '[]'::json) AS terrains
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS terrain_count,
    json_agg(
      json_build_object(
        'id', t.id, 'nom', t.nom, 'quartier', t.quartier, 'adresse', t.adresse,
        'price', t.price, 'rating', t.rating, 'reviews_count', t.reviews_count,
        'surface', t.surface, 'size', t.size, 'capacite', t.capacite,
        'horaires', t.horaires, 'image_url', t.image_url, 'lat', t.lat, 'lng', t.lng,
        'gerant_id', t.gerant_id, 'statut', t.statut, 'status', t.status,
        'rejection_reason', t.rejection_reason, 'description', t.description,
        'created_at', t.created_at, 'updated_at', t.updated_at,
        'amenities', COALESCE((
          SELECT json_agg(json_build_object('id', a.id, 'label', a.label, 'icone', a.icone))
          FROM public.terrain_amenities a WHERE a.terrain_id = t.id
        ), '[]'::json)
      ) ORDER BY t.created_at DESC
    ) AS terrains
  FROM public.terrains t
  WHERE t.gerant_id = p.id
) gt ON true
WHERE p.role = 'gerant';

-- get_gerant_terrains() n'a pas besoin d'être recréée : elle interroge
-- déjà cette vue par gerant_id (CREATE OR REPLACE VIEW ci-dessus suffit,
-- la RPC en hérite automatiquement).
