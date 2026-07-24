-- ── Table public.system_settings ──
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insérer les valeurs initiales par défaut si elles n'existent pas
INSERT INTO public.system_settings (key, value) VALUES 
('mode_maintenance', 'false'::jsonb),
('commission_plateforme', '10'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Activer RLS pour la table system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policies RLS
-- Les utilisateurs anonymes et authentifiés peuvent lire les paramètres
CREATE POLICY "Allow read system_settings for everyone" ON public.system_settings
  FOR SELECT USING (true);

-- Seuls les administrateurs peuvent modifier les paramètres
CREATE POLICY "Allow write system_settings for admin" ON public.system_settings
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
