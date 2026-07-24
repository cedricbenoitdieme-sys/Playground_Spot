-- ============================================================
-- Migration : Fix Auth Trigger (Ajout de tel et quartier)
-- ============================================================

-- Met à jour le trigger pour extraire et insérer le téléphone et le quartier
-- depuis les metadonnées de l'utilisateur lors de son inscription.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, email, role, quartier, tel)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email,
    CASE COALESCE(NEW.raw_user_meta_data->>'role', '')
      WHEN 'admin' THEN 'admin'::public.role_utilisateur
      WHEN 'gerant' THEN 'gerant'::public.role_utilisateur
      ELSE 'joueur'::public.role_utilisateur
    END,
    NEW.raw_user_meta_data->>'quartier',
    NEW.raw_user_meta_data->>'tel'
  )
  ON CONFLICT (id) DO UPDATE SET
    nom = EXCLUDED.nom,
    role = EXCLUDED.role,
    quartier = EXCLUDED.quartier,
    tel = EXCLUDED.tel;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
