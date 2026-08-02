-- ============================================================
-- Migration : active Supabase Realtime sur public.reservations.
--
-- Nécessaire pour le nouveau flux UnitechPay : le front observe
-- reservations.statut (en_attente -> confirmee/annulee) via Realtime au
-- lieu de dépendre d'une URL de callback (aucune confirmation ne transite
-- par callback_success/callback_cancel, cf. INTEGRATION_UNITECHPAY.md).
--
-- Idempotent : ALTER PUBLICATION ... ADD TABLE échoue si la table est déjà
-- membre de la publication, d'où le check préalable sur pg_publication_tables.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
  END IF;
END $$;

-- ============================================================
-- Vérification post-migration :
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reservations';
-- -- -> 1 ligne
-- ============================================================
