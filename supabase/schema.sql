-- ============================================================
-- PlaygroundSpot — Schéma PostgreSQL pour Supabase (Idempotent)
-- Généré par Antigravity — Dakar, Sénégal
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMs (idempotent) ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE role_utilisateur AS ENUM ('admin', 'gerant', 'joueur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_utilisateur AS ENUM ('actif', 'suspendu', 'inactif', 'en_attente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE surface_terrain AS ENUM ('Synthétique', 'Béton', 'Sable', 'Gazon naturel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE taille_terrain AS ENUM ('3v3', '5v5', '7v7', '11v11');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_terrain AS ENUM ('actif', 'inactif', 'en_maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_creneau AS ENUM ('disponible', 'bloque', 'reserve');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_reservation AS ENUM ('en_attente', 'confirmee', 'terminee', 'annulee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mode_paiement AS ENUM ('wave', 'orange_money', 'sur_place', 'carte');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_paiement AS ENUM ('en_attente', 'valide', 'echoue', 'rembourse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLE : profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  tel           TEXT,
  role          role_utilisateur NOT NULL DEFAULT 'joueur',
  quartier      TEXT,
  statut        statut_utilisateur NOT NULL DEFAULT 'actif',
  avatar        TEXT,
  note_moyenne  NUMERIC(3,1) CHECK (note_moyenne >= 1 AND note_moyenne <= 5),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : terrains
-- ============================================================
CREATE TABLE IF NOT EXISTS public.terrains (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom             TEXT NOT NULL,
  quartier        TEXT NOT NULL,
  adresse         TEXT,
  price           INTEGER NOT NULL CHECK (price > 0),
  rating          NUMERIC(3,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  reviews_count   INTEGER DEFAULT 0,
  surface         surface_terrain NOT NULL DEFAULT 'Synthétique',
  size            taille_terrain NOT NULL DEFAULT '5v5',
  image_url       TEXT,
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  gerant_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  statut          statut_terrain NOT NULL DEFAULT 'actif',
  description     TEXT,
  capacite        INTEGER DEFAULT 10,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : terrain_amenities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.terrain_amenities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id  UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  icone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : gerant_terrains
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gerant_terrains (
  gerant_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terrain_id  UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gerant_id, terrain_id)
);

-- ============================================================
-- TABLE : creneaux
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creneaux (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id      UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  heure_debut     TIME NOT NULL,
  heure_fin       TIME NOT NULL,
  prix_override   INTEGER,
  statut          statut_creneau NOT NULL DEFAULT 'disponible',
  motif_blocage   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_heures CHECK (heure_fin > heure_debut),
  UNIQUE (terrain_id, date, heure_debut)
);

-- ============================================================
-- TABLE : reservations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id    UUID NOT NULL REFERENCES public.terrains(id) ON DELETE RESTRICT,
  joueur_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  creneau_id    UUID REFERENCES public.creneaux(id) ON DELETE SET NULL,
  terrain_nom   TEXT NOT NULL,
  joueur_nom    TEXT NOT NULL,
  date_slot     DATE NOT NULL,
  heure_slot    TIME NOT NULL,
  duree_heures  INTEGER NOT NULL DEFAULT 1,
  montant       INTEGER NOT NULL CHECK (montant > 0),
  statut        statut_reservation NOT NULL DEFAULT 'en_attente',
  motif_annulation TEXT,
  ticket_qr     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_reservations_joueur    ON public.reservations(joueur_id);
CREATE INDEX IF NOT EXISTS idx_reservations_terrain   ON public.reservations(terrain_id);
CREATE INDEX IF NOT EXISTS idx_reservations_statut    ON public.reservations(statut);
CREATE INDEX IF NOT EXISTS idx_reservations_date      ON public.reservations(date_slot);
CREATE INDEX IF NOT EXISTS idx_creneaux_terrain_date  ON public.creneaux(terrain_id, date);

-- ============================================================
-- TABLE : paiements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paiements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id  UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  montant         INTEGER NOT NULL CHECK (montant > 0),
  mode            mode_paiement NOT NULL,
  statut          statut_paiement NOT NULL DEFAULT 'en_attente',
  ref_externe     TEXT,
  numero_tel      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : avis
-- ============================================================
CREATE TABLE IF NOT EXISTS public.avis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id  UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  joueur_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terrain_id      UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  note            INTEGER NOT NULL CHECK (note >= 1 AND note <= 5),
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id)
);

-- ============================================================
-- FONCTIONS & TRIGGERS (idempotent avec CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at (idempotent)
DO $$ BEGIN
  CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_terrains_updated_at BEFORE UPDATE ON public.terrains FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_creneaux_updated_at BEFORE UPDATE ON public.creneaux FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_paiements_updated_at BEFORE UPDATE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger rating terrain
CREATE OR REPLACE FUNCTION public.update_terrain_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.terrains
  SET
    rating        = (SELECT ROUND(AVG(note)::NUMERIC, 1) FROM public.avis WHERE terrain_id = NEW.terrain_id),
    reviews_count = (SELECT COUNT(*) FROM public.avis WHERE terrain_id = NEW.terrain_id)
  WHERE id = NEW.terrain_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_update_rating AFTER INSERT OR UPDATE ON public.avis FOR EACH ROW EXECUTE FUNCTION public.update_terrain_rating();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger sync créneau
CREATE OR REPLACE FUNCTION public.sync_creneau_statut()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.creneau_id IS NOT NULL THEN
    IF NEW.statut IN ('confirmee', 'en_attente') THEN
      UPDATE public.creneaux SET statut = 'reserve' WHERE id = NEW.creneau_id;
    ELSIF NEW.statut IN ('annulee') THEN
      UPDATE public.creneaux SET statut = 'disponible' WHERE id = NEW.creneau_id;
      
      -- Mise à jour automatique des paiements associés en 'rembourse'
      UPDATE public.paiements
      SET statut = 'rembourse', updated_at = NOW()
      WHERE reservation_id = NEW.id AND statut = 'valide';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_sync_creneau AFTER INSERT OR UPDATE OF statut ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.sync_creneau_statut();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger nouveau profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::role_utilisateur, 'joueur')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
-- SECURITY DEFINER justifié : cette fonction doit insérer dans public.profiles
-- lors de l'inscription, avant que l'utilisateur n'ait de profil RLS.
-- La fonction est sûre car elle n'accepte que les données de auth.users.
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrains         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrain_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gerant_terrains  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creneaux         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avis             ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- PROFILES policies
DO $$ BEGIN
  CREATE POLICY "profiles_select_public" ON public.profiles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
    USING (auth.uid() = id OR public.get_my_role() = 'admin')
    WITH CHECK (
      -- Règle 4.4 : Bloquer le changement de rôle et de statut par l'utilisateur lui-même
      -- Seul un admin peut changer ces champs via RLS
      CASE
        WHEN public.get_my_role() = 'admin' THEN true
        ELSE (
          role = (SELECT role FROM public.profiles WHERE id = auth.uid())
          AND statut = (SELECT statut FROM public.profiles WHERE id = auth.uid())
        )
      END
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TERRAINS policies
DO $$ BEGIN
  CREATE POLICY "terrains_select_all" ON public.terrains FOR SELECT USING (statut = 'actif' OR public.get_my_role() IN ('admin', 'gerant'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrains_insert_admin" ON public.terrains FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrains_update_admin_gerant" ON public.terrains FOR UPDATE USING (public.get_my_role() = 'admin' OR (public.get_my_role() = 'gerant' AND gerant_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TERRAIN_AMENITIES policies
DO $$ BEGIN
  CREATE POLICY "amenities_select_all" ON public.terrain_amenities FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "amenities_manage_admin_gerant" ON public.terrain_amenities FOR ALL USING (public.get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- GERANT_TERRAINS policies
DO $$ BEGIN
  CREATE POLICY "gerant_terrains_select" ON public.gerant_terrains FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "gerant_terrains_manage_admin" ON public.gerant_terrains FOR ALL USING (public.get_my_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CRENEAUX policies
DO $$ BEGIN
  CREATE POLICY "creneaux_select_public" ON public.creneaux FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "creneaux_manage_gerant" ON public.creneaux FOR ALL USING (public.get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESERVATIONS policies
DO $$ BEGIN
  CREATE POLICY "reservations_select" ON public.reservations FOR SELECT USING (public.get_my_role() = 'admin' OR joueur_id = auth.uid() OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reservations_insert_joueur" ON public.reservations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND joueur_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "reservations_update_gerant" ON public.reservations FOR UPDATE
    USING (public.get_my_role() = 'admin' OR joueur_id = auth.uid() OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid()))
    WITH CHECK (
      -- Règle 4.4 : Interdire le changement de joueur_id (usurpation d'identité)
      joueur_id = (SELECT joueur_id FROM public.reservations WHERE id = reservations.id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PAIEMENTS policies
DO $$ BEGIN
  CREATE POLICY "paiements_select" ON public.paiements FOR SELECT USING (public.get_my_role() = 'admin' OR EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.joueur_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.reservations r JOIN public.terrains t ON t.id = r.terrain_id WHERE r.id = reservation_id AND t.gerant_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "paiements_insert" ON public.paiements FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.joueur_id = auth.uid()) OR public.get_my_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AVIS policies
DO $$ BEGIN
  CREATE POLICY "avis_select_all" ON public.avis FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "avis_insert_joueur" ON public.avis FOR INSERT WITH CHECK (joueur_id = auth.uid() AND EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_id AND r.joueur_id = auth.uid() AND r.statut = 'terminee'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- VUES utiles
-- ============================================================
CREATE OR REPLACE VIEW public.v_terrains_details AS
SELECT
  t.*,
  p.nom            AS gerant_nom,
  p.tel            AS gerant_tel,
  p.email          AS gerant_email,
  COALESCE(
    json_agg(
      json_build_object('id', a.id, 'label', a.label, 'icone', a.icone)
    ) FILTER (WHERE a.id IS NOT NULL),
    '[]'::json
  ) AS amenities
FROM public.terrains t
LEFT JOIN public.profiles p     ON p.id = t.gerant_id
LEFT JOIN public.terrain_amenities a ON a.terrain_id = t.id
GROUP BY t.id, p.nom, p.tel, p.email;

CREATE OR REPLACE VIEW public.v_reservations_full AS
SELECT
  r.*,
  t.nom           AS terrain_nom_detail,
  t.quartier      AS terrain_quartier,
  t.price         AS terrain_price,
  p.nom           AS joueur_nom_detail,
  p.tel           AS joueur_tel,
  p.email         AS joueur_email,
  pay.mode        AS paiement_mode,
  pay.statut      AS paiement_statut,
  pay.ref_externe AS paiement_ref
FROM public.reservations r
LEFT JOIN public.terrains  t   ON t.id = r.terrain_id
LEFT JOIN public.profiles  p   ON p.id = r.joueur_id
LEFT JOIN public.paiements pay ON pay.reservation_id = r.id;

-- ============================================================
-- FONCTIONS utilitaires
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_terrain_revenus(
  p_terrain_id UUID,
  p_date_debut DATE,
  p_date_fin   DATE
)
RETURNS TABLE (
  total_revenus   BIGINT,
  nb_reservations BIGINT,
  taux_occupation NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(r.montant), 0)::BIGINT AS total_revenus,
    COUNT(r.id)::BIGINT                 AS nb_reservations,
    CASE
      WHEN COUNT(c.id) = 0 THEN 0
      ELSE ROUND(COUNT(r.id)::NUMERIC / COUNT(c.id) * 100, 1)
    END AS taux_occupation
  FROM public.creneaux c
  LEFT JOIN public.reservations r
    ON r.creneau_id = c.id AND r.statut IN ('confirmee', 'terminee')
  WHERE c.terrain_id = p_terrain_id
    AND c.date BETWEEN p_date_debut AND p_date_fin;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_admin_stats(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'revenus_mois',      (SELECT COALESCE(SUM(montant), 0) FROM public.reservations WHERE date_slot >= date_trunc('month', p_date) AND statut IN ('confirmee', 'terminee')),
    'reservations_jour', (SELECT COUNT(*) FROM public.reservations WHERE date_slot = p_date),
    'terrains_actifs',   (SELECT COUNT(*) FROM public.terrains WHERE statut = 'actif'),
    'joueurs_inscrits',  (SELECT COUNT(*) FROM public.profiles WHERE role = 'joueur')
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- FONCTION : Génération en masse de créneaux (Récurrence)
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_weekly_slots(
  p_terrain_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_days_of_week INTEGER[],
  p_start_time TIME,
  p_end_time TIME,
  p_slot_duration INTERVAL,
  p_price_override INTEGER DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_current_date DATE := p_start_date;
  v_current_time TIME;
  v_count INTEGER := 0;
BEGIN
  -- Contrôle d'autorisation strict
  IF NOT (
    public.get_my_role() = 'admin' OR 
    EXISTS (SELECT 1 FROM public.terrains WHERE id = p_terrain_id AND gerant_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Non autorisé à gérer les créneaux de ce terrain';
  END IF;

  -- Validation
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'La date de début doit être antérieure à la date de fin';
  END IF;

  -- Boucle sur les dates
  WHILE v_current_date <= p_end_date LOOP
    -- Vérification du jour de la semaine (EXTRACT(DOW) retourne 0 pour Dimanche, 1 pour Lundi, etc.)
    IF EXTRACT(DOW FROM v_current_date)::INTEGER = ANY(p_days_of_week) THEN
      v_current_time := p_start_time;
      -- Boucle sur les heures de la journée
      WHILE v_current_time + p_slot_duration <= p_end_time LOOP
        INSERT INTO public.creneaux (
          terrain_id,
          date,
          heure_debut,
          heure_fin,
          prix_override,
          statut
        )
        VALUES (
          p_terrain_id,
          v_current_date,
          v_current_time,
          v_current_time + p_slot_duration,
          p_price_override,
          'disponible'
        )
        ON CONFLICT (terrain_id, date, heure_debut) DO NOTHING;
        
        IF FOUND THEN
          v_count := v_count + 1;
        END IF;

        v_current_time := v_current_time + p_slot_duration;
      END LOOP;
    END IF;
    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_count;
END;
-- SECURITY DEFINER justifié : la génération de créneaux nécessite de contourner
-- le RLS pour vérifier l'ownership du terrain. L'autorisation est vérifiée
-- explicitement dans le corps de la fonction (ligne 476-481).
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ============================================================
-- TABLE : webhook_logs (Paiements Mobiles)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "webhook_logs_admin" ON public.webhook_logs FOR ALL USING (public.get_my_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- FONCTION : Traitement du Webhook de Paiement (Wave / OM)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_payment_webhook(
  p_provider TEXT,
  p_payload JSONB,
  p_reference TEXT,
  p_status TEXT
)
RETURNS VOID AS $$
DECLARE
  v_reservation_id UUID;
  v_paiement_id UUID;
BEGIN
  -- 1. Enregistrement du log brut
  INSERT INTO public.webhook_logs (provider, payload)
  VALUES (p_provider, p_payload);

  -- 2. Recherche du paiement via la référence externe
  SELECT id, reservation_id INTO v_paiement_id, v_reservation_id
  FROM public.paiements
  WHERE ref_externe = p_reference;

  IF v_paiement_id IS NULL THEN
    RAISE EXCEPTION 'Paiement introuvable pour la référence externe %', p_reference;
  END IF;

  -- 3. Mise à jour selon le statut reçu
  IF p_status IN ('success', 'approved', 'completed', 'paid') THEN
    UPDATE public.paiements
    SET statut = 'valide', updated_at = NOW()
    WHERE id = v_paiement_id;

    UPDATE public.reservations
    SET statut = 'confirmee', updated_at = NOW()
    WHERE id = v_reservation_id;
  ELSIF p_status IN ('failed', 'declined', 'cancelled') THEN
    UPDATE public.paiements
    SET statut = 'echoue', updated_at = NOW()
    WHERE id = v_paiement_id;

    UPDATE public.reservations
    SET statut = 'annulee', motif_annulation = 'Paiement mobile échoué ou annulé', updated_at = NOW()
    WHERE id = v_reservation_id;
  END IF;
END;
-- SECURITY DEFINER justifié : le traitement webhook vient d'un système externe
-- (Wave/OM) qui ne dispose pas d'un JWT utilisateur. La vérification de la
-- signature du webhook doit être faite au niveau de l'Edge Function appelante.
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ============================================================
-- TABLE : audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID NOT NULL,
  old_state     JSONB,
  new_state     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "audit_logs_admin" ON public.audit_logs FOR ALL USING (public.get_my_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TRIGGER FUNCTION : Audit des changements
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_resource_type TEXT;
  v_resource_id UUID;
  v_old_state JSONB := NULL;
  v_new_state JSONB := NULL;
  v_actor_id UUID;
BEGIN
  -- Détermination de l'acteur (utilisateur actuellement authentifié)
  v_actor_id := auth.uid();

  -- Détermination du type de ressource et ID
  IF TG_TABLE_NAME = 'reservations' THEN
    v_resource_type := 'reservation';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
      v_action := 'update_statut_reservation';
      v_old_state := jsonb_build_object('statut', OLD.statut, 'motif_annulation', OLD.motif_annulation);
      v_new_state := jsonb_build_object('statut', NEW.statut, 'motif_annulation', NEW.motif_annulation);
    END IF;
  ELSIF TG_TABLE_NAME = 'creneaux' THEN
    v_resource_type := 'creneau';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
      v_action := 'update_statut_creneau';
      v_old_state := jsonb_build_object('statut', OLD.statut);
      v_new_state := jsonb_build_object('statut', NEW.statut);
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_resource_type := 'profile';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
      v_action := 'update_role_utilisateur';
      v_old_state := jsonb_build_object('role', OLD.role);
      v_new_state := jsonb_build_object('role', NEW.role);
    END IF;
  ELSIF TG_TABLE_NAME = 'terrains' THEN
    v_resource_type := 'terrain';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'INSERT' THEN
      v_action := 'create_terrain';
      v_new_state := jsonb_build_object('nom', NEW.nom, 'adresse', NEW.adresse, 'tarif_horaire', NEW.tarif_horaire);
    ELSIF TG_OP = 'UPDATE' THEN
      v_action := 'update_terrain';
      v_old_state := jsonb_build_object('nom', OLD.nom, 'tarif_horaire', OLD.tarif_horaire);
      v_new_state := jsonb_build_object('nom', NEW.nom, 'tarif_horaire', NEW.tarif_horaire);
    END IF;
  ELSIF TG_TABLE_NAME = 'paiements' THEN
    v_resource_type := 'paiement';
    v_resource_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
      v_action := 'update_statut_paiement';
      v_old_state := jsonb_build_object('statut', OLD.statut, 'ref_externe', OLD.ref_externe);
      v_new_state := jsonb_build_object('statut', NEW.statut, 'ref_externe', NEW.ref_externe);
    END IF;
  END IF;

  -- Si une action critique a été identifiée, on enregistre le log
  IF v_action IS NOT NULL THEN
    INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, old_state, new_state)
    VALUES (v_actor_id, v_action, v_resource_type, v_resource_id, v_old_state, v_new_state);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers pour les tables critiques
DO $$ BEGIN
  CREATE TRIGGER trg_audit_reservations AFTER UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_creneaux AFTER UPDATE ON public.creneaux FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_profiles AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_terrains AFTER INSERT OR UPDATE ON public.terrains FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_paiements AFTER UPDATE ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;



