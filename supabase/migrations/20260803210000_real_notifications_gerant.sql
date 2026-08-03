-- ============================================================
-- Migration : rendre réels 4 des 6 événements du panneau "Notifications"
-- de Parametres.jsx (jusqu'ici de purs toggles décoratifs, useState local
-- jamais persisté, aucun événement câblé côté backend).
--
-- Décision produit (2026-08-03) : uniquement des notifications in-app via
-- la table `notifications` existante (celle qui alimente la cloche du
-- header) — pas d'email, pas de SMS. Et seulement 4 événements sur les 6
-- affichés dans l'UI actuelle :
--   - Nouvelle réservation      → trigger sur INSERT reservations
--   - Paiement reçu             → hook dans handle_unitech_webhook
--   - Alerte taux d'occupation  → cron quotidien
--   - Rapport hebdomadaire      → cron chaque lundi
-- "Nouveau gérant inscrit" et "Alertes SMS" sont explicitement RETIRÉS
-- (pas de vrai flux self-service gérant à notifier ; pas de fournisseur
-- SMS) — le retrait de ces deux toggles côté UI est un prompt frontend
-- séparé, pas traité ici.
-- ============================================================

-- ── 1. Préférences de notification par utilisateur ──────────────────
-- JSONB plutôt qu'une table dédiée : un seul petit bag de préférences par
-- utilisateur, pas de relation à modéliser, cohérent avec la simplicité
-- déjà en place pour d'autres réglages ponctuels sur `profiles`.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT jsonb_build_object(
    'nouvelleReservation', true,
    'paiementRecu', true,
    'alerteOccupation', false,
    'rapportHebdo', true
  );

-- ── 2. Nouvelle réservation → notifie le gérant du terrain ──────────
CREATE OR REPLACE FUNCTION public.notify_gerant_nouvelle_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gerant_id UUID;
  v_pref_on   BOOLEAN;
BEGIN
  SELECT t.gerant_id INTO v_gerant_id FROM public.terrains t WHERE t.id = NEW.terrain_id;
  IF v_gerant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((p.notification_prefs->>'nouvelleReservation')::boolean, true)
    INTO v_pref_on FROM public.profiles p WHERE p.id = v_gerant_id;

  IF v_pref_on THEN
    INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
    VALUES (
      v_gerant_id, 'nouvelle_reservation', 'Nouvelle réservation',
      NEW.joueur_nom || ' a réservé ' || NEW.terrain_nom || ' le ' || to_char(NEW.date_slot, 'DD/MM/YYYY') || ' à ' || to_char(NEW.heure_slot, 'HH24:MI'),
      'reservation', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_notify_gerant_nouvelle_reservation
    AFTER INSERT ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.notify_gerant_nouvelle_reservation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Paiement reçu → ajoute la notification dans handle_unitech_webhook ──
-- Reproduit la fonction complète (dernière version : migration
-- 20260803100000) avec l'ajout de la notification, dans la branche
-- réservation uniquement (paiement de réservation = argent perçu par le
-- gérant pour un booking sur son terrain — c'est le sens de "Paiement
-- reçu" dans l'UI ; les paiements d'abonnement/boost ne déclenchent pas
-- cette notification, ils ont déjà leur propre retour visuel immédiat
-- côté payeur).
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

-- ── 4. Alerte taux d'occupation — cron quotidien ────────────────────
-- Définition retenue : pour chaque terrain actif, sur les créneaux du
-- jour (CURRENT_DATE), taux = créneaux 'reserve' / total créneaux définis
-- ce jour-là. Ignoré si aucun créneau défini (rien à comparer). Dédupliqué
-- par jour (une seule alerte par terrain par jour, même si le cron tourne
-- plusieurs fois).
CREATE OR REPLACE FUNCTION public.check_alertes_occupation()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_terrain     RECORD;
  v_total       INTEGER;
  v_reserves    INTEGER;
  v_taux        NUMERIC;
  v_pref_on     BOOLEAN;
  v_deja_notifie BOOLEAN;
  v_count       INTEGER := 0;
BEGIN
  FOR v_terrain IN
    SELECT t.id, t.nom, t.gerant_id
    FROM public.terrains t
    WHERE t.statut = 'actif' AND t.gerant_id IS NOT NULL
  LOOP
    SELECT COUNT(*), COUNT(*) FILTER (WHERE statut = 'reserve')
    INTO v_total, v_reserves
    FROM public.creneaux
    WHERE terrain_id = v_terrain.id AND date = CURRENT_DATE;

    IF v_total = 0 THEN
      CONTINUE;
    END IF;

    v_taux := v_reserves::NUMERIC / v_total;
    IF v_taux >= 0.5 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE((p.notification_prefs->>'alerteOccupation')::boolean, false)
      INTO v_pref_on FROM public.profiles p WHERE p.id = v_terrain.gerant_id;
    IF NOT v_pref_on THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = v_terrain.gerant_id
        AND type = 'alerte_occupation'
        AND resource_id = v_terrain.id
        AND created_at::date = CURRENT_DATE
    ) INTO v_deja_notifie;
    IF v_deja_notifie THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
    VALUES (
      v_terrain.gerant_id, 'alerte_occupation', 'Taux d''occupation faible',
      v_terrain.nom || ' est occupé à ' || ROUND(v_taux * 100) || '% aujourd''hui (< 50%)',
      'terrain', v_terrain.id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.check_alertes_occupation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_alertes_occupation() TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('check-alertes-occupation-quotidien');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Une fois par jour à 18h (heure serveur = UTC = heure Dakar) : assez tard
-- pour que la journée soit représentative, assez tôt pour agir encore.
SELECT cron.schedule(
  'check-alertes-occupation-quotidien',
  '0 18 * * *',
  $$SELECT public.check_alertes_occupation();$$
);

-- ── 5. Rapport hebdomadaire — cron chaque lundi ─────────────────────
CREATE OR REPLACE FUNCTION public.generer_rapports_hebdomadaires()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gerant      RECORD;
  v_nb_resa     INTEGER;
  v_revenu      NUMERIC;
  v_count       INTEGER := 0;
BEGIN
  FOR v_gerant IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'gerant'
      AND COALESCE((p.notification_prefs->>'rapportHebdo')::boolean, true)
      AND EXISTS (SELECT 1 FROM public.terrains t WHERE t.gerant_id = p.id)
  LOOP
    SELECT COUNT(*), COALESCE(SUM(r.montant), 0)
    INTO v_nb_resa, v_revenu
    FROM public.reservations r
    JOIN public.terrains t ON t.id = r.terrain_id
    WHERE t.gerant_id = v_gerant.id
      AND r.statut IN ('confirmee', 'terminee')
      AND r.created_at >= NOW() - INTERVAL '7 days';

    INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
    VALUES (
      v_gerant.id, 'rapport_hebdomadaire', 'Rapport hebdomadaire',
      v_nb_resa || ' réservation(s) confirmée(s) — ' || v_revenu || ' FCFA générés cette semaine',
      NULL, NULL
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generer_rapports_hebdomadaires() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generer_rapports_hebdomadaires() TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('rapport-hebdomadaire-lundi');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Chaque lundi à 8h.
SELECT cron.schedule(
  'rapport-hebdomadaire-lundi',
  '0 8 * * 1',
  $$SELECT public.generer_rapports_hebdomadaires();$$
);

-- ============================================================
-- Vérification post-migration :
--
-- SELECT notification_prefs FROM profiles LIMIT 1; -- doit contenir les 4 clés
--
-- SELECT jobname FROM cron.job WHERE jobname IN
--   ('check-alertes-occupation-quotidien', 'rapport-hebdomadaire-lundi'); -- 2 lignes
--
-- Test manuel (à exécuter en tant que service_role ou via SQL Editor admin) :
-- SELECT public.check_alertes_occupation();
-- SELECT public.generer_rapports_hebdomadaires();
-- ============================================================
