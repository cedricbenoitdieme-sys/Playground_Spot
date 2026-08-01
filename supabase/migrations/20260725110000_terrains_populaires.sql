-- ============================================================
-- Migration : classement public "Terrains Populaires"
--
-- Contexte : la landing page publique n'a jamais interrogé la base — les
-- 3 cartes "Terrains Populaires" sont du JSX 100% codé en dur
-- (src/pages/Landing.jsx, "Arena Plateau" / "Dakar Pitch Mermoz" /
-- "Five Dakar Almadies", photos Unsplash). Aucun fallback mocké côté
-- service/API : src/services/terrains.js (fetchTerrains, fetchTopTerrains)
-- interroge déjà strictement `public.terrains` sans jamais retomber sur des
-- données fictives — le nettoyage nécessaire est uniquement côté src/
-- (hors scope de cette migration, cf. prompt de suivi séparé).
--
-- `terrains` n'a aucune colonne de type `is_test` (vérifié dans
-- supabase/schema.sql) : rien à exclure de ce côté-là aujourd'hui.
--
-- Ce fichier ajoute le vrai classement "populaires", jamais implémenté :
-- le système de Budget Visibilité (public.visibility_boosts, migrations
-- 20260722150000 / 20260724150000) existe côté paiement/activation mais
-- n'était jusqu'ici JAMAIS lu par aucune requête de liste de terrains
-- (fetchTerrains/fetchTopTerrains trient uniquement par `rating`).
-- ============================================================

-- ── get_terrains_populaires — classement public, SECURITY DEFINER ─────
-- Fonction (pas une simple vue) car le tri doit AGRÉGER les réservations
-- récentes par terrain sans que les policies RLS de `public.reservations`
-- (qui restreignent un joueur/gérant à ses propres lignes) ne réduisent le
-- COUNT(*) à 0 pour un visiteur anonyme. SECURITY DEFINER contourne
-- volontairement cette RLS ici, mais UNIQUEMENT pour exposer un COUNT
-- agrégé et les colonnes déjà publiques de `terrains` — jamais de détail
-- de réservation individuel, jamais un terrain hors des critères publics.
--
-- Filtre `statut = 'actif' AND status = 'approved'` : copie exacte de la
-- condition publique de la policy RLS "terrains_select_all"
-- (migration 20260723120000) — un visiteur anonyme ne doit jamais voir un
-- terrain que cette policy lui masquerait normalement.
--
-- Dégressivité du boost (Tâche 2) : score = budget_alloué × fraction de
-- durée restante (1 → 0, linéaire entre date_debut et date_fin), recalculé
-- à CHAQUE lecture (fonction STABLE, pas de matérialisation) — pas besoin
-- d'un cron de recalcul quotidien : contrairement à une table figée par un
-- job, ce score décroît en continu tout seul, sans jamais rester bloqué à
-- sa valeur du jour de paiement. Le cron horaire déjà existant
-- (expire-visibility-boosts-hourly, migration 20260724150000) s'occupe
-- séparément de faire passer `statut` à 'termine' une fois `date_fin`
-- dépassée — cette fonction revérifie de toute façon
-- `CURRENT_DATE BETWEEN date_debut AND date_fin` en plus de `statut='actif'`
-- (même précaution que get_boost_stats.is_currently_active) pour ne
-- jamais compter un boost expiré pendant la fenêtre de latence du cron.
CREATE OR REPLACE FUNCTION public.get_terrains_populaires(p_limit INT DEFAULT 20)
RETURNS TABLE (
  id                    UUID,
  nom                   TEXT,
  quartier              TEXT,
  adresse               TEXT,
  price                 INTEGER,
  rating                NUMERIC,
  reviews_count         INTEGER,
  surface               public.surface_terrain,
  size                  public.taille_terrain,
  image_url             TEXT,
  lat                   NUMERIC,
  lng                   NUMERIC,
  capacite              INTEGER,
  boost_score           NUMERIC,
  boost_actif           BOOLEAN,
  reservations_recentes BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.nom, t.quartier, t.adresse, t.price, t.rating, t.reviews_count,
    t.surface, t.size, t.image_url, t.lat, t.lng, t.capacite,
    COALESCE(vb.score, 0)::NUMERIC AS boost_score,
    COALESCE(vb.score, 0) > 0 AS boost_actif,
    COALESCE(rr.nb, 0) AS reservations_recentes
  FROM public.terrains t
  LEFT JOIN LATERAL (
    SELECT
      b.budget_alloue * GREATEST(0, LEAST(1,
        (b.date_fin - CURRENT_DATE)::NUMERIC / GREATEST((b.date_fin - b.date_debut), 1)
      )) AS score
    FROM public.visibility_boosts b
    WHERE b.terrain_id = t.id
      AND b.statut = 'actif'
      AND b.date_debut IS NOT NULL AND b.date_fin IS NOT NULL
      AND CURRENT_DATE BETWEEN b.date_debut AND b.date_fin
    ORDER BY b.budget_alloue DESC
    LIMIT 1
  ) vb ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS nb
    FROM public.reservations r
    WHERE r.terrain_id = t.id
      AND r.statut IN ('confirmee', 'terminee')
      AND r.date_slot >= CURRENT_DATE - INTERVAL '30 days'
  ) rr ON true
  WHERE t.statut = 'actif' AND t.status = 'approved'
  ORDER BY boost_score DESC, t.rating DESC NULLS LAST, reservations_recentes DESC, t.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_terrains_populaires(INT) TO anon, authenticated;

-- ── Vue terrains_populaires (Tâche 2, nommage demandé) ─────────────────
-- Simple alias sur la fonction ci-dessus (limite par défaut généreuse ;
-- utiliser directement la fonction avec p_limit pour paginer).
CREATE OR REPLACE VIEW public.terrains_populaires AS
SELECT * FROM public.get_terrains_populaires(50);

GRANT SELECT ON public.terrains_populaires TO anon, authenticated;

-- ============================================================
-- Vérification post-migration (à exécuter manuellement, session anonyme
-- ou authentifiée joueur) :
-- SELECT * FROM public.terrains_populaires;
-- SELECT * FROM public.get_terrains_populaires(5);
-- -> doit renvoyer le/les terrain(s) réel(s) actif+approuvé, jamais les
--    terrains pending/rejected/inactifs d'autres gérants.
-- ============================================================
