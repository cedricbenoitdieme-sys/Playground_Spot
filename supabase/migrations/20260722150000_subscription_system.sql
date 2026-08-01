-- ============================================================
-- Migration : Système d'abonnement gérants (Free/Starter/Pro/Entreprise)
-- + Budget Visibilité
--
-- Décision de conception : la migration 20260721120000 avait créé
-- `abonnements` / `abonnement_paliers` (statuts essai/actif/en_retard/expire,
-- sans quotas ni verrouillage de commission). Ces deux tables sont TOUJOURS
-- VIDES en prod (0 ligne, cf. supabase/PROD_DATA_AUDIT.md) et leur schéma ne
-- correspond plus à la spec ci-dessous (statuts pending/active/expired/
-- suspended/revoked, quotas, commission verrouillée par transaction). Comme
-- il n'y a aucune donnée à perdre, on les remplace proprement par
-- `plan_limits` / `subscriptions` plutôt que de faire cohabiter deux
-- systèmes d'abonnement concurrents. `admin_list_subscriptions` est
-- réécrite en conséquence à la fin de ce fichier ; `admin_get_commission_summary`
-- n'est PAS touchée ici (elle utilise encore le taux plateforme unique de
-- `system_settings.commission_plateforme`, distinct du taux par plan
-- introduit ici — à unifier plus tard si besoin).
-- ============================================================

DROP TABLE IF EXISTS public.abonnements CASCADE;
DROP TABLE IF EXISTS public.abonnement_paliers CASCADE;
DROP TYPE IF EXISTS public.statut_abonnement CASCADE;

-- ============================================================
-- 1. TABLE : plan_limits
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_id               TEXT PRIMARY KEY,
  nom                   TEXT NOT NULL,
  prix_mensuel          INTEGER NOT NULL CHECK (prix_mensuel >= 0),
  prix_annuel           INTEGER CHECK (prix_annuel IS NULL OR prix_annuel >= 0),
  max_terrains          INTEGER CHECK (max_terrains IS NULL OR max_terrains > 0),        -- NULL = illimité
  max_reservations_mois INTEGER CHECK (max_reservations_mois IS NULL OR max_reservations_mois > 0), -- NULL = illimité
  commission_rate       NUMERIC(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  pdf_export            BOOLEAN NOT NULL DEFAULT false,
  dashboard_avance      BOOLEAN NOT NULL DEFAULT false,
  multi_sites           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER trg_plan_limits_updated_at BEFORE UPDATE ON public.plan_limits FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Valeurs exactes de la grille tarifaire. pdf_export / dashboard_avance / multi_sites
-- ne sont pas chiffrées dans le brief (seuls terrains/commission le sont) : valeurs
-- choisies par cohérence produit (multi_sites=true uniquement pour Entreprise, comme
-- explicitement demandé ; pdf_export/dashboard_avance progressifs par palier) —
-- à ajuster si le produit décide autrement, ce sont de simples UPDATE.
INSERT INTO public.plan_limits (plan_id, nom, prix_mensuel, prix_annuel, max_terrains, max_reservations_mois, commission_rate, pdf_export, dashboard_avance, multi_sites) VALUES
  ('free',       'Free',       0,     NULL,   1,    20,   12.00, false, false, false),
  ('starter',    'Starter',    4900,  NULL,   3,    NULL, 8.00,  true,  false, false),
  ('pro',        'Pro',        9900,  89100,  NULL, NULL, 2.00,  true,  true,  false),
  ('entreprise', 'Entreprise', 24900, 224100, NULL, NULL, 0.00,  true,  true,  true)
ON CONFLICT (plan_id) DO UPDATE SET
  nom = EXCLUDED.nom,
  prix_mensuel = EXCLUDED.prix_mensuel,
  prix_annuel = EXCLUDED.prix_annuel,
  max_terrains = EXCLUDED.max_terrains,
  max_reservations_mois = EXCLUDED.max_reservations_mois,
  commission_rate = EXCLUDED.commission_rate,
  pdf_export = EXCLUDED.pdf_export,
  dashboard_avance = EXCLUDED.dashboard_avance,
  multi_sites = EXCLUDED.multi_sites;

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "plan_limits_select_all" ON public.plan_limits FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE/DELETE pour authenticated/anon : seul service_role
-- (migrations) modifie la grille tarifaire.

-- ============================================================
-- 2. TABLE : subscriptions (gérants)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.cycle_facturation AS ENUM ('mensuel', 'annuel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.statut_abonnement_gerant AS ENUM ('pending', 'active', 'expired', 'suspended', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gerant_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL REFERENCES public.plan_limits(plan_id) ON DELETE RESTRICT,
  cycle             public.cycle_facturation,             -- NULL pour le plan Free
  status            public.statut_abonnement_gerant NOT NULL DEFAULT 'pending',
  date_debut        DATE,
  date_fin          DATE,                                  -- NULL = indéfini (Free, lifetime admin)
  unitech_reference TEXT UNIQUE,
  phone_number      TEXT,
  essai_utilise     BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Au plus UN abonnement 'active' et UN 'pending' par gérant à la fois ;
-- l'historique (expired/suspended/revoked) s'accumule sans contrainte.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_gerant ON public.subscriptions(gerant_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_subscription_per_gerant ON public.subscriptions(gerant_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_subscriptions_gerant ON public.subscriptions(gerant_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "subscriptions_select_own_or_admin" ON public.subscriptions
    FOR SELECT USING (gerant_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Volontairement AUCUNE policy INSERT/UPDATE/DELETE pour authenticated/anon :
-- toute écriture passe soit par service_role (Edge Function webhook-unitech,
-- cron expire_subscriptions), soit par la RPC create_pending_subscription
-- ci-dessous, qui vérifie explicitement l'identité de l'appelant et ne permet
-- de créer qu'une ligne 'pending' pour soi-même — jamais de changement direct
-- de statut par le gérant (Tâche 3).

-- ============================================================
-- 3. Attribution automatique (Tâche 4) : extension de handle_new_user()
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role public.role_utilisateur;
BEGIN
  v_role := CASE COALESCE(NEW.raw_user_meta_data->>'role', '')
    WHEN 'admin' THEN 'admin'::public.role_utilisateur
    WHEN 'gerant' THEN 'gerant'::public.role_utilisateur
    ELSE 'joueur'::public.role_utilisateur
  END;

  INSERT INTO public.profiles (id, nom, email, role, quartier, tel)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role,
    NEW.raw_user_meta_data->>'quartier',
    NEW.raw_user_meta_data->>'tel'
  )
  ON CONFLICT (id) DO UPDATE SET
    nom = EXCLUDED.nom,
    role = EXCLUDED.role,
    quartier = EXCLUDED.quartier,
    tel = EXCLUDED.tel;

  -- Nouveau gérant → Free automatique, durée indéfinie. Jamais pour un joueur.
  IF v_role = 'gerant' THEN
    INSERT INTO public.subscriptions (gerant_id, plan_id, status, date_debut, date_fin)
    VALUES (NEW.id, 'free', 'active', CURRENT_DATE, NULL)
    ON CONFLICT (gerant_id) WHERE status = 'active' DO NOTHING;
  -- Nouveau super_admin → Entreprise annuel lifetime gratuit automatique.
  ELSIF v_role = 'admin' THEN
    INSERT INTO public.subscriptions (gerant_id, plan_id, cycle, status, date_debut, date_fin, unitech_reference)
    VALUES (NEW.id, 'entreprise', 'annuel', 'active', CURRENT_DATE, NULL, 'LIFETIME_ADMIN_GRANT')
    ON CONFLICT (gerant_id) WHERE status = 'active' DO NOTHING;
  END IF;

  RETURN NEW;
END;
-- SECURITY DEFINER justifié (inchangé depuis schema.sql) : doit insérer dans
-- public.profiles et désormais public.subscriptions lors de l'inscription,
-- avant que l'utilisateur n'ait de profil RLS. N'accepte que des données
-- dérivées de auth.users (trigger), jamais d'input direct d'un appelant.
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Fonctions SQL (Tâche 2)
-- ============================================================

-- Helper interne SANS vérification d'auth (usage exclusif par d'autres
-- fonctions SECURITY DEFINER : calculate_commission, create_visibility_boost).
-- EXECUTE révoqué de PUBLIC pour empêcher un appel RPC direct par un client
-- qui voudrait lire le plan d'un AUTRE gérant.
CREATE OR REPLACE FUNCTION public._plan_limits_internal(p_gerant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'subscription_id', s.id, 'plan_id', pl.plan_id, 'plan_nom', pl.nom,
    'cycle', s.cycle, 'status', s.status, 'date_debut', s.date_debut, 'date_fin', s.date_fin,
    'max_terrains', pl.max_terrains, 'max_reservations_mois', pl.max_reservations_mois,
    'commission_rate', pl.commission_rate, 'pdf_export', pl.pdf_export,
    'dashboard_avance', pl.dashboard_avance, 'multi_sites', pl.multi_sites
  ) INTO v_result
  FROM public.subscriptions s
  JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
  WHERE s.gerant_id = p_gerant_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_result IS NULL THEN
    -- Filet de sécurité : ne devrait pas arriver (tout gérant reçoit un
    -- abonnement Free via handle_new_user) → retombe sur Free.
    SELECT json_build_object(
      'subscription_id', NULL, 'plan_id', pl.plan_id, 'plan_nom', pl.nom,
      'cycle', NULL, 'status', 'active', 'date_debut', NULL, 'date_fin', NULL,
      'max_terrains', pl.max_terrains, 'max_reservations_mois', pl.max_reservations_mois,
      'commission_rate', pl.commission_rate, 'pdf_export', pl.pdf_export,
      'dashboard_avance', pl.dashboard_avance, 'multi_sites', pl.multi_sites
    ) INTO v_result
    FROM public.plan_limits pl WHERE pl.plan_id = 'free';
  END IF;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._plan_limits_internal(UUID) FROM PUBLIC;

-- get_user_plan_and_limits(user_id) — RPC publique, auto-lecture ou admin uniquement.
CREATE OR REPLACE FUNCTION public.get_user_plan_and_limits(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN public._plan_limits_internal(p_user_id);
END;
$$;

-- check_quota(user_id, quota_type) — quota_type IN ('terrains', 'reservations').
CREATE OR REPLACE FUNCTION public.check_quota(p_user_id UUID, p_quota_type TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_limit INT;
  v_used  INT;
  v_plan  JSON;
BEGIN
  IF p_user_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_quota_type NOT IN ('terrains', 'reservations') THEN
    RAISE EXCEPTION 'Type de quota invalide : % (attendu terrains ou reservations)', p_quota_type;
  END IF;

  v_plan := public._plan_limits_internal(p_user_id);

  IF p_quota_type = 'terrains' THEN
    v_limit := (v_plan->>'max_terrains')::INT;
    SELECT COUNT(*) INTO v_used FROM public.terrains WHERE gerant_id = p_user_id;
  ELSE
    v_limit := (v_plan->>'max_reservations_mois')::INT;
    SELECT COUNT(*) INTO v_used
    FROM public.reservations r
    JOIN public.terrains t ON t.id = r.terrain_id
    WHERE t.gerant_id = p_user_id
      AND r.statut IN ('en_attente', 'confirmee', 'terminee')
      AND r.date_slot >= date_trunc('month', CURRENT_DATE)::DATE;
  END IF;

  RETURN json_build_object(
    'quota_type', p_quota_type,
    'limite', v_limit,
    'utilise', v_used,
    'illimite', v_limit IS NULL,
    'quota_atteint', v_limit IS NOT NULL AND v_used >= v_limit
  );
END;
$$;

-- Colonnes de verrouillage de commission sur paiements (Tâche 2, calculate_commission).
ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS commission_rate_applique NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_montant INTEGER;

-- calculate_commission(reservation_id) — verrouille le taux à la PREMIÈRE
-- exécution (jamais recalculé ensuite, même si le gérant change de plan).
CREATE OR REPLACE FUNCTION public.calculate_commission(p_reservation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_paiement  public.paiements%ROWTYPE;
  v_gerant_id UUID;
  v_rate      NUMERIC(5,2);
  v_montant   INTEGER;
BEGIN
  SELECT * INTO v_paiement FROM public.paiements WHERE reservation_id = p_reservation_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun paiement trouvé pour la réservation %', p_reservation_id;
  END IF;

  IF v_paiement.commission_rate_applique IS NOT NULL THEN
    RETURN json_build_object(
      'reservation_id', p_reservation_id,
      'commission_rate', v_paiement.commission_rate_applique,
      'commission_montant', v_paiement.commission_montant,
      'deja_verrouille', true
    );
  END IF;

  SELECT t.gerant_id INTO v_gerant_id
  FROM public.reservations r JOIN public.terrains t ON t.id = r.terrain_id
  WHERE r.id = p_reservation_id;

  IF v_gerant_id IS NULL THEN
    RAISE EXCEPTION 'Terrain/gérant introuvable pour la réservation %', p_reservation_id;
  END IF;

  v_rate := ((public._plan_limits_internal(v_gerant_id))->>'commission_rate')::NUMERIC(5,2);
  v_montant := ROUND(v_paiement.montant * v_rate / 100);

  UPDATE public.paiements
  SET commission_rate_applique = v_rate, commission_montant = v_montant
  WHERE id = v_paiement.id;

  RETURN json_build_object(
    'reservation_id', p_reservation_id,
    'commission_rate', v_rate,
    'commission_montant', v_montant,
    'deja_verrouille', false
  );
END;
$$;

-- ============================================================
-- 5. Rate limiting générique (Tâche 7 : 5 tentatives/10min)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits(identifier, action, created_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy : table interne, accessible uniquement via service_role
-- (bypass RLS) ou via check_rate_limit() en SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INT,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.rate_limits
  WHERE identifier = p_identifier AND action = p_action AND created_at >= NOW() - p_window;

  IF v_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limits (identifier, action) VALUES (p_identifier, p_action);
  RETURN true;
END;
$$;

-- ============================================================
-- 6. create_pending_subscription — appelée par l'Edge Function create-payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_pending_subscription(
  p_gerant_id UUID,
  p_plan_id TEXT,
  p_cycle public.cycle_facturation,
  p_phone_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan public.plan_limits%ROWTYPE;
  v_montant INTEGER;
  v_ref TEXT;
  v_id UUID;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_gerant_id AND role = 'gerant') THEN
    RAISE EXCEPTION 'Seuls les gérants peuvent souscrire à un abonnement';
  END IF;

  SELECT * INTO v_plan FROM public.plan_limits WHERE plan_id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan inconnu : %', p_plan_id;
  END IF;

  IF p_plan_id = 'free' THEN
    RAISE EXCEPTION 'Le plan Free ne nécessite aucun paiement';
  END IF;

  IF p_cycle IS NULL THEN
    RAISE EXCEPTION 'Cycle (mensuel/annuel) requis pour un plan payant';
  END IF;

  IF p_cycle = 'annuel' AND v_plan.prix_annuel IS NULL THEN
    RAISE EXCEPTION 'Le plan % ne propose pas de cycle annuel', p_plan_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE gerant_id = p_gerant_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Une souscription est déjà en attente de paiement pour ce gérant';
  END IF;

  v_montant := CASE p_cycle WHEN 'annuel' THEN v_plan.prix_annuel ELSE v_plan.prix_mensuel END;
  v_ref := 'SUB-' || replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO public.subscriptions (gerant_id, plan_id, cycle, status, unitech_reference, phone_number)
  VALUES (p_gerant_id, p_plan_id, p_cycle, 'pending', v_ref, p_phone_number)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'subscription_id', v_id, 'unitech_reference', v_ref,
    'montant', v_montant, 'plan_id', p_plan_id, 'cycle', p_cycle
  );
END;
$$;

-- ============================================================
-- 7. activate_subscription — appelée UNIQUEMENT par l'Edge Function
-- webhook-unitech (après vérification HMAC), jamais directement par un
-- client. EXECUTE révoqué de PUBLIC : le contournement de paiement via un
-- appel RPC direct (même avec une référence devinée) doit être impossible
-- au niveau privilèges Postgres, pas seulement via un check applicatif.
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_unitech_reference TEXT,
  p_status TEXT,
  p_phone_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub             public.subscriptions%ROWTYPE;
  v_prev_active     public.subscriptions%ROWTYPE;
  v_had_paid_before BOOLEAN;
  v_new_debut       DATE;
  v_new_fin         DATE;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE unitech_reference = p_unitech_reference AND status = 'pending';

  IF NOT FOUND THEN
    -- Idempotence stricte : référence inconnue OU déjà traitée. Jamais de
    -- réactivation d'un abonnement suspendu/révoqué/déjà actif (Tâche 8).
    RETURN json_build_object('handled', false, 'reason', 'no_pending_subscription_for_reference');
  END IF;

  IF p_status NOT IN ('success', 'approved', 'completed', 'paid') THEN
    UPDATE public.subscriptions SET status = 'revoked', updated_at = NOW() WHERE id = v_sub.id;
    RETURN json_build_object('handled', true, 'subscription_id', v_sub.id, 'status', 'revoked');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE gerant_id = v_sub.gerant_id AND plan_id <> 'free' AND status IN ('active', 'expired')
  ) INTO v_had_paid_before;

  SELECT * INTO v_prev_active FROM public.subscriptions
  WHERE gerant_id = v_sub.gerant_id AND status = 'active' AND id <> v_sub.id;

  IF FOUND AND v_prev_active.date_fin IS NOT NULL AND v_prev_active.date_fin > CURRENT_DATE THEN
    v_new_debut := v_prev_active.date_fin; -- prolonge un abonnement actif existant
  ELSE
    v_new_debut := CURRENT_DATE;
  END IF;

  v_new_fin := CASE v_sub.cycle
    WHEN 'annuel' THEN (v_new_debut + INTERVAL '1 year')::DATE
    ELSE (v_new_debut + INTERVAL '1 month')::DATE
  END;

  -- L'ancien abonnement actif (autre plan, ex: Free) est supplanté.
  UPDATE public.subscriptions SET status = 'expired', updated_at = NOW()
  WHERE gerant_id = v_sub.gerant_id AND status = 'active' AND id <> v_sub.id;

  UPDATE public.subscriptions
  SET status = 'active',
      date_debut = v_new_debut,
      date_fin = v_new_fin,
      phone_number = p_phone_number,
      essai_utilise = essai_utilise OR NOT v_had_paid_before,
      updated_at = NOW()
  WHERE id = v_sub.id;

  RETURN json_build_object(
    'handled', true, 'subscription_id', v_sub.id, 'status', 'active',
    'date_debut', v_new_debut, 'date_fin', v_new_fin
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_subscription(TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- 8. Cron expire_subscriptions (Tâche 5)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  WITH just_expired AS (
    UPDATE public.subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' AND date_fin IS NOT NULL AND date_fin < CURRENT_DATE
    RETURNING gerant_id
  )
  INSERT INTO public.subscriptions (gerant_id, plan_id, status, date_debut, date_fin)
  SELECT gerant_id, 'free', 'active', CURRENT_DATE, NULL FROM just_expired
  ON CONFLICT (gerant_id) WHERE status = 'active' DO NOTHING;
END;
$$;

-- pg_cron doit être activé sur le projet (Dashboard → Database → Extensions,
-- ou la ligne ci-dessous si les privilèges le permettent depuis le SQL Editor).
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('expire-subscriptions-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-subscriptions-hourly',
  '0 * * * *',
  $$SELECT public.expire_subscriptions();$$
);

-- ============================================================
-- 9. Budget Visibilité (Tâche 6)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.statut_boost AS ENUM ('actif', 'termine', 'annule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.visibility_boosts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gerant_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terrain_id    UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  budget_alloue INTEGER NOT NULL CHECK (budget_alloue > 0),
  date_debut    DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin      DATE NOT NULL,
  statut        public.statut_boost NOT NULL DEFAULT 'actif',
  vues_generees INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_boost_dates CHECK (date_fin > date_debut)
);

DO $$ BEGIN
  CREATE TRIGGER trg_visibility_boosts_updated_at BEFORE UPDATE ON public.visibility_boosts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_visibility_boosts_terrain_actif ON public.visibility_boosts(terrain_id) WHERE statut = 'actif';

ALTER TABLE public.visibility_boosts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "visibility_boosts_select_own_or_admin" ON public.visibility_boosts
    FOR SELECT USING (gerant_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE pour authenticated : uniquement via les RPC
-- ci-dessous, qui appliquent leurs propres contrôles d'autorisation.

CREATE OR REPLACE FUNCTION public.create_visibility_boost(
  p_gerant_id UUID,
  p_terrain_id UUID,
  p_montant INTEGER,
  p_duree INTEGER  -- durée en jours
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id TEXT;
  v_boost   public.visibility_boosts%ROWTYPE;
BEGIN
  IF p_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_montant IS NULL OR p_montant <= 0 THEN
    RAISE EXCEPTION 'Le budget alloué doit être positif';
  END IF;
  IF p_duree IS NULL OR p_duree <= 0 THEN
    RAISE EXCEPTION 'La durée doit être positive (en jours)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.terrains WHERE id = p_terrain_id AND gerant_id = p_gerant_id) THEN
    RAISE EXCEPTION 'Ce terrain n''appartient pas à ce gérant';
  END IF;

  v_plan_id := (public._plan_limits_internal(p_gerant_id))->>'plan_id';
  IF v_plan_id = 'free' THEN
    RAISE EXCEPTION 'Le boost de visibilité est réservé aux plans payants (Starter, Pro, Entreprise)';
  END IF;

  INSERT INTO public.visibility_boosts (gerant_id, terrain_id, budget_alloue, date_debut, date_fin, statut)
  VALUES (p_gerant_id, p_terrain_id, p_montant, CURRENT_DATE, CURRENT_DATE + p_duree, 'actif')
  RETURNING * INTO v_boost;

  RETURN json_build_object(
    'id', v_boost.id, 'terrain_id', v_boost.terrain_id, 'budget_alloue', v_boost.budget_alloue,
    'date_debut', v_boost.date_debut, 'date_fin', v_boost.date_fin, 'statut', v_boost.statut
  );
END;
$$;

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
  v_jours_totaux := v_boost.date_fin - v_boost.date_debut;
  v_jours_ecoules := LEAST(GREATEST(CURRENT_DATE - v_boost.date_debut, 0), v_jours_totaux);

  RETURN json_build_object(
    'boost_id', v_boost.id,
    'terrain_id', v_boost.terrain_id,
    'terrain_nom', v_terrain_nom,
    'budget_alloue', v_boost.budget_alloue,
    'date_debut', v_boost.date_debut,
    'date_fin', v_boost.date_fin,
    'statut', v_boost.statut,
    'vues_generees', v_boost.vues_generees,
    'jours_ecoules', v_jours_ecoules,
    'jours_totaux', v_jours_totaux,
    'cout_par_vue', CASE WHEN v_boost.vues_generees > 0
                      THEN ROUND(v_boost.budget_alloue::NUMERIC / v_boost.vues_generees, 2)
                      ELSE NULL END
  );
END;
$$;

-- Ajout (au-delà de la spec littérale) : sans compteur incrémenté quelque
-- part, `vues_generees` resterait toujours à 0 et get_boost_stats() n'aurait
-- rien à afficher. À appeler côté frontend sur la page de détail terrain
-- (TerrainDetail.jsx) à chaque affichage.
CREATE OR REPLACE FUNCTION public.increment_boost_views(p_terrain_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.visibility_boosts
  SET vues_generees = vues_generees + 1
  WHERE terrain_id = p_terrain_id
    AND statut = 'actif'
    AND CURRENT_DATE BETWEEN date_debut AND date_fin;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_boost_views(UUID) TO anon, authenticated;

-- Vue dédiée pour l'affichage prioritaire pondéré par budget (Tâche 6).
-- Nouvelle vue plutôt que modification de v_terrains_details, pour ne pas
-- casser le contrat de colonnes déjà consommé ailleurs dans le frontend.
DROP VIEW IF EXISTS public.v_terrains_discovery CASCADE;
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
-- Usage frontend : ... ORDER BY boost_weight DESC, rating DESC, ...

-- ============================================================
-- 10. Mise à jour de admin_list_subscriptions (pointait sur les anciennes
-- tables abonnements/abonnement_paliers, supprimées ci-dessus)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(
  p_statut    public.statut_abonnement_gerant DEFAULT NULL,
  p_search    TEXT DEFAULT NULL,
  p_page      INT DEFAULT 1,
  p_page_size INT DEFAULT 20
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
  FROM public.subscriptions s
  JOIN public.profiles p ON p.id = s.gerant_id
  WHERE (p_statut IS NULL OR s.status = p_statut)
    AND (p_search IS NULL OR p.nom ILIKE '%' || p_search || '%');

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_items
  FROM (
    SELECT
      s.id, s.gerant_id, p.nom AS gerant_nom, p.email AS gerant_email,
      s.plan_id, pl.nom AS plan_nom, pl.prix_mensuel, pl.prix_annuel,
      s.cycle, s.status, s.date_debut, s.date_fin, s.essai_utilise,
      public.mask_phone(s.phone_number) AS phone_number,
      s.created_at, s.updated_at
    FROM public.subscriptions s
    JOIN public.profiles p ON p.id = s.gerant_id
    JOIN public.plan_limits pl ON pl.plan_id = s.plan_id
    WHERE (p_statut IS NULL OR s.status = p_statut)
      AND (p_search IS NULL OR p.nom ILIKE '%' || p_search || '%')
    ORDER BY s.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN json_build_object('items', v_items, 'total_count', v_total, 'page', p_page, 'page_size', v_limit);
END;
$$;
