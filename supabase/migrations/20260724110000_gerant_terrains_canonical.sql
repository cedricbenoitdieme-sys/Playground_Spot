-- ============================================================
-- Migration : source canonique unique pour "les terrains d'un gérant".
--
-- Cause du bug "0 terrain" pour un gérant qui en a pourtant un : la page
-- admin "Gestion des Gérants" (fetchGerants, services/profiles.js) passe
-- par la table de jonction many-to-many `gerant_terrains`, jamais remplie
-- par le flow d'auto-création de terrain par le gérant (createGerantTerrain,
-- qui pose directement terrains.gerant_id). `terrains.gerant_id` est la
-- SEULE relation réellement tenue à jour dans ce projet (RLS, validation,
-- photos, boost visibilité en dépendent tous) — `gerant_terrains` est une
-- table héritée du schéma d'origine, non synchronisée, à ne plus utiliser
-- pour ce genre de requête.
--
-- Audit fait (grep sur tout src/ et supabase/) : `gerant_terrains` n'est
-- référencée QUE dans fetchGerants() côté frontend — Mon Terrain, Budget
-- Visibilité, Dashboard/Statistiques gérant interrogent déjà tous
-- terrains.gerant_id directement, ils ne sont pas concernés.
-- ============================================================

-- ── Vue canonique : un gérant par ligne, count + liste JSON de ses
-- terrains (utile pour une page admin qui liste PLUSIEURS gérants d'un
-- coup, sans tomber dans du N+1 requêtes). LEFT JOIN pour que les
-- gérants sans terrain apparaissent bien avec count=0, pas absents.
-- ============================================================
CREATE OR REPLACE VIEW public.v_gerant_terrains AS
SELECT
  p.id AS gerant_id,
  COUNT(t.id) AS terrain_count,
  COALESCE(
    json_agg(
      json_build_object(
        'id', t.id, 'nom', t.nom, 'quartier', t.quartier,
        'status', t.status, 'statut', t.statut
      ) ORDER BY t.created_at
    ) FILTER (WHERE t.id IS NOT NULL),
    '[]'::json
  ) AS terrains
FROM public.profiles p
LEFT JOIN public.terrains t ON t.gerant_id = p.id
WHERE p.role = 'gerant'
GROUP BY p.id;

-- ── RPC pour un seul gérant (nom demandé explicitement) — même logique,
-- pratique pour un appel ciblé plutôt que de filtrer la vue côté client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_gerant_terrains(p_gerant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT json_build_object('gerant_id', v.gerant_id, 'terrain_count', v.terrain_count, 'terrains', v.terrains)
  INTO v_result
  FROM public.v_gerant_terrains v
  WHERE v.gerant_id = p_gerant_id;

  RETURN COALESCE(v_result, json_build_object('gerant_id', p_gerant_id, 'terrain_count', 0, 'terrains', '[]'::json));
END;
$$;
