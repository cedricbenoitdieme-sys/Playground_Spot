-- ============================================================
-- Correctif sécurité (audit 2026-08-05) : calculate_commission(UUID)
-- était SECURITY DEFINER sans REVOKE, contrairement à toutes les
-- autres fonctions financières du projet (handle_unitech_webhook,
-- upsert_gerant_payout_info, process_reservation_payout...). Elle
-- était donc appelable par n'importe quel compte authentifié via
-- `supabase.rpc('calculate_commission', { p_reservation_id: <uuid> })`,
-- pour n'importe quelle réservation, permettant :
--   1. de lire commission_rate/commission_montant d'un paiement
--      appartenant à un autre gérant (fuite de données financières),
--   2. de verrouiller prématurément le taux de commission d'une
--      réservation d'un tiers avant même la confirmation webhook
--      (ex. pendant une dérogation temporaire à 0%).
-- Cette fonction n'a de sens qu'appelée par handle_unitech_webhook
-- (SECURITY DEFINER, déjà verrouillé sur service_role) : on applique
-- donc le même verrouillage qu'aux autres fonctions internes.
-- ============================================================
REVOKE ALL ON FUNCTION public.calculate_commission(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_commission(UUID) TO service_role;
