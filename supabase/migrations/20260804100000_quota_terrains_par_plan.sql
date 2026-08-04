-- ============================================================
-- Migration : applique réellement la limite de terrains par plan
-- (plan_limits.max_terrains) à la création de terrain par un gérant.
--
-- Constat : `check_quota(p_user_id, 'terrains')` existe déjà (migration
-- 20260722150000) et calcule correctement la limite/l'usage, mais n'est
-- appelée nulle part — aucun blocage réel. La policy RLS
-- `terrains_insert_gerant_self` (migration 20260723120000) autorise un
-- gérant à insérer un nombre illimité de terrains, sans vérifier son plan.
--
-- DÉCISION DE CONCEPTION : trigger BEFORE INSERT plutôt qu'une RPC dédiée
-- de création — même pattern que `check_terrain_photos_limit` (limite de
-- 6 photos/terrain, migration 20260723130000). Avantages : atomique (pas
-- de race condition entre vérification et insertion, contrairement à un
-- appel RPC séparé côté client avant l'insert), et ne nécessite AUCUN
-- changement du chemin d'insertion existant côté frontend
-- (`createGerantTerrain` dans services/terrains.js continue de faire un
-- insert direct — il se fait maintenant rejeter proprement si le quota
-- est atteint, au lieu de réussir sans limite).
--
-- Un admin qui crée un terrain pour un gérant (onboarding manuel) n'est
-- jamais soumis à cette limite.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_terrain_quota_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_terrains  INTEGER;
  v_current_count INTEGER;
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  v_max_terrains := ((public._plan_limits_internal(NEW.gerant_id))->>'max_terrains')::INTEGER;

  -- max_terrains NULL = illimité (Pro/Entreprise) — rien à vérifier.
  IF v_max_terrains IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.terrains
    WHERE gerant_id = NEW.gerant_id;

    IF v_current_count >= v_max_terrains THEN
      -- Préfixe stable "quota_terrains_atteint" pour que le frontend
      -- puisse distinguer ce cas d'une erreur générique et afficher un
      -- message d'upsell plutôt que l'erreur Postgres brute — même
      -- convention que RESERVATION_ERROR_MAP côté create-payment.
      RAISE EXCEPTION 'quota_terrains_atteint: votre plan actuel autorise au maximum % terrain(s). Passez à un forfait supérieur pour en ajouter davantage.', v_max_terrains;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_check_terrain_quota
    BEFORE INSERT ON public.terrains
    FOR EACH ROW EXECUTE FUNCTION public.check_terrain_quota_before_insert();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Vérification post-migration :
--
-- -- En session gérant Free (max_terrains=1) ayant déjà 1 terrain :
-- INSERT INTO terrains (nom, quartier, price, gerant_id, status)
--   VALUES ('Test', 'Plateau', 5000, auth.uid(), 'pending');
-- -- -> ERROR: quota_terrains_atteint: votre plan actuel autorise au
-- --    maximum 1 terrain(s)...
--
-- -- En session gérant Pro/Entreprise (max_terrains=NULL) : aucun blocage,
-- -- quel que soit le nombre de terrains déjà créés.
-- ============================================================
