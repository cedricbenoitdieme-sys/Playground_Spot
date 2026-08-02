-- ============================================================
-- Créneaux personnalisables par le gérant + garantie anti-chevauchement
-- ============================================================
-- Contexte : les créneaux affichés au joueur (BookingFlow.jsx, étape
-- "Créneau") sont déjà lus depuis public.creneaux via
-- fetchCreneauxDisponibles(terrainId, date) — ce n'est PAS une liste
-- statique côté frontend. Le vrai problème : rien ne PEUPLE cette table
-- automatiquement pour un terrain. Aujourd'hui, un gérant doit créer ses
-- créneaux à la main (créneau par créneau) ou via l'outil "génération en
-- masse" de GerantPlanning.jsx, qui ne fait qu'un INSERT ponctuel sur une
-- fenêtre de 30 jours — pas de config persistante, pas de renouvellement
-- automatique, et un nouveau terrain sans action du gérant reste
-- INRÉSERVABLE (aucun créneau, jamais).
--
-- 1) public.terrain_horaires : config récurrente persistante (jours de la
--    semaine + heure début/fin + intervalle), gérée par le gérant.
-- 2) public.generate_creneaux_from_horaires() : matérialise des lignes
--    public.creneaux à partir de cette config (ou d'une config par défaut
--    08h-23h/1h si le gérant n'a encore rien configuré).
-- 3) public.set_terrain_horaires() : endpoint gérant pour remplacer sa
--    config en un seul appel, avec backfill immédiat des 45 prochains jours.
-- 4) Cron quotidien : reconduit automatiquement une fenêtre glissante de
--    45 jours pour tous les terrains actifs, y compris ceux sans config
--    custom (fallback par défaut) — un terrain neuf est donc réservable
--    dès sa création, sans action du gérant.
-- 5) Contrainte anti-chevauchement réelle sur public.reservations (bug
--    confirmé en lisant create_reservation_safe : l'unique index actuel
--    ne protège que l'égalité exacte de heure_slot, pas le chevauchement
--    d'une réservation 2h avec un autre créneau qui commence dedans).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Config récurrente d'horaires par terrain
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.terrain_horaires (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id          UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  jour_semaine        INTEGER NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6), -- 0=dimanche ... 6=samedi (EXTRACT(DOW), même convention que GerantPlanning.jsx bulkDays)
  heure_debut         TIME NOT NULL,
  heure_fin           TIME NOT NULL,
  intervalle_minutes  INTEGER NOT NULL DEFAULT 60 CHECK (intervalle_minutes > 0),
  prix_override       INTEGER,
  actif               BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_horaires_heures CHECK (heure_fin > heure_debut)
);

CREATE INDEX IF NOT EXISTS idx_terrain_horaires_terrain ON public.terrain_horaires(terrain_id, jour_semaine);

ALTER TABLE public.terrain_horaires ENABLE ROW LEVEL SECURITY;

-- Même pattern que "creneaux_manage_gerant" (schema.sql) : lecture/écriture
-- réservées à l'admin et au gérant propriétaire du terrain.
DO $$ BEGIN
  CREATE POLICY "terrain_horaires_manage_gerant" ON public.terrain_horaires FOR ALL
    USING (
      public.get_my_role() = 'admin'
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid())
    )
    WITH CHECK (
      public.get_my_role() = 'admin'
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_terrain_horaires_updated_at
    BEFORE UPDATE ON public.terrain_horaires
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2) Génération des créneaux à partir de la config (avec fallback)
-- ------------------------------------------------------------
-- SECURITY DEFINER : nécessaire pour être appelable (a) par le gérant lui-
-- même juste après avoir sauvegardé sa config (auth.uid() = son id, la
-- vérification d'appartenance ci-dessous s'applique alors normalement) et
-- (b) par le job cron nocturne, hors contexte de requête HTTP donc sans
-- auth.uid() — dans ce 2e cas la vérification d'appartenance est
-- simplement sautée (IF auth.uid() IS NOT NULL).
CREATE OR REPLACE FUNCTION public.generate_creneaux_from_horaires(
  p_terrain_id  UUID,
  p_date_debut  DATE,
  p_date_fin    DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted    INTEGER := 0;
  v_rc          INTEGER;
  v_has_config  BOOLEAN;
  v_day         DATE;
  v_dow         INTEGER;
  v_slot        RECORD;
  v_heure       TIME;
BEGIN
  IF p_date_debut > p_date_fin THEN
    RAISE EXCEPTION 'p_date_debut doit être antérieure ou égale à p_date_fin';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.terrains WHERE id = p_terrain_id AND gerant_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Accès refusé : ce terrain ne vous appartient pas';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.terrain_horaires WHERE terrain_id = p_terrain_id AND actif
  ) INTO v_has_config;

  v_day := p_date_debut;
  WHILE v_day <= p_date_fin LOOP
    v_dow := EXTRACT(DOW FROM v_day)::INTEGER;

    IF v_has_config THEN
      -- Config gérant : une ou plusieurs plages actives pour ce jour de semaine.
      FOR v_slot IN
        SELECT heure_debut, heure_fin, intervalle_minutes, prix_override
        FROM public.terrain_horaires
        WHERE terrain_id = p_terrain_id AND jour_semaine = v_dow AND actif
      LOOP
        v_heure := v_slot.heure_debut;
        WHILE v_heure + (v_slot.intervalle_minutes || ' minutes')::INTERVAL <= v_slot.heure_fin LOOP
          INSERT INTO public.creneaux (terrain_id, date, heure_debut, heure_fin, prix_override, statut)
          VALUES (
            p_terrain_id, v_day, v_heure,
            v_heure + (v_slot.intervalle_minutes || ' minutes')::INTERVAL,
            v_slot.prix_override, 'disponible'
          )
          ON CONFLICT (terrain_id, date, heure_debut) DO NOTHING;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          v_inserted := v_inserted + v_rc;
          v_heure := v_heure + (v_slot.intervalle_minutes || ' minutes')::INTERVAL;
        END LOOP;
      END LOOP;
    ELSE
      -- Pas de config : fallback raisonnable 08:00-23:00 par tranches de 1h,
      -- tous les jours — ne bloque jamais un terrain existant ou nouveau.
      v_heure := TIME '08:00';
      WHILE v_heure + INTERVAL '1 hour' <= TIME '23:00' LOOP
        INSERT INTO public.creneaux (terrain_id, date, heure_debut, heure_fin, statut)
        VALUES (p_terrain_id, v_day, v_heure, v_heure + INTERVAL '1 hour', 'disponible')
        ON CONFLICT (terrain_id, date, heure_debut) DO NOTHING;
        GET DIAGNOSTICS v_rc = ROW_COUNT;
        v_inserted := v_inserted + v_rc;
        v_heure := v_heure + INTERVAL '1 hour';
      END LOOP;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_creneaux_from_horaires IS
  'Matérialise des lignes public.creneaux (statut disponible) pour un terrain sur [p_date_debut, p_date_fin] à partir de terrain_horaires, ou d''un fallback 08:00-23:00/1h si aucune config. Idempotent (ON CONFLICT DO NOTHING sur la contrainte UNIQUE existante de creneaux). Limitation connue : comme creneaux.heure_fin (TIME), pas de plage traversant minuit.';

GRANT EXECUTE ON FUNCTION public.generate_creneaux_from_horaires(UUID, DATE, DATE) TO authenticated;

-- ------------------------------------------------------------
-- 3) Endpoint gérant : remplacer sa config d'horaires en un appel
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_terrain_horaires(
  p_terrain_id UUID,
  p_horaires   JSONB  -- [{ "jour_semaine":1, "heure_debut":"08:00", "heure_fin":"22:00", "intervalle_minutes":60, "prix_override":null, "actif":true }, ...]
)
RETURNS SETOF public.terrain_horaires
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
BEGIN
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.terrains WHERE id = p_terrain_id AND gerant_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Accès refusé : ce terrain ne vous appartient pas';
  END IF;

  DELETE FROM public.terrain_horaires WHERE terrain_id = p_terrain_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_horaires, '[]'::jsonb))
  LOOP
    IF (v_item->>'jour_semaine')::INT NOT BETWEEN 0 AND 6 THEN
      RAISE EXCEPTION 'jour_semaine invalide : %', v_item->>'jour_semaine';
    END IF;
    IF (v_item->>'heure_fin')::TIME <= (v_item->>'heure_debut')::TIME THEN
      RAISE EXCEPTION 'heure_fin doit être après heure_debut (jour %)', v_item->>'jour_semaine';
    END IF;
    IF COALESCE((v_item->>'intervalle_minutes')::INT, 60) <= 0 THEN
      RAISE EXCEPTION 'intervalle_minutes doit être positif';
    END IF;

    INSERT INTO public.terrain_horaires (
      terrain_id, jour_semaine, heure_debut, heure_fin, intervalle_minutes, prix_override, actif
    ) VALUES (
      p_terrain_id,
      (v_item->>'jour_semaine')::INT,
      (v_item->>'heure_debut')::TIME,
      (v_item->>'heure_fin')::TIME,
      COALESCE((v_item->>'intervalle_minutes')::INT, 60),
      NULLIF(v_item->>'prix_override', '')::INT,
      COALESCE((v_item->>'actif')::BOOLEAN, true)
    );
  END LOOP;

  -- Backfill immédiat : le gérant voit l'effet de sa config tout de suite,
  -- sans attendre le cron nocturne.
  PERFORM public.generate_creneaux_from_horaires(p_terrain_id, CURRENT_DATE, CURRENT_DATE + 45);

  RETURN QUERY SELECT * FROM public.terrain_horaires WHERE terrain_id = p_terrain_id ORDER BY jour_semaine, heure_debut;
END;
$$;

COMMENT ON FUNCTION public.set_terrain_horaires IS
  'Remplace intégralement la config terrain_horaires d''un terrain (delete+insert atomique) et matérialise immédiatement les 45 prochains jours de creneaux. Endpoint gérant : supabase.rpc(''set_terrain_horaires'', { p_terrain_id, p_horaires }).';

GRANT EXECUTE ON FUNCTION public.set_terrain_horaires(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 4) Cron quotidien : fenêtre glissante de 45 jours, tous terrains actifs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_creneaux_all_terrains(p_horizon_days INTEGER DEFAULT 45)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terrain RECORD;
  v_total   INTEGER := 0;
BEGIN
  FOR v_terrain IN
    SELECT id FROM public.terrains WHERE statut = 'actif' AND status = 'approved'
  LOOP
    v_total := v_total + public.generate_creneaux_from_horaires(
      v_terrain.id, CURRENT_DATE, CURRENT_DATE + p_horizon_days
    );
  END LOOP;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.generate_creneaux_all_terrains IS
  'Appelée par le cron quotidien generate-creneaux-daily. Reconduit une fenêtre glissante de creneaux pour tous les terrains actifs/approuvés (config custom ou fallback). Pas exposée aux clients (pas de GRANT authenticated).';

-- pg_cron déjà utilisé dans ce projet (migration 20260722150000, job
-- 'expire-subscriptions-hourly') — même pattern ici.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('generate-creneaux-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'generate-creneaux-daily',
  '30 2 * * *',
  $$SELECT public.generate_creneaux_all_terrains(45);$$
);

-- ------------------------------------------------------------
-- 5) Anti-chevauchement réel sur public.reservations
-- ------------------------------------------------------------
-- Bug confirmé en lisant create_reservation_safe (migration 20260725170000) :
-- idx_reservations_no_double_booking est un UNIQUE index sur (terrain_id,
-- date_slot, heure_slot) — il empêche seulement de réserver EXACTEMENT le
-- même horaire de départ deux fois. Il ne protège PAS une réservation 2h
-- (duree_heures=2) qui chevauche un autre créneau démarrant à l'intérieur
-- de sa plage (ex: 18:00-20:00 et 19:00-20:00 sur le même terrain passent
-- toutes les deux aujourd'hui). Remplacé par une contrainte d'exclusion
-- sur plage horaire réelle (tsrange), qui gère nativement toute durée.

-- Pré-vérification bloquante : refuse de poser la contrainte s'il existe
-- déjà des réservations actives qui se chevauchent (même logique défensive
-- que idx_reservations_creneau_unique, migration 20260802160000).
DO $$
DECLARE
  v_overlaps INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_overlaps
  FROM public.reservations r1
  JOIN public.reservations r2
    ON r1.terrain_id = r2.terrain_id
   AND r1.id < r2.id
   AND r1.statut IN ('en_attente', 'confirmee', 'terminee')
   AND r2.statut IN ('en_attente', 'confirmee', 'terminee')
   AND tsrange(
         r1.date_slot + r1.heure_slot,
         r1.date_slot + r1.heure_slot + (r1.duree_heures || ' hours')::INTERVAL, '[)'
       )
       &&
       tsrange(
         r2.date_slot + r2.heure_slot,
         r2.date_slot + r2.heure_slot + (r2.duree_heures || ' hours')::INTERVAL, '[)'
       );

  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'Migration bloquée : % paire(s) de réservations actives se chevauchent déjà. Résoudre manuellement avant de poser la contrainte anti-chevauchement. Diagnostic : requête ci-dessus (r1.id, r2.id) sans le COUNT(*).', v_overlaps;
  END IF;
END $$;

-- Nécessaire pour EXCLUDE USING gist sur une colonne UUID (WITH =).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Fonction IMMUTABLE nécessaire pour la colonne générée et la contrainte d'exclusion (évite ERROR 42P17)
CREATE OR REPLACE FUNCTION public.reservation_plage(
  p_date DATE,
  p_heure TIME,
  p_duree INT
)
RETURNS tsrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT tsrange(
    p_date + p_heure,
    p_date + p_heure + (COALESCE(p_duree, 1) * INTERVAL '1 hour'),
    '[)'
  );
$$;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS plage tsrange
  GENERATED ALWAYS AS (public.reservation_plage(date_slot, heure_slot, duree_heures)) STORED;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS no_overlapping_reservations;

ALTER TABLE public.reservations
  ADD CONSTRAINT no_overlapping_reservations
  EXCLUDE USING gist (terrain_id WITH =, plage WITH &&)
  WHERE (statut IN ('en_attente', 'confirmee', 'terminee'));

-- Entièrement subsumé par la contrainte ci-dessus (toute égalité de
-- heure_slot à durée égale est aussi un chevauchement de plage).
DROP INDEX IF EXISTS idx_reservations_no_double_booking;

-- create_reservation_safe doit maintenant aussi intercepter la violation
-- de la contrainte d'exclusion (SQLSTATE 23P01), pas seulement 23505.
-- CREATE OR REPLACE avec signature strictement identique à la version en
-- place (migration 20260801160000) pour ne pas créer un second overload.
CREATE OR REPLACE FUNCTION public.create_reservation_safe(
  p_terrain_id UUID,
  p_joueur_id UUID,
  p_creneau_id UUID DEFAULT NULL,
  p_terrain_nom TEXT DEFAULT NULL,
  p_joueur_nom TEXT DEFAULT NULL,
  p_date_slot DATE DEFAULT NULL,
  p_heure_slot TIME DEFAULT NULL,
  p_montant INTEGER DEFAULT NULL,
  p_duree_heures INTEGER DEFAULT 1
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO public.reservations (
      terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom,
      date_slot, heure_slot, montant, duree_heures, statut
    ) VALUES (
      p_terrain_id, p_joueur_id, p_creneau_id, p_terrain_nom, p_joueur_nom,
      p_date_slot, p_heure_slot, p_montant, COALESCE(p_duree_heures, 1), 'en_attente'
    )
    RETURNING * INTO v_reservation;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce créneau vient d''être réservé' USING ERRCODE = '23505';
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Ce créneau chevauche une réservation déjà existante' USING ERRCODE = '23P01';
  END;

  RETURN v_reservation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reservation_safe(
  UUID, UUID, UUID, TEXT, TEXT, DATE, TIME, INTEGER, INTEGER
) TO authenticated;

-- ============================================================
-- Vérification post-migration :
--
-- SELECT public.generate_creneaux_from_horaires('<terrain_id>', CURRENT_DATE, CURRENT_DATE + 7);
-- SELECT * FROM public.creneaux WHERE terrain_id = '<terrain_id>' ORDER BY date, heure_debut;
--
-- SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'generate-creneaux-daily';
--
-- -- Chevauchement 2h (à exécuter avec un terrain_id/date de test) :
-- SELECT public.create_reservation_safe('<terrain_id>', auth.uid(), NULL, 'Test', 'Test', CURRENT_DATE + 1, '18:00', 15000, 2);
-- SELECT public.create_reservation_safe('<terrain_id>', auth.uid(), NULL, 'Test', 'Test', CURRENT_DATE + 1, '19:00', 15000, 1);
-- -- 2e appel -> ERROR: Ce créneau chevauche une réservation déjà existante
-- ============================================================
