-- ============================================================
-- Vrais favoris joueur + compteur de réservations fiable par terrain
-- ============================================================
-- PROBLÈME 1 (favoris) — diagnostic : il n'existe AUCUNE table de favoris
-- nulle part dans ce projet (vérifié : aucune occurrence dans schema.sql
-- ni dans aucune migration). "Mes Favoris" (src/pages/JoueurFavoris.jsx)
-- n'a jamais été branché sur une vraie fonctionnalité — il appelle
-- fetchTopTerrains(2) (top terrains de la PLATEFORME par note) et les
-- affiche comme si c'était les favoris du joueur (commentaire explicite
-- dans le code : "TODO: remplacer par une vraie table favoris quand elle
-- existe"). Les icônes cœur dans JoueurFavoris.jsx et JoueurHome.jsx sont
-- purement décoratives (toujours rouges/remplies, aucun onClick). "Drix
-- terrain" n'a donc pas été "auto-ajouté" par un trigger ou une donnée de
-- seed — il apparaît simplement parce qu'il fait partie des terrains les
-- mieux notés parmi le petit nombre de terrains actifs actuellement en
-- base. Rien à nettoyer : aucune ligne de favoris fictive n'existe nulle
-- part puisque la table elle-même n'a jamais existé.
--
-- PROBLÈME 2 (note/réservations fictives) — diagnostic : `terrains.rating`
-- et `terrains.reviews_count` sont DÉJÀ calculés correctement et en temps
-- réel par un trigger existant (update_terrain_rating(), schema.sql lignes
-- 230-245) — c'est le "0★" vu sur Découverte qui est juste, pas un bug.
-- Le "4.9★" et "34 réservations" vus sur Favoris sont des valeurs 100%
-- codées en dur dans JoueurFavoris.jsx (`<span>4.9</span>` littéral, et
-- `bookings: [34, 28][i] || 20`) — jamais lues depuis la base. Audité
-- (recherche de toute note ">4.x" codée en dur dans tout src/) : c'est la
-- SEULE occurrence dans tout le projet. Aucune autre page n'a ce problème
-- de note fictive.
--
-- Il manque en revanche un vrai compteur de réservations "à vie" par
-- terrain (TopTerrains.jsx en a déjà un, mais volontairement différent :
-- get_terrains_populaires() calcule des réservations des 30 derniers
-- jours, pour un classement "tendance" — pas le même besoin qu'un total
-- affiché sur une fiche/carte terrain). Ajouté ci-dessous en suivant
-- EXACTEMENT le même pattern que rating/reviews_count (colonne
-- dénormalisée + trigger) plutôt que de laisser chaque écran recalculer
-- son propre COUNT — c'est ce qui garantit qu'aucune divergence entre
-- écrans n'est possible (une seule colonne, lue partout).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Vraie table de favoris
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favoris (
  joueur_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terrain_id  UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (joueur_id, terrain_id)
);

CREATE INDEX IF NOT EXISTS idx_favoris_joueur ON public.favoris(joueur_id);

ALTER TABLE public.favoris ENABLE ROW LEVEL SECURITY;

-- Un joueur ne gère que ses propres favoris (lecture/ajout/suppression) —
-- table simple, pas besoin de RPC : le frontend fait des
-- insert/delete/select directs, comme pour public.creneaux ailleurs dans
-- ce projet.
DO $$ BEGIN
  CREATE POLICY "favoris_manage_own" ON public.favoris FOR ALL
    USING (joueur_id = auth.uid())
    WITH CHECK (joueur_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2) Compteur de réservations "à vie" par terrain (dénormalisé, comme
--    rating/reviews_count)
-- ------------------------------------------------------------
ALTER TABLE public.terrains
  ADD COLUMN IF NOT EXISTS reservations_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_terrain_reservations_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.terrains
  SET reservations_count = (
    SELECT COUNT(*) FROM public.reservations
    WHERE terrain_id = COALESCE(NEW.terrain_id, OLD.terrain_id)
      AND statut IN ('confirmee', 'terminee')
  )
  WHERE id = COALESCE(NEW.terrain_id, OLD.terrain_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_update_terrain_reservations_count
    AFTER INSERT OR UPDATE OR DELETE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.update_terrain_reservations_count();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill : les terrains existants ont déjà un historique de réservations
-- (contrairement aux favoris, qui n'ont jamais existé) — ce compteur doit
-- refléter ce passé dès l'application de la migration, pas repartir de 0.
UPDATE public.terrains t
SET reservations_count = (
  SELECT COUNT(*) FROM public.reservations r
  WHERE r.terrain_id = t.id AND r.statut IN ('confirmee', 'terminee')
);

-- ============================================================
-- Vérification post-migration :
--
-- SELECT id, nom, rating, reviews_count, reservations_count FROM public.terrains ORDER BY nom;
-- -- -> reservations_count reflète le vrai historique, jamais 0 par défaut
-- --    pour un terrain qui a déjà des réservations confirmées/terminées.
--
-- SELECT * FROM public.favoris;
-- -- -> vide (table neuve, personne n'a encore cliqué sur un cœur réel).
--
-- -- En tant que joueur connecté, tester le toggle :
-- INSERT INTO public.favoris (joueur_id, terrain_id) VALUES (auth.uid(), '<terrain_id>');
-- DELETE FROM public.favoris WHERE joueur_id = auth.uid() AND terrain_id = '<terrain_id>';
-- ============================================================
