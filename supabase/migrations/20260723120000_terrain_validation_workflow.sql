-- ============================================================
-- Migration : workflow de validation admin pour les terrains créés
-- par les gérants (pending → approved/rejected).
--
-- `status` (nouveau, ce fichier) est DISTINCT de `statut` (existant,
-- schema.sql) : `statut` = état opérationnel (actif/inactif/en_maintenance,
-- gérable librement par le gérant propriétaire), `status` = validation
-- admin (pending/approved/rejected, verrouillé pour le gérant).
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.statut_validation_terrain AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.terrains
  ADD COLUMN IF NOT EXISTS status public.statut_validation_terrain NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$ BEGIN
  ALTER TABLE public.terrains
    ADD CONSTRAINT check_rejection_reason_only_if_rejected
    CHECK (status = 'rejected' OR rejection_reason IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- RLS — SELECT : remplace la policy existante, qui laissait aujourd'hui
-- N'IMPORTE QUEL gérant voir TOUS les terrains (de tous les gérants),
-- quel que soit leur statut. Corrigé ici : un gérant ne voit que les
-- siens (tout statut confondu, pour "Mon Terrain"), le public/joueur ne
-- voit que les terrains approuvés ET actifs, l'admin voit tout.
-- ============================================================
DROP POLICY IF EXISTS "terrains_select_all" ON public.terrains;
CREATE POLICY "terrains_select_all" ON public.terrains FOR SELECT USING (
  (statut = 'actif' AND status = 'approved')
  OR public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'gerant' AND gerant_id = auth.uid())
);

-- ============================================================
-- RLS — INSERT : la policy admin existante (terrains_insert_admin) reste
-- inchangée. Nouvelle policy pour permettre au gérant de créer SON propre
-- terrain, mais jamais directement approuvé.
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "terrains_insert_gerant_self" ON public.terrains FOR INSERT
    WITH CHECK (
      public.get_my_role() = 'gerant'
      AND gerant_id = auth.uid()
      AND status = 'pending'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- RLS — UPDATE : même USING qu'avant (admin, ou gérant propriétaire),
-- mais WITH CHECK ajouté pour verrouiller status/rejection_reason côté
-- gérant — même schéma que profiles_update_self (verrouillage
-- role/statut) et reservations_update_gerant (verrouillage joueur_id).
-- ============================================================
DROP POLICY IF EXISTS "terrains_update_admin_gerant" ON public.terrains;
CREATE POLICY "terrains_update_admin_gerant" ON public.terrains FOR UPDATE
  USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'gerant' AND gerant_id = auth.uid()))
  WITH CHECK (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'gerant' AND gerant_id = auth.uid()
      AND status = (SELECT t.status FROM public.terrains t WHERE t.id = terrains.id)
      AND rejection_reason IS NOT DISTINCT FROM (SELECT t.rejection_reason FROM public.terrains t WHERE t.id = terrains.id)
    )
  );

-- ============================================================
-- RPC admin_review_terrain — approuve/refuse un terrain. Distinct de
-- admin_update_terrain_status (existant, gère statut opérationnel
-- actif/inactif/en_maintenance, pas touché ici).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_review_terrain(
  p_terrain_id UUID,
  p_decision public.statut_validation_terrain,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle admin requis';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Décision invalide : % (attendu approved ou rejected)', p_decision;
  END IF;

  IF p_decision = 'rejected' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Un motif de refus est requis';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.terrains WHERE id = p_terrain_id) THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  UPDATE public.terrains
  SET status = p_decision,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_terrain_id;

  PERFORM public.log_admin_action(
    'admin_review_terrain', 'terrain', p_terrain_id,
    jsonb_build_object('decision', p_decision, 'rejection_reason', p_rejection_reason)
  );

  RETURN json_build_object('success', true, 'terrain_id', p_terrain_id, 'status', p_decision);
END;
$$;

-- Extension de admin_list_terrains (existant) pour exposer status/
-- rejection_reason et permettre de filtrer sur la file d'attente.
CREATE OR REPLACE FUNCTION public.admin_list_terrains(
  p_search      TEXT DEFAULT NULL,
  p_zone        TEXT DEFAULT NULL,
  p_statut      statut_terrain DEFAULT NULL,
  p_page        INT DEFAULT 1,
  p_page_size   INT DEFAULT 20,
  p_status_validation public.statut_validation_terrain DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_offset INT := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
  v_limit  INT := GREATEST(p_page_size, 1);
  v_total  BIGINT;
  v_items  JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.terrains t
  WHERE (p_search IS NULL OR t.nom ILIKE '%' || p_search || '%')
    AND (p_zone IS NULL OR t.quartier = p_zone)
    AND (p_statut IS NULL OR t.statut = p_statut)
    AND (p_status_validation IS NULL OR t.status = p_status_validation);

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_items
  FROM (
    SELECT
      t.id, t.nom, t.quartier, t.adresse, t.price, t.rating, t.reviews_count,
      t.surface, t.size, t.statut, t.status, t.rejection_reason, t.lat, t.lng, t.capacite,
      CASE WHEN t.image_url IS NOT NULL THEN 1 ELSE 0 END AS nb_photos,
      t.gerant_id, p.nom AS gerant_nom,
      t.created_at, t.updated_at
    FROM public.terrains t
    LEFT JOIN public.profiles p ON p.id = t.gerant_id
    WHERE (p_search IS NULL OR t.nom ILIKE '%' || p_search || '%')
      AND (p_zone IS NULL OR t.quartier = p_zone)
      AND (p_statut IS NULL OR t.statut = p_statut)
      AND (p_status_validation IS NULL OR t.status = p_status_validation)
    ORDER BY (t.status = 'pending') DESC, t.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN json_build_object('items', v_items, 'total_count', v_total, 'page', p_page, 'page_size', v_limit);
END;
$$;

-- ============================================================
-- Vue publique de découverte : filtre désormais explicitement sur
-- status='approved' (en plus de statut='actif'), directement dans la
-- vue — pas seulement via RLS — pour rester correcte même si la vue
-- est un jour interrogée avec des privilèges élevés.
-- ============================================================
DROP VIEW IF EXISTS public.v_terrains_discovery;
CREATE VIEW public.v_terrains_discovery AS
SELECT
  t.*,
  COALESCE(vb.budget_alloue, 0) AS boost_weight,
  (vb.id IS NOT NULL) AS boost_actif
FROM public.terrains t
LEFT JOIN LATERAL (
  SELECT id, budget_alloue FROM public.visibility_boosts b
  WHERE b.terrain_id = t.id AND b.statut = 'actif' AND CURRENT_DATE BETWEEN b.date_debut AND b.date_fin
  ORDER BY b.budget_alloue DESC LIMIT 1
) vb ON true
WHERE t.statut = 'actif' AND t.status = 'approved';

-- ============================================================
-- Table notifications (Tâche 4) — persistée (pas seulement Realtime),
-- pour qu'un admin voie la file d'attente même hors ligne au moment de
-- la création, et qu'un gérant garde le motif de refus affiché.
-- Realtime peut être activé dessus côté Dashboard (Database → Replication)
-- sans changement de schéma, pour du push en plus de la persistance.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  resource_type TEXT,
  resource_id   UUID,
  read          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notifications_select_own_or_admin" ON public.notifications
    FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seul le champ `read` est modifiable par le destinataire (marquer comme
-- lu) ; le contenu (type/title/body/resource_*) reste verrouillé, il n'est
-- écrit que par les triggers SECURITY DEFINER ci-dessous.
DO $$ BEGIN
  CREATE POLICY "notifications_update_own_read_only" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (
      user_id = auth.uid()
      AND type = (SELECT n.type FROM public.notifications n WHERE n.id = notifications.id)
      AND title = (SELECT n.title FROM public.notifications n WHERE n.id = notifications.id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notifie tous les admins à la création d'un terrain en attente.
CREATE OR REPLACE FUNCTION public.notify_admins_new_terrain_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
    SELECT p.id, 'terrain_pending_review', 'Nouveau terrain à valider',
           NEW.nom || ' (' || NEW.quartier || ') attend une validation', 'terrain', NEW.id
    FROM public.profiles p WHERE p.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_notify_admins_new_terrain
    AFTER INSERT ON public.terrains
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_terrain_pending();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notifie le gérant à l'approbation/rejet — sur trigger UPDATE (pas
-- seulement dans admin_review_terrain) pour rester robuste même en cas
-- de modification directe par un admin hors RPC.
CREATE OR REPLACE FUNCTION public.notify_gerant_terrain_reviewed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved', 'rejected')
     AND NEW.gerant_id IS NOT NULL
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
    VALUES (
      NEW.gerant_id,
      CASE NEW.status WHEN 'approved' THEN 'terrain_approved' ELSE 'terrain_rejected' END,
      CASE NEW.status WHEN 'approved' THEN 'Terrain validé' ELSE 'Terrain refusé' END,
      CASE NEW.status
        WHEN 'approved' THEN NEW.nom || ' est maintenant visible publiquement.'
        ELSE COALESCE('Motif : ' || NEW.rejection_reason, 'Votre terrain a été refusé.')
      END,
      'terrain', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_notify_gerant_terrain_reviewed
    AFTER UPDATE ON public.terrains
    FOR EACH ROW EXECUTE FUNCTION public.notify_gerant_terrain_reviewed();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
