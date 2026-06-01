-- ============================================================
-- PlaygroundSpot — Schéma PostgreSQL pour Supabase
-- Généré par Antigravity — Dakar, Sénégal
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- pour les coordonnées GPS (optionnel)

-- ── ENUMs ─────────────────────────────────────────────────────
CREATE TYPE role_utilisateur AS ENUM ('admin', 'gerant', 'joueur');
CREATE TYPE statut_utilisateur AS ENUM ('actif', 'suspendu', 'inactif', 'en_attente');
CREATE TYPE surface_terrain AS ENUM ('Synthétique', 'Béton', 'Sable', 'Gazon naturel');
CREATE TYPE taille_terrain AS ENUM ('3v3', '5v5', '7v7', '11v11');
CREATE TYPE statut_terrain AS ENUM ('actif', 'inactif', 'en_maintenance');
CREATE TYPE statut_creneau AS ENUM ('disponible', 'bloque', 'reserve');
CREATE TYPE statut_reservation AS ENUM ('en_attente', 'confirmee', 'terminee', 'annulee');
CREATE TYPE mode_paiement AS ENUM ('wave', 'orange_money', 'sur_place', 'carte');
CREATE TYPE statut_paiement AS ENUM ('en_attente', 'valide', 'echoue', 'rembourse');

-- ============================================================
-- TABLE : profiles
-- Extension de auth.users — stocke les données métier
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  tel           TEXT,
  role          role_utilisateur NOT NULL DEFAULT 'joueur',
  quartier      TEXT,
  statut        statut_utilisateur NOT NULL DEFAULT 'actif',
  avatar        TEXT, -- initiales ou URL image
  note_moyenne  NUMERIC(3,1) CHECK (note_moyenne >= 1 AND note_moyenne <= 5),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Profils utilisateurs (admin, gérant, joueur)';

-- ============================================================
-- TABLE : terrains
-- Terrains de football à Dakar
-- ============================================================
CREATE TABLE IF NOT EXISTS public.terrains (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom             TEXT NOT NULL,
  quartier        TEXT NOT NULL,
  adresse         TEXT,
  price           INTEGER NOT NULL CHECK (price > 0), -- FCFA par heure
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
  capacite        INTEGER DEFAULT 10, -- nb joueurs max
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.terrains IS 'Terrains de football disponibles à la réservation';

-- ============================================================
-- TABLE : terrain_amenities
-- Équipements disponibles par terrain
-- ============================================================
CREATE TABLE IF NOT EXISTS public.terrain_amenities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id  UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  icone       TEXT, -- nom d'icône Tabler Icons
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.terrain_amenities IS 'Équipements et services disponibles par terrain';

-- ============================================================
-- TABLE : gerant_terrains
-- Relation many-to-many gérant ↔ terrain
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gerant_terrains (
  gerant_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terrain_id  UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gerant_id, terrain_id)
);

COMMENT ON TABLE public.gerant_terrains IS 'Association entre gérants et terrains gérés';

-- ============================================================
-- TABLE : creneaux
-- Créneaux horaires par terrain (planification)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.creneaux (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id      UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  heure_debut     TIME NOT NULL,
  heure_fin       TIME NOT NULL,
  prix_override   INTEGER, -- si prix différent du tarif standard
  statut          statut_creneau NOT NULL DEFAULT 'disponible',
  motif_blocage   TEXT, -- raison si bloqué par gérant
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_heures CHECK (heure_fin > heure_debut),
  UNIQUE (terrain_id, date, heure_debut)
);

COMMENT ON TABLE public.creneaux IS 'Créneaux horaires planifiés par terrain';

-- ============================================================
-- TABLE : reservations
-- Réservations de créneaux par les joueurs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reservations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id    UUID NOT NULL REFERENCES public.terrains(id) ON DELETE RESTRICT,
  joueur_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  creneau_id    UUID REFERENCES public.creneaux(id) ON DELETE SET NULL,
  -- Snapshot au moment de la réservation (en cas de modif terrain)
  terrain_nom   TEXT NOT NULL,
  joueur_nom    TEXT NOT NULL,
  date_slot     DATE NOT NULL,
  heure_slot    TIME NOT NULL,
  duree_heures  INTEGER NOT NULL DEFAULT 1,
  montant       INTEGER NOT NULL CHECK (montant > 0), -- FCFA
  statut        statut_reservation NOT NULL DEFAULT 'en_attente',
  motif_annulation TEXT,
  ticket_qr     TEXT, -- données QR code
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reservations IS 'Réservations de terrains par les joueurs';

-- Index performance
CREATE INDEX idx_reservations_joueur    ON public.reservations(joueur_id);
CREATE INDEX idx_reservations_terrain   ON public.reservations(terrain_id);
CREATE INDEX idx_reservations_statut    ON public.reservations(statut);
CREATE INDEX idx_reservations_date      ON public.reservations(date_slot);
CREATE INDEX idx_creneaux_terrain_date  ON public.creneaux(terrain_id, date);

-- ============================================================
-- TABLE : paiements
-- Transactions liées aux réservations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paiements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id  UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
  montant         INTEGER NOT NULL CHECK (montant > 0),
  mode            mode_paiement NOT NULL,
  statut          statut_paiement NOT NULL DEFAULT 'en_attente',
  ref_externe     TEXT, -- référence Wave / Orange Money
  numero_tel      TEXT, -- numéro utilisé pour le paiement mobile
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.paiements IS 'Transactions de paiement (Wave, Orange Money, sur place)';

-- ============================================================
-- TABLE : avis
-- Notes et commentaires des joueurs après match
-- ============================================================
CREATE TABLE IF NOT EXISTS public.avis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id  UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  joueur_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terrain_id      UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  note            INTEGER NOT NULL CHECK (note >= 1 AND note <= 5),
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reservation_id) -- un seul avis par réservation
);

COMMENT ON TABLE public.avis IS 'Avis et notes des joueurs sur les terrains';

-- ============================================================
-- TRIGGERS : updated_at automatique
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_terrains_updated_at
  BEFORE UPDATE ON public.terrains
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_creneaux_updated_at
  BEFORE UPDATE ON public.creneaux
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_paiements_updated_at
  BEFORE UPDATE ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- TRIGGER : mise à jour auto du rating terrain après avis
-- ============================================================
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

CREATE TRIGGER trg_update_rating
  AFTER INSERT OR UPDATE ON public.avis
  FOR EACH ROW EXECUTE FUNCTION public.update_terrain_rating();

-- ============================================================
-- TRIGGER : marquer créneau comme "réservé" après réservation confirmée
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_creneau_statut()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.creneau_id IS NOT NULL THEN
    IF NEW.statut IN ('confirmee', 'en_attente') THEN
      UPDATE public.creneaux SET statut = 'reserve' WHERE id = NEW.creneau_id;
    ELSIF NEW.statut IN ('annulee') THEN
      UPDATE public.creneaux SET statut = 'disponible' WHERE id = NEW.creneau_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_creneau
  AFTER INSERT OR UPDATE OF statut ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.sync_creneau_statut();

-- ============================================================
-- TRIGGER : nouveau profil auto à l'inscription
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::role_utilisateur, 'joueur')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Activer RLS sur toutes les tables
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrains         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrain_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gerant_terrains  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creneaux         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avis             ENABLE ROW LEVEL SECURITY;

-- ── Helpers RLS ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ── PROFILES ──────────────────────────────────────────────────
-- Lecture : tout le monde peut lire les profils publics
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT USING (true);

-- Modification : uniquement son propre profil, ou admin
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (
    auth.uid() = id OR public.get_my_role() = 'admin'
  );

-- ── TERRAINS ──────────────────────────────────────────────────
-- Lecture : publique (terrains actifs visibles par tous)
CREATE POLICY "terrains_select_all" ON public.terrains
  FOR SELECT USING (statut = 'actif' OR public.get_my_role() IN ('admin', 'gerant'));

-- Création : admin seulement
CREATE POLICY "terrains_insert_admin" ON public.terrains
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- Modification : admin ou gérant du terrain
CREATE POLICY "terrains_update_admin_gerant" ON public.terrains
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
    OR (public.get_my_role() = 'gerant' AND gerant_id = auth.uid())
  );

-- ── TERRAIN_AMENITIES ─────────────────────────────────────────
CREATE POLICY "amenities_select_all" ON public.terrain_amenities
  FOR SELECT USING (true);

CREATE POLICY "amenities_manage_admin_gerant" ON public.terrain_amenities
  FOR ALL USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.terrains t
      WHERE t.id = terrain_id AND t.gerant_id = auth.uid()
    )
  );

-- ── GERANT_TERRAINS ───────────────────────────────────────────
CREATE POLICY "gerant_terrains_select" ON public.gerant_terrains
  FOR SELECT USING (true);

CREATE POLICY "gerant_terrains_manage_admin" ON public.gerant_terrains
  FOR ALL USING (public.get_my_role() = 'admin');

-- ── CRENEAUX ──────────────────────────────────────────────────
-- Lecture : publique pour créneaux disponibles
CREATE POLICY "creneaux_select_public" ON public.creneaux
  FOR SELECT USING (true);

-- Gestion : gérant de ce terrain ou admin
CREATE POLICY "creneaux_manage_gerant" ON public.creneaux
  FOR ALL USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.terrains t
      WHERE t.id = terrain_id AND t.gerant_id = auth.uid()
    )
  );

-- ── RESERVATIONS ──────────────────────────────────────────────
-- Joueur : voit seulement ses propres réservations
-- Gérant : voit les réservations de ses terrains
-- Admin : voit tout
CREATE POLICY "reservations_select" ON public.reservations
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR joueur_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.terrains t
      WHERE t.id = terrain_id AND t.gerant_id = auth.uid()
    )
  );

-- Création : joueur authentifié seulement
CREATE POLICY "reservations_insert_joueur" ON public.reservations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND joueur_id = auth.uid()
  );

-- Modification : admin ou gérant du terrain (pour changer le statut)
CREATE POLICY "reservations_update_gerant" ON public.reservations
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
    OR joueur_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.terrains t
      WHERE t.id = terrain_id AND t.gerant_id = auth.uid()
    )
  );

-- ── PAIEMENTS ─────────────────────────────────────────────────
CREATE POLICY "paiements_select" ON public.paiements
  FOR SELECT USING (
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id AND r.joueur_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      JOIN public.terrains t ON t.id = r.terrain_id
      WHERE r.id = reservation_id AND t.gerant_id = auth.uid()
    )
  );

CREATE POLICY "paiements_insert" ON public.paiements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id AND r.joueur_id = auth.uid()
    )
    OR public.get_my_role() = 'admin'
  );

-- ── AVIS ──────────────────────────────────────────────────────
CREATE POLICY "avis_select_all" ON public.avis
  FOR SELECT USING (true);

-- Uniquement le joueur ayant fait la réservation peut laisser un avis
CREATE POLICY "avis_insert_joueur" ON public.avis
  FOR INSERT WITH CHECK (
    joueur_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_id
        AND r.joueur_id = auth.uid()
        AND r.statut = 'terminee'
    )
  );

-- ============================================================
-- VUES utiles
-- ============================================================

-- Vue : terrains avec leurs gérants
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

-- Vue : réservations enrichies (tableau de bord)
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

-- Revenus d'un terrain sur une période
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

-- Stats globales admin
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
