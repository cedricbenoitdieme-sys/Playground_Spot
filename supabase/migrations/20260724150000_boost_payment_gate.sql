-- ============================================================
-- Migration : rend le Budget Visibilité payant (UnitechPay), au lieu
-- d'activer instantanément sans paiement.
--
-- Réutilise et étend `visibility_boosts` (migration 20260722150000)
-- plutôt que de créer une nouvelle table `boost_campaigns` — même
-- concept, éviter deux systèmes de boost parallèles. Correspondance
-- avec les noms demandés : budget_fcfa → budget_alloue,
-- status → statut ('pending'→'en_attente', 'active'→'actif',
-- 'expired'→'termine'), starts_at → date_debut, expires_at → date_fin.
--
-- SÉCURITÉ : `create_visibility_boost()` (RPC existant) créait un boost
-- directement 'actif', sans jamais vérifier de paiement — c'est LE bug
-- décrit dans cette tâche. Une fois le flow payant ci-dessous en place,
-- ce RPC devient un contournement total (n'importe quel gérant pourrait
-- l'appeler directement pour un boost gratuit). Il est supprimé dans
-- cette migration.
-- ============================================================

-- ── 1. Étendre visibility_boosts pour un flow pending → actif ───
DO $$ BEGIN
  ALTER TYPE public.statut_boost ADD VALUE IF NOT EXISTS 'en_attente';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.visibility_boosts
  ALTER COLUMN date_debut DROP NOT NULL,
  ALTER COLUMN date_debut DROP DEFAULT;
ALTER TABLE public.visibility_boosts
  ALTER COLUMN date_fin DROP NOT NULL;
ALTER TABLE public.visibility_boosts
  ADD COLUMN IF NOT EXISTS duree_jours INTEGER,
  ADD COLUMN IF NOT EXISTS unitech_reference TEXT UNIQUE;
-- Note : check_boost_dates (CHECK date_fin > date_debut) n'a pas besoin
-- d'être touchée — un CHECK constraint laisse toujours passer une ligne
-- où l'expression vaut NULL (donc les lignes 'en_attente' sans dates
-- encore connues ne le violent pas).

CREATE INDEX IF NOT EXISTS idx_visibility_boosts_gerant ON public.visibility_boosts(gerant_id);

-- Ancien RPC qui activait sans paiement — supprimé (voir note sécurité
-- en tête de fichier). Remplacé par create_pending_boost + activate_boost
-- ci-dessous.
DROP FUNCTION IF EXISTS public.create_visibility_boost(UUID, UUID, INTEGER, INTEGER);

-- ── 2. create_pending_boost — appelée par l'Edge Function create-payment ──
CREATE OR REPLACE FUNCTION public.create_pending_boost(
  p_gerant_id UUID,
  p_terrain_id UUID,
  p_montant INTEGER,
  p_duree_jours INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id TEXT;
  v_ref     TEXT;
  v_id      UUID;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_montant IS NULL OR p_montant < 500 THEN
    RAISE EXCEPTION 'Le budget alloué doit être d''au moins 500 FCFA';
  END IF;
  IF p_duree_jours IS NULL OR p_duree_jours <= 0 OR p_duree_jours > 90 THEN
    RAISE EXCEPTION 'La durée doit être comprise entre 1 et 90 jours';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.terrains WHERE id = p_terrain_id AND gerant_id = p_gerant_id) THEN
    RAISE EXCEPTION 'Ce terrain n''appartient pas à ce gérant';
  END IF;

  v_plan_id := (public._plan_limits_internal(p_gerant_id))->>'plan_id';
  IF v_plan_id = 'free' THEN
    RAISE EXCEPTION 'Le boost de visibilité est réservé aux plans payants (Starter, Pro, Entreprise)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.visibility_boosts
    WHERE terrain_id = p_terrain_id AND statut IN ('en_attente', 'actif')
  ) THEN
    RAISE EXCEPTION 'Un boost est déjà en attente ou actif pour ce terrain';
  END IF;

  v_ref := 'BOOST-' || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.visibility_boosts
    (gerant_id, terrain_id, budget_alloue, duree_jours, statut, unitech_reference)
  VALUES
    (p_gerant_id, p_terrain_id, p_montant, p_duree_jours, 'en_attente', v_ref)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'boost_id', v_id, 'unitech_reference', v_ref,
    'montant', p_montant, 'terrain_id', p_terrain_id, 'duree_jours', p_duree_jours
  );
END;
$$;

-- ── 3. activate_boost — appelée UNIQUEMENT par l'Edge Function
-- webhook-unitech, jamais directement par un client (même raisonnement
-- que activate_subscription : le contournement de paiement via un appel
-- RPC direct doit être impossible au niveau privilèges Postgres).
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_boost(
  p_unitech_reference TEXT,
  p_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_boost     public.visibility_boosts%ROWTYPE;
  v_new_debut DATE;
  v_new_fin   DATE;
BEGIN
  SELECT * INTO v_boost FROM public.visibility_boosts
  WHERE unitech_reference = p_unitech_reference AND statut = 'en_attente';

  IF NOT FOUND THEN
    RETURN json_build_object('handled', false, 'reason', 'no_pending_boost_for_reference');
  END IF;

  IF p_status NOT IN ('success', 'approved', 'completed', 'paid') THEN
    UPDATE public.visibility_boosts SET statut = 'annule', updated_at = NOW() WHERE id = v_boost.id;
    RETURN json_build_object('handled', true, 'boost_id', v_boost.id, 'statut', 'annule');
  END IF;

  v_new_debut := CURRENT_DATE;
  v_new_fin := CURRENT_DATE + v_boost.duree_jours;

  UPDATE public.visibility_boosts
  SET statut = 'actif', date_debut = v_new_debut, date_fin = v_new_fin, updated_at = NOW()
  WHERE id = v_boost.id;

  RETURN json_build_object(
    'handled', true, 'boost_id', v_boost.id, 'statut', 'actif',
    'date_debut', v_new_debut, 'date_fin', v_new_fin
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.activate_boost(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_boost(TEXT, TEXT) TO service_role;

-- ── 4. Expiration automatique (même défaut que "un boost expiré
-- resterait affiché comme actif" décrit dans la tâche 5) ──────────
CREATE OR REPLACE FUNCTION public.expire_visibility_boosts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.visibility_boosts
  SET statut = 'termine', updated_at = NOW()
  WHERE statut = 'actif' AND date_fin IS NOT NULL AND date_fin < CURRENT_DATE;
END;
$$;

DO $$ BEGIN
  PERFORM cron.unschedule('expire-visibility-boosts-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'expire-visibility-boosts-hourly',
  '0 * * * *',
  $$SELECT public.expire_visibility_boosts();$$
);

-- ── 5. get_boost_stats — ajoute un flag is_currently_active calculé
-- (statut='actif' ET date_fin pas encore passée), pour que l'affichage
-- ne se fie jamais au seul statut stocké (qui peut avoir jusqu'à 1h de
-- retard entre deux passages du cron ci-dessus).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_boost_stats(p_boost_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_boost         public.visibility_boosts%ROWTYPE;
  v_terrain_nom   TEXT;
  v_jours_ecoules INT;
  v_jours_totaux  INT;
BEGIN
  SELECT * INTO v_boost FROM public.visibility_boosts WHERE id = p_boost_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boost introuvable';
  END IF;

  IF v_boost.gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT nom INTO v_terrain_nom FROM public.terrains WHERE id = v_boost.terrain_id;
  v_jours_totaux := CASE WHEN v_boost.date_debut IS NOT NULL AND v_boost.date_fin IS NOT NULL
                     THEN v_boost.date_fin - v_boost.date_debut ELSE NULL END;
  v_jours_ecoules := CASE WHEN v_boost.date_debut IS NOT NULL
                     THEN LEAST(GREATEST(CURRENT_DATE - v_boost.date_debut, 0), COALESCE(v_jours_totaux, 0))
                     ELSE NULL END;

  RETURN json_build_object(
    'boost_id', v_boost.id,
    'terrain_id', v_boost.terrain_id,
    'terrain_nom', v_terrain_nom,
    'budget_alloue', v_boost.budget_alloue,
    'duree_jours', v_boost.duree_jours,
    'date_debut', v_boost.date_debut,
    'date_fin', v_boost.date_fin,
    'statut', v_boost.statut,
    'is_currently_active', v_boost.statut = 'actif' AND v_boost.date_fin IS NOT NULL AND v_boost.date_fin >= CURRENT_DATE,
    'vues_generees', v_boost.vues_generees,
    'jours_ecoules', v_jours_ecoules,
    'jours_totaux', v_jours_totaux,
    'cout_par_vue', CASE WHEN v_boost.vues_generees > 0
                      THEN ROUND(v_boost.budget_alloue::NUMERIC / v_boost.vues_generees, 2)
                      ELSE NULL END
  );
END;
$$;

-- ── 6. RLS (Tâche 4) : déjà correcte, confirmée ici sans changement ──
-- visibility_boosts_select_own_or_admin (migration 20260722150000) filtre
-- déjà sur gerant_id = auth.uid() OR is_super_admin(). Rien à ajouter.
