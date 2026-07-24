-- ============================================================
-- Migration : upload de documents justificatifs pour la validation
-- admin d'un terrain (pièce d'identité du gérant, justificatif de
-- propriété/gestion du complexe, etc.).
--
-- Différence importante avec terrain_photos (migration 20260723130000) :
-- ces documents ne deviennent JAMAIS publics, même une fois le terrain
-- approuvé — seuls le gérant propriétaire et les admins peuvent les
-- consulter, à tout moment. Ce ne sont pas des photos marketing, ce sont
-- des pièces de vérification d'identité/légitimité.
--
-- Même pattern "dossier brouillon" que terrain_photos pour permettre
-- l'upload avant même l'INSERT du terrain (id pré-généré côté client).
-- ============================================================

-- ── 1. Bucket privé ──────────────────────────────────────────
-- PDF + photos (beaucoup de justificatifs sont pris en photo plutôt que
-- scannés). 10 Mo : un peu plus large que terrain-photos (8 Mo) car un
-- PDF scanné multi-pages peut être plus lourd qu'une simple photo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'terrain-documents', 'terrain-documents', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. RLS sur storage.objects (bucket terrain-documents) ──────
-- Convention de chemin identique à terrain-photos : <terrain_id>/<uuid>.<ext>

DO $$ BEGIN
  CREATE POLICY "terrain_documents_storage_select" ON storage.objects FOR SELECT
    USING (
      bucket_id = 'terrain-documents'
      AND (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.terrains t
          WHERE t.id::text = (storage.foldername(name))[1] AND t.gerant_id = auth.uid()
        )
        -- Jamais de branche "approved" ici, contrairement à terrain-photos :
        -- ces documents restent privés indéfiniment, quel que soit le
        -- statut de validation du terrain.
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_documents_storage_insert" ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'terrain-documents'
      AND (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.terrains t
          WHERE t.id::text = (storage.foldername(name))[1] AND t.gerant_id = auth.uid()
        )
        OR (
          -- Dossier brouillon : terrain pas encore créé, id pré-généré
          -- côté client (même logique que terrain-photos, migration 20260723150000).
          public.get_my_role() = 'gerant'
          AND NOT EXISTS (SELECT 1 FROM public.terrains t WHERE t.id::text = (storage.foldername(name))[1])
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_documents_storage_delete" ON storage.objects FOR DELETE
    USING (
      bucket_id = 'terrain-documents'
      AND (
        public.is_super_admin()
        OR EXISTS (
          SELECT 1 FROM public.terrains t
          WHERE t.id::text = (storage.foldername(name))[1] AND t.gerant_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Table terrain_documents (métadonnées) ────────────────────
DO $$ BEGIN
  CREATE TYPE public.type_document_terrain AS ENUM ('piece_identite', 'justificatif_propriete', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.terrain_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  terrain_id    UUID NOT NULL REFERENCES public.terrains(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  type_document public.type_document_terrain NOT NULL DEFAULT 'autre',
  nom_original  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (terrain_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_terrain_documents_terrain ON public.terrain_documents(terrain_id);

-- Limite défensive (backend, pas juste front) : 5 documents max par terrain.
CREATE OR REPLACE FUNCTION public.check_terrain_documents_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.terrain_documents WHERE terrain_id = NEW.terrain_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 documents par terrain';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_check_terrain_documents_limit
    BEFORE INSERT ON public.terrain_documents
    FOR EACH ROW EXECUTE FUNCTION public.check_terrain_documents_limit();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nettoyage best-effort du fichier de stockage (même caveat que pour
-- terrain_photos : une suppression SQL brute dans storage.objects peut ne
-- pas purger les octets réels dans tous les cas côté backend S3-compatible).
CREATE OR REPLACE FUNCTION public.cleanup_terrain_document_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id = 'terrain-documents' AND name = OLD.storage_path;
  RETURN OLD;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_cleanup_terrain_document_storage
    AFTER DELETE ON public.terrain_documents
    FOR EACH ROW EXECUTE FUNCTION public.cleanup_terrain_document_storage();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. RLS sur terrain_documents (métadonnées) ──────────────────
-- Même règle stricte que le storage : jamais de visibilité publique,
-- même terrain approuvé.
ALTER TABLE public.terrain_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "terrain_documents_select_own_or_admin" ON public.terrain_documents FOR SELECT
    USING (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_documents.terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_documents_insert_gerant_own" ON public.terrain_documents FOR INSERT
    WITH CHECK (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_documents.terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "terrain_documents_delete_own_or_admin" ON public.terrain_documents FOR DELETE
    USING (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_documents.terrain_id AND t.gerant_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy UPDATE : remplacer un document = delete + insert (même
-- raisonnement que terrain_photos, évite les écritures partielles).
