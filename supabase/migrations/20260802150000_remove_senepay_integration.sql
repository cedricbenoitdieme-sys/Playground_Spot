-- ============================================================
-- Migration : retrait complet de l'intégration SenePay.
--
-- Décision produit : SenePay est abandonné comme prestataire de paiement.
-- Cette migration annule intégralement les migrations 20260801170000,
-- 20260801180000, 20260801190000 et 20260802140000 (aucune autre migration
-- ne référence ces objets — vérifié). Le paiement en ligne (abonnement,
-- boost, réservation) redevient indisponible : seul le paiement "sur place"
-- reste fonctionnel tant qu'un nouveau prestataire n'est pas intégré.
--
-- Ne PAS supprimer : create_pending_subscription/create_pending_boost et
-- activate_subscription/activate_boost — ces RPC pré-existaient à SenePay
-- (héritées de UnitechPay) et restent le socle métier générique de calcul de
-- prix/activation, indépendant du prestataire de paiement.
-- ============================================================

-- ── Fonctions SECURITY DEFINER spécifiques à SenePay ──
DROP FUNCTION IF EXISTS public.finalize_reservation_payout(TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.process_reservation_payout(UUID);
DROP FUNCTION IF EXISTS public.create_pending_reservation_payment(UUID, mode_paiement, TEXT);
DROP FUNCTION IF EXISTS public.update_senepay_payment_status(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_senepay_payment_record(TEXT, TEXT, UUID, UUID, UUID, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.upsert_gerant_payout_info(TEXT, TEXT, TEXT);

-- ── Tables SenePay (CASCADE : policies, triggers, index associés) ──
DROP TABLE IF EXISTS public.gerant_payouts CASCADE;
DROP TABLE IF EXISTS public.senepay_payments CASCADE;
DROP TABLE IF EXISTS public.gerant_payout_info CASCADE;

-- ── admin_review_terrain : restauration de la version pré-SenePay
-- (migration 20260723120000), sans le garde-fou gerant_payout_info.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_review_terrain(
  p_terrain_id UUID,
  p_decision public.statut_validation_terrain,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle admin requis';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Décision invalide : % (attendu approved ou rejected)', p_decision;
  END IF;

  IF p_decision = 'rejected' AND (p_rejection_reason IS NULL OR btrim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Un motif de refus est requis';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.terrains WHERE id = p_terrain_id) THEN
    RAISE EXCEPTION 'Terrain introuvable';
  END IF;

  UPDATE public.terrains
  SET status = p_decision,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_terrain_id;

  PERFORM public.log_admin_action(
    'admin_review_terrain', 'terrain', p_terrain_id,
    jsonb_build_object('decision', p_decision, 'rejection_reason', p_rejection_reason)
  );

  RETURN json_build_object('success', true, 'terrain_id', p_terrain_id, 'status', p_decision);
END;
$$;

-- ============================================================
-- Vérification post-migration :
-- SELECT * FROM information_schema.tables WHERE table_name IN
--   ('senepay_payments', 'gerant_payout_info', 'gerant_payouts'); -- doit être vide
-- SELECT public.admin_review_terrain('<terrain_id>', 'approved'); -- ne doit
--   plus RAISE pour absence de gerant_payout_info
-- ============================================================
