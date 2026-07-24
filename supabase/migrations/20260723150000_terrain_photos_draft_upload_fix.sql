-- ============================================================
-- Migration : correctif RLS storage.objects pour l'upload de photos
-- AVANT la création du terrain (id pré-généré côté client dans
-- GerantTerrain.jsx, cf. openCreateModal). La policy INSERT d'origine
-- (migration 20260723130000) exigeait qu'un terrain existe déjà en base
-- avec cet id et appartienne au gérant — impossible pour un terrain pas
-- encore soumis, donc tout upload lors de la création échouait avec
-- "permission denied" (42501).
--
-- Fix : autoriser aussi l'upload dans un dossier <uuid>/... quand AUCUN
-- terrain n'existe encore à cet id ("dossier brouillon"). Sûr car l'uuid
-- est généré côté client (crypto.randomUUID()) donc non devinable — un
-- autre utilisateur ne peut pas cibler ce dossier avant la soumission.
-- Une fois le terrain réellement créé, le dossier est "réclamé" et seule
-- la branche gerant_id = auth.uid() s'applique pour tout upload ultérieur.
-- ============================================================

DROP POLICY IF EXISTS "terrain_photos_storage_insert" ON storage.objects;
CREATE POLICY "terrain_photos_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'terrain-photos'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.terrains t
        WHERE t.id::text = (storage.foldername(name))[1] AND t.gerant_id = auth.uid()
      )
      OR (
        public.get_my_role() = 'gerant'
        AND NOT EXISTS (
          SELECT 1 FROM public.terrains t WHERE t.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

-- Même correctif côté SELECT : createSignedUrl() (appelé juste après
-- l'upload pour l'aperçu dans la modale) exige aussi la permission SELECT
-- sur l'objet, qui échouerait pour la même raison sans ce dossier brouillon.
DROP POLICY IF EXISTS "terrain_photos_storage_select" ON storage.objects;
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
      OR (
        public.get_my_role() = 'gerant'
        AND NOT EXISTS (
          SELECT 1 FROM public.terrains t WHERE t.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );
