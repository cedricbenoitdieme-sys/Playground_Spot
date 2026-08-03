-- ============================================================
-- Système de rang fidélité réel, calculé, configurable
-- ============================================================
-- Remplace le rang "VIP Or" figé de JoueurProfile.jsx (déjà signalé et en
-- cours de correction, cf. migration 20260802200000_joueur_profile_stats.sql
-- et scratch/PROMPT_FIX_JOUEUR_PROFILE_MOCK_STATS.md) par de vrais paliers
-- basés sur le nombre de matchs joués (réservations confirmee+terminee).
--
-- DÉCISION DE CONCEPTION — pas de colonne "rang" stockée, pas de trigger :
-- le rang est un CALCUL PUR à partir du COUNT de réservations, jamais
-- persisté nulle part. Conséquences directes, qui simplifient tout :
--   - "Se recalcule après chaque réservation" : vrai par construction,
--     sans rien à déclencher — c'est déjà le cas à chaque lecture.
--   - "Migrer les comptes existants" : rien à migrer. Aucune valeur figée
--     n'existe en base pour aucun compte (le "VIP Or" actuel est du JSX en
--     dur côté React, jamais écrit en DB) — donc dès que le frontend
--     appelle la nouvelle fonction, TOUS les comptes (anciens et nouveaux)
--     obtiennent leur vrai rang, sans script de backfill.
--   - Aucun risque d'incohérence cache/donnée réelle (pas de colonne à
--     tenir synchronisée).
--
-- CONFIGURABLE : les seuils vivent dans une table (public.loyalty_tiers),
-- pas dans du SQL/JS codé en dur — modifiable par un admin avec un simple
-- UPDATE, sans déploiement. Même pattern que public.system_settings
-- (commission_plateforme) déjà utilisé dans ce projet pour ce type de
-- paramètre business.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Config des paliers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  seuil_matchs  INTEGER NOT NULL UNIQUE CHECK (seuil_matchs >= 0),
  emoji         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed des 5 paliers proposés. ON CONFLICT DO NOTHING : idempotent, et ne
-- réécrase jamais des seuils déjà ajustés manuellement par un admin après
-- coup — c'est exactement le but de "facilement modifiables".
INSERT INTO public.loyalty_tiers (code, label, seuil_matchs, emoji) VALUES
  ('debutant',   'Débutant',   0,  '🌱'),
  ('regulier',   'Régulier',   5,  '⚽'),
  ('confirme',   'Confirmé',   15, '🔥'),
  ('vip_argent', 'VIP Argent', 30, '🥈'),
  ('vip_or',     'VIP Or',     50, '🥇')
ON CONFLICT (code) DO NOTHING;

DO $$ BEGIN
  CREATE TRIGGER trg_loyalty_tiers_updated_at
    BEFORE UPDATE ON public.loyalty_tiers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;

-- Lecture publique (le rang/la progression doivent être affichables à tout
-- utilisateur connecté, et la liste des paliers est publique par nature).
DO $$ BEGIN
  CREATE POLICY "loyalty_tiers_select_all" ON public.loyalty_tiers FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Écriture réservée à l'admin (ajuster les seuils après observation des
-- données réelles d'usage, cf. contrainte de la demande).
DO $$ BEGIN
  CREATE POLICY "loyalty_tiers_manage_admin" ON public.loyalty_tiers FOR ALL
    USING (public.get_my_role() = 'admin')
    WITH CHECK (public.get_my_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2) Calcul du rang + progression vers le palier suivant
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_loyalty_rang(p_matchs_joues INTEGER)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current RECORD;
  v_next    RECORD;
  v_result  JSON;
BEGIN
  SELECT code, label, seuil_matchs, emoji INTO v_current
  FROM public.loyalty_tiers
  WHERE seuil_matchs <= COALESCE(p_matchs_joues, 0)
  ORDER BY seuil_matchs DESC
  LIMIT 1;

  SELECT code, label, seuil_matchs, emoji INTO v_next
  FROM public.loyalty_tiers
  WHERE seuil_matchs > COALESCE(p_matchs_joues, 0)
  ORDER BY seuil_matchs ASC
  LIMIT 1;

  v_result := json_build_object(
    'code', v_current.code,
    'label', v_current.label,
    'emoji', v_current.emoji,
    'seuil_matchs', v_current.seuil_matchs,
    'matchs_joues', COALESCE(p_matchs_joues, 0),
    'prochain_palier', CASE WHEN v_next.code IS NULL THEN NULL ELSE json_build_object(
      'code', v_next.code,
      'label', v_next.label,
      'emoji', v_next.emoji,
      'seuil_matchs', v_next.seuil_matchs,
      'matchs_restants', v_next.seuil_matchs - COALESCE(p_matchs_joues, 0)
    ) END
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_loyalty_rang IS
  'Calcule le rang fidélité (et la progression vers le suivant) à partir d''un nombre de matchs joués, selon les seuils configurés dans public.loyalty_tiers. Fonction pure (aucune lecture de reservations) — réutilisable côté liste admin en la combinant à un COUNT déjà chargé, sans appel RPC par ligne.';

GRANT EXECUTE ON FUNCTION public.get_loyalty_rang(INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- 3) Intégration dans get_joueur_profile_stats() — un seul aller-retour
-- ------------------------------------------------------------
-- CREATE OR REPLACE avec signature strictement identique à la version
-- posée par 20260802200000_joueur_profile_stats.sql — ajout additif du
-- champ "rang" au JSON retourné, rien d'existant ne casse pour un
-- consommateur qui ignorerait ce nouveau champ.
CREATE OR REPLACE FUNCTION public.get_joueur_profile_stats()
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_matchs  INTEGER;
  v_heures  INTEGER;
  v_montant INTEGER;
  v_total   INTEGER;
  v_result  JSON;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE statut IN ('confirmee', 'terminee')),
    COALESCE(SUM(duree_heures) FILTER (WHERE statut IN ('confirmee', 'terminee')), 0),
    COALESCE(SUM(montant) FILTER (WHERE statut IN ('confirmee', 'terminee')), 0),
    COUNT(*)
  INTO v_matchs, v_heures, v_montant, v_total
  FROM public.reservations
  WHERE joueur_id = auth.uid();

  v_result := json_build_object(
    'matchs_joues', v_matchs,
    'heures_cumulees', v_heures,
    'montant_depense', v_montant,
    'reservations_total', v_total,
    'rang', public.get_loyalty_rang(v_matchs)
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_joueur_profile_stats() TO authenticated;

-- ============================================================
-- Vérification post-migration :
--
-- SELECT * FROM public.loyalty_tiers ORDER BY seuil_matchs;
-- -- -> 5 lignes, seuils 0/5/15/30/50
--
-- SELECT public.get_loyalty_rang(0);   -- -> code 'debutant', prochain_palier.matchs_restants = 5
-- SELECT public.get_loyalty_rang(7);   -- -> code 'regulier', prochain_palier 'confirme', matchs_restants = 8
-- SELECT public.get_loyalty_rang(50);  -- -> code 'vip_or', prochain_palier = null
--
-- -- En tant qu'utilisateur connecté :
-- SELECT public.get_joueur_profile_stats();
-- -- -> inclut maintenant "rang": {...} en plus des champs déjà existants
-- ============================================================
