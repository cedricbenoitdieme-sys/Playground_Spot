-- ============================================================
-- Migration : suivi fiable du statut de paiement d'une réservation, pour
-- que le statut ne dépende JAMAIS d'une déclaration manuelle du joueur.
--
-- NOTE (correction d'une prémisse) : PlaygroundSpot n'a PAS de table
-- `bookings` — la table s'appelle `reservations`, les paiements vivent
-- dans `paiements` (liée par reservation_id), le statut du paiement est
-- `paiements.statut` (enum statut_paiement), pas `payment_status`. Adapté
-- en conséquence sur le schéma réel plutôt que de créer des colonnes en
-- double sous des noms différents.
--
-- Autre correction : PlaygroundSpot (ahqtcgxrewrfbowblygu) et Sama Boutik
-- (utpgotetbzobsjnhbqkc) sont DEUX projets Supabase distincts, pas une
-- infra partagée — pas de risque de collision de nom entre les deux,
-- mais les noms ci-dessous restent explicites par bonne pratique.
-- ============================================================

-- ── 1. Colonnes manquantes sur paiements ────────────────────────────────
ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_url TEXT,
  ADD COLUMN IF NOT EXISTS webhook_payload JSONB;

-- ── 2. Index unique sur ref_externe — MANQUANT jusqu'ici. Sans lui,
-- deux lignes `paiements` pourraient partager la même ref_externe (ex:
-- collision, retry d'initiation) et handle_payment_webhook (SELECT ...
-- WHERE ref_externe = p_reference, sans LIMIT) prendrait une ligne au
-- hasard côté Postgres — potentiellement le MAUVAIS paiement confirmé.
-- Partiel (WHERE NOT NULL) : certains modes ('sur_place') n'ont jamais de
-- ref_externe.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_paiements_ref_externe_unique
  ON public.paiements (ref_externe) WHERE ref_externe IS NOT NULL;

-- ── 3. Nouveau statut terminal 'expire' (distinct de 'echoue' — un rejet
-- explicite de paiement n'est pas la même situation qu'un simple abandon/
-- timeout sans réponse d'UnitechPay).
DO $$ BEGIN
  ALTER TYPE public.statut_paiement ADD VALUE IF NOT EXISTS 'expire';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. handle_payment_webhook — ajoute confirmed_at + webhook_payload
-- par ligne (en plus du log global déjà existant dans webhook_logs).
-- Idempotence déjà en place depuis la migration 20260725170000
-- (transition uniquement depuis 'en_attente') — inchangée ici.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_payment_webhook(
  p_provider TEXT,
  p_payload JSONB,
  p_reference TEXT,
  p_status TEXT
)
RETURNS VOID AS $$
DECLARE
  v_reservation_id UUID;
  v_paiement_id UUID;
  v_current_statut public.statut_paiement;
  v_rows_updated INT;
BEGIN
  INSERT INTO public.webhook_logs (provider, payload)
  VALUES (p_provider, p_payload);

  SELECT id, reservation_id, statut INTO v_paiement_id, v_reservation_id, v_current_statut
  FROM public.paiements
  WHERE ref_externe = p_reference;

  IF v_paiement_id IS NULL THEN
    RAISE EXCEPTION 'Paiement introuvable pour la référence externe %', p_reference;
  END IF;

  IF v_current_statut <> 'en_attente' THEN
    RAISE NOTICE 'handle_payment_webhook: paiement % déjà au statut % — rejeu ignoré (idempotence)', v_paiement_id, v_current_statut;
    RETURN;
  END IF;

  IF p_status IN ('success', 'approved', 'completed', 'paid') THEN
    UPDATE public.paiements
    SET statut = 'valide', confirmed_at = NOW(), webhook_payload = p_payload, updated_at = NOW()
    WHERE id = v_paiement_id AND statut = 'en_attente';
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated > 0 THEN
      UPDATE public.reservations
      SET statut = 'confirmee', updated_at = NOW()
      WHERE id = v_reservation_id;
    END IF;
  ELSIF p_status IN ('failed', 'declined', 'cancelled') THEN
    UPDATE public.paiements
    SET statut = 'echoue', webhook_payload = p_payload, updated_at = NOW()
    WHERE id = v_paiement_id AND statut = 'en_attente';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Expiration automatique des paiements/réservations abandonnés ────
-- Si un paiement reste 'en_attente' plus de 15 minutes (aucun webhook
-- reçu — abandon, oubli, échec silencieux côté opérateur), il passe à
-- 'expire' et sa réservation associée à 'annulee'. Le trigger déjà
-- existant trg_sync_creneau (schema.sql) remet alors automatiquement le
-- créneau à 'disponible' — aucune duplication de cette logique ici.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_pending_reservation_payments()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired RECORD;
BEGIN
  FOR v_expired IN
    SELECT p.id AS paiement_id, p.reservation_id
    FROM public.paiements p
    WHERE p.statut = 'en_attente'
      AND p.created_at < NOW() - INTERVAL '15 minutes'
      AND p.reservation_id IS NOT NULL
  LOOP
    UPDATE public.paiements
    SET statut = 'expire', updated_at = NOW()
    WHERE id = v_expired.paiement_id AND statut = 'en_attente';

    UPDATE public.reservations
    SET statut = 'annulee', motif_annulation = 'Paiement expiré (délai de 15 minutes dépassé, aucune confirmation reçue)', updated_at = NOW()
    WHERE id = v_expired.reservation_id AND statut = 'en_attente';
  END LOOP;
END;
$$;

DO $$ BEGIN
  PERFORM cron.unschedule('expire-pending-reservation-payments');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'expire-pending-reservation-payments',
  '*/5 * * * *', -- toutes les 5 minutes (délai de grâce de 15 min, marge raisonnable)
  $$SELECT public.expire_pending_reservation_payments();$$
);

-- ── 6. get_reservation_payment_status — RPC de polling pour le front,
-- strictement en lecture, jamais d'écriture possible depuis le client
-- (seul handle_payment_webhook, SECURITY DEFINER appelé uniquement par
-- les edge functions/webhooks, peut changer le statut).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_reservation_payment_status(p_reference TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_paiement public.paiements%ROWTYPE;
  v_joueur_id UUID;
  v_reservation_statut public.statut_reservation;
BEGIN
  SELECT * INTO v_paiement FROM public.paiements WHERE ref_externe = p_reference;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable pour cette référence';
  END IF;

  SELECT joueur_id, statut INTO v_joueur_id, v_reservation_statut
  FROM public.reservations WHERE id = v_paiement.reservation_id;

  IF v_joueur_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN json_build_object(
    'statut_paiement', v_paiement.statut,
    'statut_reservation', v_reservation_statut,
    'confirmed_at', v_paiement.confirmed_at,
    'reservation_id', v_paiement.reservation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reservation_payment_status(TEXT) TO authenticated;

-- ============================================================
-- Vérification post-migration :
-- SELECT indexname FROM pg_indexes WHERE tablename = 'paiements' AND indexname = 'idx_paiements_ref_externe_unique';
-- SELECT public.get_reservation_payment_status('<ref_externe existante>'); -- en session du joueur propriétaire
-- SELECT cron.job WHERE jobname = 'expire-pending-reservation-payments'; -- (table cron.job) doit exister
-- ============================================================
