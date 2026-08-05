-- ============================================================
-- Migration : Correction de fuites de données via la clé anon
--
-- Constat (audit RLS du 2026-08-05) :
--   1) La policy "profiles_select_public" (USING true) laissait
--      n'importe qui — y compris non authentifié — lire email/tel
--      en clair de TOUS les profils. Le masquage côté React
--      (maskSensitiveData dans src/services/profiles.js) est
--      cosmétique : les données brutes partent déjà dans la
--      réponse réseau avant d'être masquées à l'affichage.
--   2) La vue public.v_reservations_full (jointure reservations +
--      profiles + paiements, donc tel/email/montant/référence de
--      paiement de TOUTES les réservations) et public.v_terrains_details
--      (tel/email des gérants) avaient hérité des privilèges par
--      défaut Supabase (GRANT à anon/authenticated), sans qu'aucun
--      code applicatif ne les utilise (vérifié : aucune référence
--      dans src/, supabase/functions/, backend/, ni dans les autres
--      migrations SQL).
--
-- Correctif :
--   - profiles : lecture directe restreinte au propriétaire + admin.
--   - profiles_public : nouvelle vue ne portant que les colonnes
--     non sensibles, pour les usages publics légitimes (annuaire
--     gérants, compteurs, recherche admin du chat, etc.).
--   - v_reservations_full / v_terrains_details : accès anon/
--     authenticated révoqué (les RPC admin_* SECURITY DEFINER
--     gardent l'accès car elles s'exécutent avec les droits du
--     propriétaire, indépendamment de ce GRANT).
-- ============================================================

-- ── 1. Verrouillage de l'accès direct à public.profiles ────────
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.get_my_role() = 'admin');

-- ── 2. Vue publique sans colonnes sensibles ─────────────────────
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id,
  nom,
  role,
  quartier,
  statut,
  avatar,
  note_moyenne,
  created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ── 3. Fermeture des vues non utilisées mais grand ouvertes ─────
REVOKE ALL ON public.v_reservations_full FROM anon, authenticated;
REVOKE ALL ON public.v_terrains_details  FROM anon, authenticated;
