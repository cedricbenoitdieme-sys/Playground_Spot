-- ============================================================
-- Migration : upload multi-photos (max 6) pour les terrains, avec
-- visibilité conditionnelle selon le statut de validation admin
-- (terrains.status déjà en place, migration 20260723120000).
--
-- DÉCISION DE CONCEPTION IMPORTANTE : bucket PRIVÉ, pas public.
-- La tâche 2 exige que les photos d'un terrain 'pending' restent
-- invisibles au public. Un bucket Supabase Storage marqué `public:true`
-- sert les fichiers via /object/public/... SANS jamais évaluer les
-- policies RLS — donc un bucket public rendrait les photos "pending"
-- récupérables par quiconque connaît/devine le chemin, RLS ou pas.
-- Avec un bucket privé, la RLS sur storage.objects est appliquée sur le
-- endpoint object standard, y compris pour la clé anonyme — donc la
-- visibilité conditionnelle demandée est réellement possible, mais le
-- frontend doit récupérer une URL SIGNÉE (supabase.storage.from(...)
-- .createSignedUrl(path, expiresIn)) plutôt qu'une URL publique stable.
-- On stocke donc `storage_path` (pas une "URL publique") dans
-- terrain_photos — c'est un écart volontaire par rapport à la tâche 3
-- telle quelle, nécessaire pour satisfaire la tâche 2.
-- ============================================================

-- ── 1. Bucket ────────────────────────────────────────────────────────
-- 8 Mo de cap dur côté bucket (haut de la fourchette demandée) ; viser
-- une compression client vers ~1-2 Mo avant upload reste recommandé
-- pour la performance, mais n'est pas imposé ici (hors périmètre SQL).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'terrain-photos', 'terrain-photos', false, 8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. RLS sur storage.objects (bucket terrain-photos) ────────────────
-- Convention de chemin : terrain-photos/<terrain_id>/<uuid>.<ext>
-- storage.foldername(name) renvoie les segments du chemin ; le premier
-- segment est donc le terrain_id.

DO $$ BEGIN
  CREATE POLICY "terrain_photos_storage_select" ON storage.objects FOR SELECT
    USING (
      bucket_id = 'terrain-photos'
      AND (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.terrains t
          WHERE t.id::text = (storage.foldername(name))[1]
            AND ((t.status = 'approved' AND t.statut = 'actif') OR t.gerant_id = auth.uid())
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_photos_storage_insert" ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'terrain-photos'
      AND (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.terrains t
          WHERE t.id::text = (storage.foldername(name))[1]
            AND t.gerant_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_photos_storage_delete" ON storage.objects FOR DELETE
    USING (
      bucket_id = 'terrain-photos'
      AND (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.terrains t
          WHERE t.id::text = (storage.foldername(name))[1]
            AND t.gerant_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy UPDATE : un remplacement de fichier passe par delete + insert
-- (évite les cas limites d'écriture partielle sur un chemin existant).

-- ── 3. Table terrain_photos (métadonnées) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.terrain_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id    UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  ordre         INTEGER NOT NULL DEFAULT 0,
  is_principale BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (terrain_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_terrain_photos_terrain ON public.terrain_photos(terrain_id, ordre);

-- Au plus une photo principale par terrain.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_principal_photo_per_terrain
  ON public.terrain_photos(terrain_id) WHERE is_principale = true;

-- ── 4. Limite de 6 photos max — appliquée côté backend (trigger), pas
-- seulement côté front, pour rester cohérente avec le reste de ce
-- schéma (RLS + triggers systématiquement utilisés en défense en
-- profondeur ailleurs dans ce projet, ex: verrouillage status terrains,
-- quotas plan_limits).
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_terrain_photos_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.terrain_photos WHERE terrain_id = NEW.terrain_id) >= 6 THEN
    RAISE EXCEPTION 'Maximum 6 photos par terrain';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_check_terrain_photos_limit
    BEFORE INSERT ON public.terrain_photos
    FOR EACH ROW EXECUTE FUNCTION public.check_terrain_photos_limit();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nettoyage best-effort du fichier de stockage associé à la suppression
-- d'une ligne terrain_photos. Note : une suppression directe dans
-- storage.objects via SQL brut peut ne pas purger les octets réels côté
-- backend S3-compatible dans tous les cas — à vérifier en pratique ;
-- ceci garantit au minimum que l'objet disparaît des listings/API.
CREATE OR REPLACE FUNCTION public.cleanup_terrain_photo_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id = 'terrain-photos' AND name = OLD.storage_path;
  RETURN OLD;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_cleanup_terrain_photo_storage
    AFTER DELETE ON public.terrain_photos
    FOR EACH ROW EXECUTE FUNCTION public.cleanup_terrain_photo_storage();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. RLS sur terrain_photos (métadonnées) — même logique de
-- visibilité que storage.objects ci-dessus, cohérence obligatoire entre
-- les deux (l'un protège les fichiers, l'autre les lignes qui les
-- référencent).
-- ============================================================
ALTER TABLE public.terrain_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "terrain_photos_select_visibility" ON public.terrain_photos FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.terrains t WHERE t.id = terrain_photos.terrain_id
        AND (
          (t.status = 'approved' AND t.statut = 'actif')
          OR t.gerant_id = auth.uid()
          OR public.is_super_admin()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_photos_insert_gerant_own" ON public.terrain_photos FOR INSERT
    WITH CHECK (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_photos.terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_photos_update_gerant_own" ON public.terrain_photos FOR UPDATE
    USING (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_photos.terrain_id AND t.gerant_id = auth.uid())
    )
    WITH CHECK (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_photos.terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_photos_delete_gerant_own" ON public.terrain_photos FOR DELETE
    USING (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_photos.terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. set_principal_photo — bascule atomique de la photo de
-- couverture (nécessaire à cause de l'index unique partiel ci-dessus :
-- un simple UPDATE client sur is_principale échouerait s'il en existe
-- déjà une).
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_principal_photo(p_photo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terrain_id UUID;
  v_gerant_id  UUID;
BEGIN
  SELECT tp.terrain_id, t.gerant_id INTO v_terrain_id, v_gerant_id
  FROM public.terrain_photos tp JOIN public.terrains t ON t.id = tp.terrain_id
  WHERE tp.id = p_photo_id;

  IF v_terrain_id IS NULL THEN
    RAISE EXCEPTION 'Photo introuvable';
  END IF;

  IF v_gerant_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE public.terrain_photos SET is_principale = false WHERE terrain_id = v_terrain_id AND is_principale = true;
  UPDATE public.terrain_photos SET is_principale = true WHERE id = p_photo_id;
END;
$$;
