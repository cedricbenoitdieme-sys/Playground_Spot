-- ============================================================
-- Migration : bucket Storage pour les photos de profil (avatars).
--
-- Contrainte demandée : un utilisateur (admin/gérant/joueur) doit pouvoir
-- uploader/recadrer/remplacer sa photo de profil, affichée partout dans
-- l'app (header, sidebar, bottom nav, listes gérants/joueurs...).
--
-- DÉCISION DE CONCEPTION : bucket PUBLIC, contrairement à `terrain-photos`
-- (privé). Une photo de profil n'a pas de statut "pending" à cacher —
-- c'est une donnée que l'utilisateur choisit lui-même d'exposer, affichée
-- en continu dans des dizaines d'endroits de l'UI. Un bucket privé
-- imposerait de régénérer une URL signée à chaque affichage (comme
-- TerrainImage.jsx doit le faire), ce qui est inutilement coûteux ici vu
-- la fréquence d'affichage. Un bucket public sert les fichiers via
-- /object/public/... avec une URL stable, sans réévaluation RLS à la
-- lecture — donc pas de policy SELECT nécessaire, mais INSERT/UPDATE/
-- DELETE restent verrouillés à auth.uid() pour empêcher un utilisateur
-- d'écraser l'avatar d'un autre.
--
-- Convention de chemin : avatars/<user_id>/<uuid>.<ext> — le UUID (pas un
-- nom de fichier fixe) évite les problèmes de cache CDN sur remplacement
-- (une URL publique différente à chaque nouvel upload plutôt que la même
-- URL avec un contenu qui change silencieusement derrière). L'ancien
-- fichier doit être supprimé par le frontend après upload du nouveau (ou
-- laissé orphelin — volume négligeable pour des avatars, pas de trigger
-- de nettoyage automatique ici contrairement à terrain_photos, la table
-- profiles n'a qu'une seule colonne `avatar` donc pas de ligne de
-- métadonnées séparée à trianguler).
-- ============================================================

-- ── 1. Bucket ────────────────────────────────────────────────────────
-- 5 Mo de cap (une photo de profil n'a pas besoin d'être aussi lourde
-- qu'une photo de terrain) ; compression client recommandée en amont.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. RLS sur storage.objects (bucket avatars) ─────────────────────
-- storage.foldername(name) renvoie les segments du chemin ; le premier
-- segment doit être l'UUID de l'utilisateur (auth.uid()::text).

DO $$ BEGIN
  CREATE POLICY "avatars_storage_insert_own" ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "avatars_storage_update_own" ON storage.objects FOR UPDATE
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "avatars_storage_delete_own" ON storage.objects FOR DELETE
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pas de policy SELECT : bucket public, servi via /object/public/...
-- sans évaluation RLS (comportement standard Supabase Storage).

-- ============================================================
-- Vérification post-migration :
-- SELECT * FROM storage.buckets WHERE id = 'avatars'; -- public = true
-- SELECT policyname FROM pg_policies WHERE tablename = 'objects'
--   AND policyname LIKE 'avatars_%'; -- 3 lignes (insert/update/delete)
-- ============================================================
