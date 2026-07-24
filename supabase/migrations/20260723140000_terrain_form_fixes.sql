-- ============================================================
-- Migration : correctifs suite au bug "Soumettre pour validation" sans
-- effet visible. Le formulaire collecte des `horaires` qui n'avaient
-- aucune colonne pour les recevoir — ajoutée ici. + RPC list_pending_terrains
-- (Tâche 3 du message précédent), simple alias nommé sur admin_list_terrains
-- déjà filtrable par statut de validation.
-- ============================================================

ALTER TABLE public.terrains ADD COLUMN IF NOT EXISTS horaires TEXT;

CREATE OR REPLACE FUNCTION public.list_pending_terrains(
  p_page      INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.admin_list_terrains(NULL, NULL, NULL, p_page, p_page_size, 'pending'::public.statut_validation_terrain);
$$;
-- L'autorisation (admin/super_admin uniquement) est déjà appliquée à
-- l'intérieur de admin_list_terrains — pas besoin de la dupliquer ici.
