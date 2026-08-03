-- ============================================================
-- Migration : rendre réelle la commission plateforme (par plan) +
-- dérogation temporaire globale (ex: 0% pendant une période de fête).
--
-- Constat : `calculate_commission(reservation_id)` (migration
-- 20260722150000) calcule déjà correctement la commission par plan via
-- `plan_limits.commission_rate` et la verrouille sur `paiements.
-- commission_rate_applique`/`commission_montant` — mais n'est appelée
-- NULLE PART dans le code (Edge Functions, RPC, frontend). Code mort
-- depuis sa création : ces deux colonnes sont restées NULL en prod.
--
-- Par ailleurs, "Commission plateforme" et "Mode maintenance" dans
-- Parametres.jsx passent par un ancien backend Express
-- (backend/server.js, routes /api/settings) qui n'est pas joignable
-- depuis le frontend en production (déjà repéré ce jour : "Cannot GET
-- /api/settings"). Cette migration ne touche pas au routing frontend
-- (prompt séparé), mais s'assure que tout ce dont le frontend a besoin
-- est lisible/appelable directement via Supabase (RLS déjà correcte sur
-- system_settings et plan_limits — aucun changement RLS nécessaire ici).
-- ============================================================

-- ── 1. calculate_commission() — ajoute la prise en compte d'une
-- dérogation globale temporaire, stockée dans system_settings sous la clé
-- 'commission_override' : {"rate": 0, "expires_at": "2026-..."}. Pas de
-- job de "retour à la normale" nécessaire : la dérogation s'arrête
-- d'elle-même dès que expires_at est dépassé, calculate_commission()
-- retombe alors naturellement sur le taux du plan à la prochaine
-- réservation confirmée. Le verrouillage par réservation (déjà en place)
-- garantit qu'une réservation payée PENDANT la dérogation garde son taux
-- à 0% pour toujours, même après expiration de la dérogation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_commission(p_reservation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_paiement  public.paiements%ROWTYPE;
  v_gerant_id UUID;
  v_rate      NUMERIC(5,2);
  v_montant   INTEGER;
  v_override  JSONB;
BEGIN
  SELECT * INTO v_paiement FROM public.paiements WHERE reservation_id = p_reservation_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun paiement trouvé pour la réservation %', p_reservation_id;
  END IF;

  IF v_paiement.commission_rate_applique IS NOT NULL THEN
    RETURN json_build_object(
      'reservation_id', p_reservation_id,
      'commission_rate', v_paiement.commission_rate_applique,
      'commission_montant', v_paiement.commission_montant,
      'deja_verrouille', true
    );
  END IF;

  SELECT t.gerant_id INTO v_gerant_id
  FROM public.reservations r JOIN public.terrains t ON t.id = r.terrain_id
  WHERE r.id = p_reservation_id;

  IF v_gerant_id IS NULL THEN
    RAISE EXCEPTION 'Terrain/gérant introuvable pour la réservation %', p_reservation_id;
  END IF;

  -- Dérogation globale active ? Sinon, taux du plan comme avant.
  SELECT value INTO v_override FROM public.system_settings WHERE key = 'commission_override';

  IF v_override IS NOT NULL
     AND v_override ? 'expires_at'
     AND (v_override->>'expires_at')::TIMESTAMPTZ > NOW()
  THEN
    v_rate := (v_override->>'rate')::NUMERIC(5,2);
  ELSE
    v_rate := ((public._plan_limits_internal(v_gerant_id))->>'commission_rate')::NUMERIC(5,2);
  END IF;

  v_montant := ROUND(v_paiement.montant * v_rate / 100);

  UPDATE public.paiements
  SET commission_rate_applique = v_rate, commission_montant = v_montant
  WHERE id = v_paiement.id;

  RETURN json_build_object(
    'reservation_id', p_reservation_id,
    'commission_rate', v_rate,
    'commission_montant', v_montant,
    'deja_verrouille', false
  );
END;
$$;

-- ── 2. Brancher calculate_commission() dans le vrai flux de paiement ──
-- Ajout dans handle_unitech_webhook, branche réservation, juste après la
-- confirmation. Reproduit la fonction complète (dernière version :
-- migration 20260803210000) avec cet ajout uniquement.
CREATE OR REPLACE FUNCTION public.handle_unitech_webhook(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event            TEXT := p_payload->>'event';
  v_reference        TEXT := p_payload->>'reference';
  v_paiement         public.paiements%ROWTYPE;
  v_sub              public.subscriptions%ROWTYPE;
  v_boost            public.visibility_boosts%ROWTYPE;
  v_montant_recu     NUMERIC;
  v_montant_attendu  NUMERIC;
  v_activation       JSONB;
  v_gerant_id        UUID;
  v_pref_on          BOOLEAN;
BEGIN
  INSERT INTO public.webhook_logs (provider, payload) VALUES ('unitechpay', p_payload);

  IF v_event LIKE 'withdrawal_%' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_retrait');
  END IF;

  -- ── 1. Réservation (paiements) ──────────────────────────────────
  SELECT * INTO v_paiement FROM public.paiements WHERE ref_externe = v_reference FOR UPDATE;

  IF FOUND THEN
    IF v_paiement.statut IN ('valide', 'rembourse') THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'deja_traite');
    END IF;

    IF v_event = 'payment_completed' THEN
      v_montant_recu := (p_payload->>'amount')::NUMERIC;

      IF v_montant_recu IS DISTINCT FROM v_paiement.montant::NUMERIC THEN
        RAISE WARNING 'handle_unitech_webhook: montant incohérent pour paiement % (attendu %, reçu %, ref %)',
          v_paiement.id, v_paiement.montant, v_montant_recu, v_reference;
        RETURN jsonb_build_object('ok', true, 'skipped', 'montant_incoherent');
      END IF;

      UPDATE public.paiements
      SET statut          = 'valide',
          commission      = (p_payload->>'commission')::INTEGER,
          montant_net     = (p_payload->>'net_amount')::INTEGER,
          provider_txn_id = (p_payload->>'transaction_id')::BIGINT,
          updated_at      = NOW()
      WHERE id = v_paiement.id;

      UPDATE public.reservations
      SET statut = 'confirmee', updated_at = NOW()
      WHERE id = v_paiement.reservation_id AND statut = 'en_attente';

      INSERT INTO public.tickets (booking_id)
      VALUES (v_paiement.reservation_id)
      ON CONFLICT (booking_id) DO NOTHING;

      -- Commission plateforme (par plan, ou dérogation active) — verrouillée
      -- une fois pour toutes sur ce paiement.
      PERFORM public.calculate_commission(v_paiement.reservation_id);

      -- Notification "Paiement reçu" au gérant du terrain concerné.
      SELECT t.gerant_id INTO v_gerant_id
      FROM public.reservations r JOIN public.terrains t ON t.id = r.terrain_id
      WHERE r.id = v_paiement.reservation_id;

      IF v_gerant_id IS NOT NULL THEN
        SELECT COALESCE((p.notification_prefs->>'paiementRecu')::boolean, true)
          INTO v_pref_on FROM public.profiles p WHERE p.id = v_gerant_id;

        IF v_pref_on THEN
          INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
          VALUES (
            v_gerant_id, 'paiement_recu', 'Paiement reçu',
            'Paiement confirmé pour une réservation — ' || v_paiement.montant || ' FCFA',
            'reservation', v_paiement.reservation_id
          );
        END IF;
      END IF;

      RETURN jsonb_build_object('ok', true, 'kind', 'reservation', 'statut', 'confirmee');

    ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
      UPDATE public.paiements
      SET statut = 'echoue', updated_at = NOW()
      WHERE id = v_paiement.id;

      UPDATE public.reservations
      SET statut = 'annulee',
          motif_annulation = CASE v_event
            WHEN 'payment_failed' THEN 'Paiement UnitechPay refusé'
            ELSE 'Paiement UnitechPay expiré côté prestataire'
          END,
          updated_at = NOW()
      WHERE id = v_paiement.reservation_id AND statut = 'en_attente';

      RETURN jsonb_build_object('ok', true, 'kind', 'reservation', 'statut', 'echoue');
    END IF;

    RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
  END IF;

  -- ── 2. Abonnement (subscriptions) — inchangé ─────────────────────
  SELECT * INTO v_sub FROM public.subscriptions WHERE unitech_reference = v_reference FOR UPDATE;

  IF FOUND THEN
    IF v_sub.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'deja_traite');
    END IF;

    IF v_event = 'payment_completed' THEN
      SELECT CASE v_sub.cycle WHEN 'annuel' THEN pl.prix_annuel ELSE pl.prix_mensuel END
      INTO v_montant_attendu
      FROM public.plan_limits pl WHERE pl.plan_id = v_sub.plan_id;

      v_montant_recu := (p_payload->>'amount')::NUMERIC;

      IF v_montant_recu IS DISTINCT FROM v_montant_attendu THEN
        RAISE WARNING 'handle_unitech_webhook: montant incohérent pour abonnement % (attendu %, reçu %, ref %)',
          v_sub.id, v_montant_attendu, v_montant_recu, v_reference;
        RETURN jsonb_build_object('ok', true, 'skipped', 'montant_incoherent');
      END IF;

      v_activation := public.activate_subscription(v_reference, 'success', v_sub.phone_number)::JSONB;
    ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
      v_activation := public.activate_subscription(v_reference, v_event, v_sub.phone_number)::JSONB;
    ELSE
      RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
    END IF;

    RETURN jsonb_build_object('ok', true, 'kind', 'subscription') || v_activation;
  END IF;

  -- ── 3. Boost de visibilité (visibility_boosts) — inchangé ────────
  SELECT * INTO v_boost FROM public.visibility_boosts WHERE unitech_reference = v_reference FOR UPDATE;

  IF FOUND THEN
    IF v_boost.statut <> 'en_attente' THEN
      RETURN jsonb_build_object('ok', true, 'skipped', 'deja_traite');
    END IF;

    IF v_event = 'payment_completed' THEN
      v_montant_recu := (p_payload->>'amount')::NUMERIC;

      IF v_montant_recu IS DISTINCT FROM v_boost.budget_alloue::NUMERIC THEN
        RAISE WARNING 'handle_unitech_webhook: montant incohérent pour boost % (attendu %, reçu %, ref %)',
          v_boost.id, v_boost.budget_alloue, v_montant_recu, v_reference;
        RETURN jsonb_build_object('ok', true, 'skipped', 'montant_incoherent');
      END IF;

      v_activation := public.activate_boost(v_reference, 'success')::JSONB;
    ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
      v_activation := public.activate_boost(v_reference, v_event)::JSONB;
    ELSE
      RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
    END IF;

    RETURN jsonb_build_object('ok', true, 'kind', 'boost') || v_activation;
  END IF;

  RETURN jsonb_build_object('ok', true, 'skipped', 'paiement_inconnu');
END;
$$;

REVOKE ALL ON FUNCTION public.handle_unitech_webhook(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_unitech_webhook(JSONB) TO service_role;

-- ── 3. RPC admin : poser/lever la dérogation temporaire ─────────────
CREATE OR REPLACE FUNCTION public.set_commission_override(p_rate NUMERIC, p_duree_heures NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle admin requis';
  END IF;
  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'Le taux doit être compris entre 0 et 100';
  END IF;
  IF p_duree_heures IS NULL OR p_duree_heures <= 0 OR p_duree_heures > 24 * 90 THEN
    RAISE EXCEPTION 'La durée doit être comprise entre 1 heure et 90 jours';
  END IF;

  v_expires := NOW() + (p_duree_heures || ' hours')::INTERVAL;

  INSERT INTO public.system_settings (key, value)
  VALUES ('commission_override', jsonb_build_object('rate', p_rate, 'expires_at', v_expires, 'set_by', auth.uid(), 'set_at', NOW()))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RETURN json_build_object('rate', p_rate, 'expires_at', v_expires);
END;
$$;

REVOKE ALL ON FUNCTION public.set_commission_override(NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_commission_override(NUMERIC, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_commission_override()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : rôle admin requis';
  END IF;
  DELETE FROM public.system_settings WHERE key = 'commission_override';
END;
$$;

REVOKE ALL ON FUNCTION public.clear_commission_override() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_commission_override() TO authenticated;

-- ============================================================
-- Vérification post-migration :
--
-- SELECT plan_id, nom, commission_rate FROM plan_limits ORDER BY prix_mensuel;
--   -- doit montrer les vrais taux par plan (12/8/2/0 attendus)
--
-- SELECT public.set_commission_override(0, 48); -- en tant qu'admin connecté
-- SELECT value FROM system_settings WHERE key = 'commission_override';
-- SELECT public.clear_commission_override();
--
-- Test bout-en-bout : confirmer un paiement de réservation de test, puis
-- SELECT commission_rate_applique, commission_montant FROM paiements
--   WHERE reservation_id = '<id>'; -- ne doit plus être NULL
-- ============================================================
