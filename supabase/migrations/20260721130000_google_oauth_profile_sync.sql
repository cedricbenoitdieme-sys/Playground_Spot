-- ============================================================
-- Migration : Synchronisation de profil compatible Google OAuth
--
-- Met à jour handle_new_user() pour extraire nom/avatar depuis les
-- metadata que Google fournit (full_name/name, avatar_url/picture),
-- en plus du flow email/password existant (clé 'nom'). Le rôle par
-- défaut ('joueur') est inchangé et déjà correct pour Google, qui ne
-- fournit jamais de clé 'role'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_nom    TEXT;
  v_avatar TEXT;
BEGIN
  v_nom := COALESCE(
    NEW.raw_user_meta_data->>'nom',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  v_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.profiles (id, nom, email, role, quartier, tel, avatar)
  VALUES (
    NEW.id,
    v_nom,
    NEW.email,
    CASE COALESCE(NEW.raw_user_meta_data->>'role', '')
      WHEN 'admin' THEN 'admin'::public.role_utilisateur
      WHEN 'gerant' THEN 'gerant'::public.role_utilisateur
      ELSE 'joueur'::public.role_utilisateur
    END,
    NEW.raw_user_meta_data->>'quartier',
    NEW.raw_user_meta_data->>'tel',
    v_avatar
  )
  ON CONFLICT (id) DO UPDATE SET
    nom = EXCLUDED.nom,
    role = EXCLUDED.role,
    quartier = EXCLUDED.quartier,
    tel = EXCLUDED.tel,
    -- Ne jamais écraser un avatar déjà personnalisé par l'utilisateur
    avatar = COALESCE(public.profiles.avatar, EXCLUDED.avatar);
  RETURN NEW;
END;
-- SECURITY DEFINER inchangé : voir la justification déjà présente dans
-- supabase/schema.sql pour handle_new_user().
$$ LANGUAGE plpgsql SECURITY DEFINER;
