-- ============================================================
-- Migration : Backend Super Admin Dashboard
-- Modules : Dashboard KPIs, Terrains, Utilisateurs,
--           Abonnements & Commissions, Audit Logs
--
-- Note rôle : cette app n'a qu'un seul rôle admin pleinement
-- privilégié ('admin' dans role_utilisateur), déjà vérifié
-- partout via get_my_role() = 'admin'. On ne crée donc PAS de
-- nouvelle valeur d'enum 'super_admin' (opération quasi
-- irréversible sur un enum Postgres + réécriture de toutes les
-- policies existantes) : is_super_admin() ci-dessous est un
-- alias explicite sur le rôle 'admin' existant, pour que les
-- nouvelles RPC soient nommées clairement et faciles à durcir
-- plus tard si un vrai second palier d'admin est introduit.
-- ============================================================

-- ── Helper de rôle ──────────────────────────────────────────
-- IMPORTANT : COALESCE(..., false) est requis ici. Sans lui, un appelant
-- sans session (auth.uid() = NULL) fait renvoyer NULL à get_my_role(),
-- donc is_super_admin() renvoie NULL — et en PL/pgSQL "IF NOT NULL THEN"
-- ne déclenche PAS le RAISE EXCEPTION (NULL n'est ni vrai ni faux), ce qui
-- laisserait un appel anonyme traverser le garde-fou de toutes les RPC ci-dessous.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(public.get_my_role() = 'admin', false);
$$;

-- ============================================================
-- AUDIT LOGS (réutilisation de la table existante public.audit_logs)
-- ============================================================
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action        TEXT,
  p_resource_type TEXT,
  p_resource_id   UUID,
  p_metadata      JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  VALUES (auth.uid(), p_action, p_resource_type, p_resource_id, p_metadata);
END;
$$;

-- ============================================================
-- MODULE : Dashboard (KPIs)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_taux   NUMERIC;
  v_result JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT (value#>>'{}')::NUMERIC INTO v_taux
  FROM public.system_settings WHERE key = 'commission_plateforme';
  v_taux := COALESCE(v_taux, 10);

  SELECT json_build_object(
    'terrains_actifs',            (SELECT COUNT(*) FROM public.terrains WHERE statut = 'actif'),
    'reservations_jour',          (SELECT COUNT(*) FROM public.reservations WHERE date_slot = CURRENT_DATE),
    'reservations_semaine',       (SELECT COUNT(*) FROM public.reservations WHERE date_slot >= date_trunc('week', CURRENT_DATE)::DATE),
    'reservations_mois',          (SELECT COUNT(*) FROM public.reservations WHERE date_slot >= date_trunc('month', CURRENT_DATE)::DATE),
    'revenus_commissions_jour',   (SELECT ROUND(COALESCE(SUM(montant), 0) * v_taux / 100, 0) FROM public.reservations WHERE date_slot = CURRENT_DATE AND statut IN ('confirmee', 'terminee')),
    'revenus_commissions_semaine',(SELECT ROUND(COALESCE(SUM(montant), 0) * v_taux / 100, 0) FROM public.reservations WHERE date_slot >= date_trunc('week', CURRENT_DATE)::DATE AND statut IN ('confirmee', 'terminee')),
    'revenus_commissions_mois',   (SELECT ROUND(COALESCE(SUM(montant), 0) * v_taux / 100, 0) FROM public.reservations WHERE date_slot >= date_trunc('month', CURRENT_DATE)::DATE AND statut IN ('confirmee', 'terminee')),
    'taux_occupation_moyen_30j', (
      SELECT CASE WHEN COUNT(c.id) = 0 THEN 0
        ELSE ROUND(COUNT(r.id)::NUMERIC / COUNT(c.id) * 100, 1)
      END
      FROM public.creneaux c
      LEFT JOIN public.reservations r ON r.creneau_id = c.id AND r.statut IN ('confirmee', 'terminee')
      WHERE c.date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- MODULE : Terrains
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_terrains(
  p_search    TEXT DEFAULT NULL,
  p_zone      TEXT DEFAULT NULL,
  p_statut    statut_terrain DEFAULT NULL,
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
  FROM public.terrains t
  WHERE (p_search IS NULL OR t.nom ILIKE '%' || p_search || '%')
    AND (p_zone IS NULL OR t.quartier = p_zone)
    AND (p_statut IS NULL OR t.statut = p_statut);

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_items
  FROM (
    SELECT
      t.id, t.nom, t.quartier, t.adresse, t.price, t.rating, t.reviews_count,
      t.surface, t.size, t.statut, t.lat, t.lng, t.capacite,
      -- Pas de table de galerie photos aujourd'hui : 0/1 selon présence d'image_url
      CASE WHEN t.image_url IS NOT NULL THEN 1 ELSE 0 END AS nb_photos,
      t.gerant_id, p.nom AS gerant_nom,
      t.created_at, t.updated_at
    FROM public.terrains t
    LEFT JOIN public.profiles p ON p.id = t.gerant_id
    WHERE (p_search IS NULL OR t.nom ILIKE '%' || p_search || '%')
      AND (p_zone IS NULL OR t.quartier = p_zone)
      AND (p_statut IS NULL OR t.statut = p_statut)
    ORDER BY t.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN json_build_object('items', v_items, 'total_count', v_total, 'page', p_page, 'page_size', v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_terrain_status(
  p_terrain_id UUID,
  p_statut     statut_terrain
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old statut_terrain;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT statut INTO v_old FROM public.terrains WHERE id = p_terrain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  UPDATE public.terrains SET statut = p_statut WHERE id = p_terrain_id;

  PERFORM public.log_admin_action(
    'admin_update_terrain_status',
    'terrain',
    p_terrain_id,
    jsonb_build_object('ancien_statut', v_old, 'nouveau_statut', p_statut)
  );

  RETURN json_build_object('success', true, 'terrain_id', p_terrain_id, 'statut', p_statut);
END;
$$;

-- ============================================================
-- MODULE : Utilisateurs
-- ============================================================

-- Masquage partiel email/téléphone. Note : le masquage réel de
-- Sama Boutik vit dans un autre projet/codebase non accessible
-- depuis ici — convention équivalente, pas une copie littérale.
CREATE OR REPLACE FUNCTION public.mask_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_local TEXT;
  v_domain TEXT;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) = 0 THEN
    RETURN p_email;
  END IF;
  v_local := split_part(p_email, '@', 1);
  v_domain := split_part(p_email, '@', 2);
  IF length(v_local) <= 2 THEN
    RETURN left(v_local, 1) || '***@' || v_domain;
  END IF;
  RETURN left(v_local, 1) || repeat('*', length(v_local) - 2) || right(v_local, 1) || '@' || v_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_phone(p_tel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_tel IS NULL OR length(p_tel) < 5 THEN
    RETURN p_tel;
  END IF;
  RETURN left(p_tel, 2) || repeat('*', length(p_tel) - 4) || right(p_tel, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_role      role_utilisateur DEFAULT NULL,
  p_search    TEXT DEFAULT NULL,
  p_statut    statut_utilisateur DEFAULT NULL,
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
  FROM public.profiles p
  WHERE (p_role IS NULL OR p.role = p_role)
    AND (p_statut IS NULL OR p.statut = p_statut)
    AND (p_search IS NULL OR p.nom ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%');

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_items
  FROM (
    SELECT
      p.id, p.nom,
      public.mask_email(p.email) AS email,
      public.mask_phone(p.tel)   AS tel,
      p.role, p.statut, p.quartier, p.note_moyenne, p.created_at
    FROM public.profiles p
    WHERE (p_role IS NULL OR p.role = p_role)
      AND (p_statut IS NULL OR p.statut = p_statut)
      AND (p_search IS NULL OR p.nom ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN json_build_object('items', v_items, 'total_count', v_total, 'page', p_page, 'page_size', v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_user_id  UUID,
  p_new_role role_utilisateur
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_role role_utilisateur;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT role INTO v_old_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;

  -- Note : trg_audit_profiles logue déjà génériquement ce changement
  -- (action 'update_role_utilisateur'). On logue ici en plus sous un nom
  -- d'action admin explicite, avec les paramètres d'appel en metadata.
  PERFORM public.log_admin_action(
    'admin_update_user_role',
    'profile',
    p_user_id,
    jsonb_build_object('ancien_role', v_old_role, 'nouveau_role', p_new_role)
  );

  RETURN json_build_object('success', true, 'user_id', p_user_id, 'role', p_new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reveal_user_contact(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
  v_tel   TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT email, tel INTO v_email, v_tel FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  PERFORM public.log_admin_action(
    'admin_reveal_user_contact',
    'profile',
    p_user_id,
    jsonb_build_object('reveal', true)
  );

  RETURN json_build_object('user_id', p_user_id, 'email', v_email, 'tel', v_tel);
END;
$$;

-- Note : cette RPC valide l'autorisation et logue l'action, mais
-- l'invalidation réelle de session / reset de mot de passe nécessite
-- l'Auth Admin API (clé service_role), impossible à appeler depuis du SQL
-- pur. Voir backend/routes/admin.js — POST /api/admin/users/:id/reset-access,
-- qui appelle cette RPC puis effectue l'invalidation via supabase.auth.admin.
CREATE OR REPLACE FUNCTION public.admin_reset_user_access(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  PERFORM public.log_admin_action(
    'admin_reset_user_access',
    'profile',
    p_user_id,
    jsonb_build_object('note', 'Autorisation validée côté SQL ; invalidation de session effectuée via /api/admin/users/:id/reset-access (Auth Admin API)')
  );

  RETURN json_build_object('success', true, 'user_id', p_user_id, 'email', v_email);
END;
$$;

-- ============================================================
-- MODULE : Abonnements & Commissions
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.statut_abonnement AS ENUM ('essai', 'actif', 'en_retard', 'expire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.abonnement_paliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         TEXT UNIQUE NOT NULL,
  nom          TEXT NOT NULL,
  prix_mensuel INTEGER NOT NULL CHECK (prix_mensuel >= 0),
  actif        BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.abonnement_paliers (code, nom, prix_mensuel) VALUES
  ('starter', 'Starter', 10000),
  ('pro',     'Pro',     25000),
  ('premium', 'Premium', 50000)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.abonnements (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gerant_id                UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  palier_id                UUID NOT NULL REFERENCES public.abonnement_paliers(id) ON DELETE RESTRICT,
  statut                   public.statut_abonnement NOT NULL DEFAULT 'essai',
  date_debut               DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin_essai           DATE,
  prochaine_echeance       DATE,
  dernier_paiement_mode    mode_paiement,
  dernier_paiement_ref     TEXT,
  dernier_paiement_montant INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gerant_id)
);

DO $$ BEGIN
  CREATE TRIGGER trg_abonnements_updated_at BEFORE UPDATE ON public.abonnements FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.abonnement_paliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonnements        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "abonnement_paliers_select_all" ON public.abonnement_paliers FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "abonnement_paliers_manage_super_admin" ON public.abonnement_paliers FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "abonnements_select" ON public.abonnements FOR SELECT USING (public.is_super_admin() OR gerant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "abonnements_manage_super_admin" ON public.abonnements FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(
  p_statut    public.statut_abonnement DEFAULT NULL,
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
  FROM public.abonnements a
  JOIN public.profiles p ON p.id = a.gerant_id
  WHERE (p_statut IS NULL OR a.statut = p_statut)
    AND (p_search IS NULL OR p.nom ILIKE '%' || p_search || '%');

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_items
  FROM (
    SELECT
      a.id, a.gerant_id, p.nom AS gerant_nom, p.email AS gerant_email,
      a.palier_id, pal.code AS palier_code, pal.nom AS palier_nom, pal.prix_mensuel,
      a.statut, a.date_debut, a.date_fin_essai, a.prochaine_echeance,
      a.dernier_paiement_mode, a.dernier_paiement_ref, a.dernier_paiement_montant,
      a.created_at, a.updated_at
    FROM public.abonnements a
    JOIN public.profiles p ON p.id = a.gerant_id
    JOIN public.abonnement_paliers pal ON pal.id = a.palier_id
    WHERE (p_statut IS NULL OR a.statut = p_statut)
      AND (p_search IS NULL OR p.nom ILIKE '%' || p_search || '%')
    ORDER BY a.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN json_build_object('items', v_items, 'total_count', v_total, 'page', p_page, 'page_size', v_limit);
END;
$$;

-- Commission plateforme (pas les frais UnitechPay 1,5%, qui sont un frais
-- de transaction distinct déjà à la charge du gérant) : calculée avec le
-- taux system_settings.commission_plateforme ACTUEL, appliqué rétroactivement
-- (le taux n'est pas historisé par transaction ailleurs dans le schéma).
CREATE OR REPLACE FUNCTION public.admin_get_commission_summary(
  p_date_debut DATE DEFAULT NULL,
  p_date_fin   DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_debut DATE := COALESCE(p_date_debut, date_trunc('month', CURRENT_DATE)::DATE);
  v_fin   DATE := COALESCE(p_date_fin, CURRENT_DATE);
  v_taux  NUMERIC;
  v_total_montant BIGINT;
  v_nb_reservations BIGINT;
  v_par_jour JSON;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle super_admin requis';
  END IF;

  SELECT (value#>>'{}')::NUMERIC INTO v_taux
  FROM public.system_settings WHERE key = 'commission_plateforme';
  v_taux := COALESCE(v_taux, 10);

  SELECT COALESCE(SUM(montant), 0), COUNT(*) INTO v_total_montant, v_nb_reservations
  FROM public.reservations
  WHERE date_slot BETWEEN v_debut AND v_fin
    AND statut IN ('confirmee', 'terminee');

  SELECT COALESCE(json_agg(json_build_object(
      'date', jour,
      'montant_total', montant_total,
      'commission', ROUND(montant_total * v_taux / 100, 0)
    ) ORDER BY jour), '[]'::json)
  INTO v_par_jour
  FROM (
    SELECT date_slot AS jour, SUM(montant) AS montant_total
    FROM public.reservations
    WHERE date_slot BETWEEN v_debut AND v_fin
      AND statut IN ('confirmee', 'terminee')
    GROUP BY date_slot
  ) d;

  RETURN json_build_object(
    'periode_debut', v_debut,
    'periode_fin', v_fin,
    'taux_commission', v_taux,
    'total_montant_reservations', v_total_montant,
    'total_commission', ROUND(v_total_montant * v_taux / 100, 0),
    'nb_reservations', v_nb_reservations,
    'par_jour', v_par_jour
  );
END;
$$;

-- ============================================================
-- MODULE : Audit Logs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_logs(
  p_action      TEXT DEFAULT NULL,
  p_date_debut  TIMESTAMPTZ DEFAULT NULL,
  p_date_fin    TIMESTAMPTZ DEFAULT NULL,
  p_admin_id    UUID DEFAULT NULL,
  p_page        INT DEFAULT 1,
  p_page_size   INT DEFAULT 20
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
  FROM public.audit_logs l
  WHERE (p_action IS NULL OR l.action = p_action)
    AND (p_admin_id IS NULL OR l.actor_id = p_admin_id)
    AND (p_date_debut IS NULL OR l.created_at >= p_date_debut)
    AND (p_date_fin IS NULL OR l.created_at <= p_date_fin);

  SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) INTO v_items
  FROM (
    SELECT
      l.id, l.actor_id, p.nom AS actor_nom, l.action, l.resource_type, l.resource_id,
      l.old_state, l.new_state, l.metadata, l.created_at
    FROM public.audit_logs l
    LEFT JOIN public.profiles p ON p.id = l.actor_id
    WHERE (p_action IS NULL OR l.action = p_action)
      AND (p_admin_id IS NULL OR l.actor_id = p_admin_id)
      AND (p_date_debut IS NULL OR l.created_at >= p_date_debut)
      AND (p_date_fin IS NULL OR l.created_at <= p_date_fin)
    ORDER BY l.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN json_build_object('items', v_items, 'total_count', v_total, 'page', p_page, 'page_size', v_limit);
END;
$$;

-- ============================================================
-- Smoke tests manuels (à exécuter dans le SQL editor Supabase,
-- authentifié tour à tour comme l'admin existant puis comme un
-- gérant/joueur pour vérifier le rejet)
-- ============================================================
-- SELECT public.get_admin_dashboard_stats();
-- SELECT public.admin_list_terrains(NULL, NULL, NULL, 1, 10);
-- SELECT public.admin_list_users('gerant', NULL, NULL, 1, 10);
-- SELECT public.admin_reveal_user_contact('<uuid_utilisateur>');
-- SELECT public.admin_list_subscriptions();
-- SELECT public.admin_get_commission_summary();
-- SELECT public.admin_list_logs();
-- -- En session gérant/joueur, chaque appel ci-dessus doit lever :
-- -- ERROR:  Accès refusé : rôle super_admin requis
