-- Bug trouvé en debug live (Console navigateur) : POST .../rpc/create_reservation_safe
-- renvoyait 404 alors que la fonction existe bien dans pg_proc (vérifié en prod).
--
-- Cause : BookingFlow.jsx n'envoie jamais `creneau_id` (réservation sans créneau
-- prédéfini). L'objet JS envoyé à supabase.rpc() contient donc `p_creneau_id:
-- undefined`. JSON.stringify() SUPPRIME les clés dont la valeur est `undefined`
-- avant l'envoi HTTP — `p_creneau_id` disparaît donc entièrement du corps de la
-- requête POST. Sans DEFAULT sur ce paramètre, PostgREST ne trouve aucune
-- signature de fonction correspondant à l'ensemble de paramètres reçu et répond
-- 404 "function not found in schema cache" — trompeur, la fonction existe bien.
--
-- reservations.creneau_id est de toute façon NULLABLE (ON DELETE SET NULL,
-- schema.sql) : un DEFAULT NULL est donc sémantiquement correct, pas juste un
-- contournement.
--
-- CREATE OR REPLACE (pas DROP+CREATE) : l'ordre et les TYPES des paramètres
-- restent strictement identiques à la version précédente (migration
-- 20260725170000) — seuls des DEFAULT sont ajoutés. C'est le seul moyen sûr de
-- remplacer la fonction en place sans créer une seconde surcharge ambiguë (une
-- réorganisation de l'ordre des paramètres, elle, aurait créé un nouveau
-- overload et laissé l'ancienne fonction bugguée coexister).
CREATE OR REPLACE FUNCTION public.create_reservation_safe(
  p_terrain_id UUID,
  p_joueur_id UUID,
  p_creneau_id UUID DEFAULT NULL,
  p_terrain_nom TEXT DEFAULT NULL,
  p_joueur_nom TEXT DEFAULT NULL,
  p_date_slot DATE DEFAULT NULL,
  p_heure_slot TIME DEFAULT NULL,
  p_montant INTEGER DEFAULT NULL,
  p_duree_heures INTEGER DEFAULT 1
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO public.reservations (
      terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom,
      date_slot, heure_slot, montant, duree_heures, statut
    ) VALUES (
      p_terrain_id, p_joueur_id, p_creneau_id, p_terrain_nom, p_joueur_nom,
      p_date_slot, p_heure_slot, p_montant, COALESCE(p_duree_heures, 1), 'en_attente'
    )
    RETURNING * INTO v_reservation;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ce créneau vient d''être réservé' USING ERRCODE = '23505';
  END;

  RETURN v_reservation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reservation_safe(
  UUID, UUID, UUID, TEXT, TEXT, DATE, TIME, INTEGER, INTEGER
) TO authenticated;

-- ============================================================
-- Vérification post-migration :
-- SELECT public.create_reservation_safe(
--   p_terrain_id := '<terrain_id>', p_joueur_id := auth.uid(),
--   p_terrain_nom := 'Test', p_joueur_nom := 'Test',
--   p_date_slot := CURRENT_DATE + 1, p_heure_slot := '18:00', p_montant := 15000
-- );
-- -- doit fonctionner SANS fournir p_creneau_id ni p_duree_heures
-- ============================================================
