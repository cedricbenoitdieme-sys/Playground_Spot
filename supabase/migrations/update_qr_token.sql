-- Migration: Update qr_token to UUID
-- Convert existing text tokens to UUIDs and set default

-- 1. Supprimer la vue qui dépend de la table reservations
DROP VIEW IF EXISTS public.v_reservations_full CASCADE;

-- 2. Modifier le type de la colonne
ALTER TABLE public.reservations 
  ALTER COLUMN qr_token DROP DEFAULT,
  ALTER COLUMN qr_token TYPE UUID USING gen_random_uuid(),
  ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();

-- 3. Recréer la vue
CREATE OR REPLACE VIEW public.v_reservations_full AS
SELECT
  r.*,
  t.nom           AS terrain_nom_detail,
  t.quartier      AS terrain_quartier,
  t.price         AS terrain_price,
  p.nom           AS joueur_nom_detail,
  p.tel           AS joueur_tel,
  p.email         AS joueur_email,
  pay.mode        AS paiement_mode,
  pay.statut      AS paiement_statut,
  pay.ref_externe AS paiement_ref
FROM public.reservations r
LEFT JOIN public.terrains  t   ON t.id = r.terrain_id
LEFT JOIN public.profiles  p   ON p.id = r.joueur_id
LEFT JOIN public.paiements pay ON pay.reservation_id = r.id;
