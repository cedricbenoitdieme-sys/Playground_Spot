-- ============================================================
-- Migration : informations de versement (payout) du gérant + garde-fou à
-- l'approbation d'un terrain.
--
-- Contexte : le modèle marketplace SenePay pour les réservations déclenche
-- un virement automatique (payout) vers le gérant après chaque paiement
-- joueur confirmé (migration 20260801190000). Sans numéro Wave/Orange Money
-- enregistré, ce virement n'a nulle part où aller — un terrain ne doit donc
-- jamais devenir réservable tant que son gérant n'a pas renseigné ces
-- informations.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gerant_payout_info (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gerant_id  UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  operator   TEXT NOT NULL CHECK (operator IN ('wave', 'orange_money')),
  country    TEXT NOT NULL DEFAULT 'SN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER trg_gerant_payout_info_updated_at BEFORE UPDATE ON public.gerant_payout_info FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.gerant_payout_info ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "gerant_payout_info_select_own_or_admin" ON public.gerant_payout_info
    FOR SELECT USING (gerant_id = auth.uid() OR public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy INSERT/UPDATE pour authenticated : uniquement via
-- upsert_gerant_payout_info ci-dessous (auto-service, jamais pour un tiers).

-- ── upsert_gerant_payout_info — auto-service gérant. Numéro/opérateur
-- utilisés pour le payout marketplace (Tâche 3, migration 20260801190000).
-- Validation Sénégal uniquement pour l'instant (périmètre confirmé :
-- pas encore multi-pays), même regex que create-payment.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_gerant_payout_info(
  p_phone TEXT,
  p_operator TEXT,
  p_country TEXT DEFAULT 'SN'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.gerant_payout_info%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'gerant') THEN
    RAISE EXCEPTION 'Seuls les gérants peuvent renseigner des informations de versement';
  END IF;

  IF p_operator NOT IN ('wave', 'orange_money') THEN
    RAISE EXCEPTION 'Opérateur invalide : % (attendu wave ou orange_money)', p_operator;
  END IF;

  IF p_phone IS NULL OR p_phone !~ '^7[0-9]{8}$' THEN
    RAISE EXCEPTION 'Numéro invalide : format attendu 7XXXXXXXX';
  END IF;

  INSERT INTO public.gerant_payout_info (gerant_id, phone, operator, country)
  VALUES (auth.uid(), p_phone, p_operator, COALESCE(p_country, 'SN'))
  ON CONFLICT (gerant_id) DO UPDATE SET
    phone = EXCLUDED.phone,
    operator = EXCLUDED.operator,
    country = EXCLUDED.country,
    updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'gerant_id', v_row.gerant_id, 'phone', v_row.phone,
    'operator', v_row.operator, 'country', v_row.country
  );
END;
$$;

-- ── Garde-fou : un terrain ne peut être approuvé (et donc devenir
-- réservable) que si son gérant a déjà renseigné ses informations de
-- versement. gerant_id est nullable sur terrains (ON DELETE SET NULL) —
-- un terrain orphelin est bloqué aussi (personne à qui verser).
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
DECLARE
  v_gerant_id UUID;
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

  SELECT gerant_id INTO v_gerant_id FROM public.terrains WHERE id = p_terrain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  IF p_decision = 'approved' THEN
    IF v_gerant_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.gerant_payout_info WHERE gerant_id = v_gerant_id
    ) THEN
      RAISE EXCEPTION 'Impossible d''approuver : le gérant doit renseigner ses informations de paiement (Wave/Orange Money) avant qu''un terrain soit réservable';
    END IF;
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

-- ============================================================
-- Vérification post-migration :
-- SELECT public.upsert_gerant_payout_info('771234567', 'wave', 'SN'); -- en session gérant
-- SELECT public.admin_review_terrain('<terrain_sans_payout_info>', 'approved'); -- doit RAISE EXCEPTION
-- SELECT public.admin_review_terrain('<terrain_avec_payout_info>', 'approved'); -- doit réussir
-- ============================================================
