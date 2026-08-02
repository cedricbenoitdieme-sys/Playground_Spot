-- ============================================================
-- Migration : intégration UnitechPay (Wave / Orange Money) +
-- correctifs de sécurité F1-F4 sur reservations/paiements.
--
-- Contexte : SenePay a été retiré (migration 20260802150000). Cette
-- migration introduit UnitechPay comme nouveau prestataire et corrige,
-- au passage, quatre failles présentes indépendamment du prestataire :
--
--   F1 — handle_payment_webhook() est SECURITY DEFINER sans REVOKE :
--        appelable par n'importe quel utilisateur authentifié via
--        /rest/v1/rpc/handle_payment_webhook avec p_status='success'.
--   F2 — reservations_update_gerant autorise joueur_id = auth.uid() en
--        UPDATE et ne verrouille que joueur_id : un joueur peut passer
--        sa propre réservation en 'confirmee' sans payer.
--   F3 — reservations_insert_joueur ne contrôle que joueur_id : rien
--        n'empêche un joueur d'insérer montant=100 sur un terrain à
--        15 000. Confirmé en prod : src/services/reservations.js
--        (createReservation) envoie le montant calculé côté client à
--        create_reservation_safe (SECURITY INVOKER, migration
--        20260725170000), qui l'insère tel quel.
--   F4 — Aucune contrainte n'empêche deux reservations actives sur le
--        même creneau_id (l'index unique existant idx_reservations_no_
--        double_booking, migration 20260725170000, porte sur (terrain_id,
--        date_slot, heure_slot) — pas sur creneau_id — et reste en place
--        inchangé ; celui posé ici est un verrou supplémentaire direct
--        sur la clé étrangère, plus robuste si les champs dénormalisés
--        venaient à diverger).
--
-- IMPORTANT — rupture de compatibilité ascendante assumée :
-- create_reservation_safe() (et donc createReservation() côté front)
-- devient inutilisable pour un joueur dès cette migration : la policy
-- reservations_insert_joueur qu'elle exploitait est supprimée (F3).
-- Toute création de réservation doit désormais passer par la nouvelle
-- RPC creer_reservation_en_attente(p_creneau_id), qui exige un vrai
-- creneau_id (contrairement au flux actuel qui invente une date/heure
-- côté client sans jamais lire la table creneaux). C'est un changement
-- d'architecture, pas un simple renommage — voir le prompt de handoff
-- frontend livré séparément.
--
-- Cette migration n'a pas pu être vérifiée contre la base réelle (accès
-- MCP Supabase refusé dans cette session) : le garde-fou anti-doublons
-- ci-dessous RAISE une erreur explicite et bloque toute la migration
-- (transaction) si des doublons existent, plutôt que de supposer leur
-- absence.
-- ============================================================

-- ============================================================
-- 0. GARDE-FOU F4 — vérification des doublons existants avant de poser
-- l'index unique. Si cette exception se déclenche, résoudre les
-- doublons manuellement (annuler l'une des réservations concurrentes)
-- avant de rejouer la migration.
-- ============================================================
DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT creneau_id FROM public.reservations
    WHERE statut IN ('en_attente', 'confirmee') AND creneau_id IS NOT NULL
    GROUP BY creneau_id HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'Migration bloquée : % creneau(x) ont plusieurs réservations actives (en_attente/confirmee) simultanées. Résoudre manuellement avant de poser idx_reservations_creneau_unique. Diagnostic : SELECT creneau_id, count(*) FROM public.reservations WHERE statut IN (''en_attente'',''confirmee'') AND creneau_id IS NOT NULL GROUP BY creneau_id HAVING count(*) > 1;', v_dupes;
  END IF;
END $$;

-- ============================================================
-- F1 — handle_payment_webhook() ne doit être appelable par aucun rôle
-- client. Signature exacte de la version courante (migration
-- 20260726100000) — la fonction elle-même n'est pas modifiée, seuls ses
-- privilèges le sont.
-- ============================================================
REVOKE ALL ON FUNCTION public.handle_payment_webhook(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- create_reservation_safe est superseded par creer_reservation_en_attente
-- ci-dessous (F3) : son INSERT reposait sur la policy reservations_insert_
-- joueur, supprimée plus bas. On ferme aussi l'accès RPC explicitement —
-- en plus (pas à la place) du retrait de la policy — pour ne pas laisser
-- un point d'entrée exécutable dont la sécurité ne tiendrait plus qu'à la
-- présence de cette seule policy.
REVOKE ALL ON FUNCTION public.create_reservation_safe(UUID, UUID, UUID, TEXT, TEXT, DATE, TIME, INTEGER, INTEGER) FROM authenticated;

-- ============================================================
-- F2 — scission de reservations_update_gerant en deux policies :
-- le staff (admin + gérant du terrain) garde le plein contrôle ; le
-- joueur ne peut plus que passer SA PROPRE réservation en 'annulee', et
-- ne peut pas en profiter pour modifier le montant au passage (même
-- classe de risque que F3, verrouillée par cohérence).
-- ============================================================
DROP POLICY IF EXISTS "reservations_update_gerant" ON public.reservations;
-- DROP IF EXISTS avant chaque CREATE (au lieu du pattern DO/EXCEPTION
-- duplicate_object utilisé ailleurs dans schema.sql) : nécessaire ici pour
-- que la migration reste rejouable, CREATE POLICY n'ayant pas de clause
-- IF NOT EXISTS.
DROP POLICY IF EXISTS "reservations_update_staff" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update_joueur_annulation" ON public.reservations;

CREATE POLICY "reservations_update_staff" ON public.reservations FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.terrains t WHERE t.id = terrain_id AND t.gerant_id = auth.uid())
  )
  WITH CHECK (
    -- Un membre du staff ne peut pas réassigner la réservation à un autre joueur.
    joueur_id = (SELECT joueur_id FROM public.reservations r2 WHERE r2.id = reservations.id)
  );

CREATE POLICY "reservations_update_joueur_annulation" ON public.reservations FOR UPDATE
  USING (joueur_id = auth.uid())
  WITH CHECK (
    joueur_id = (SELECT joueur_id FROM public.reservations r2 WHERE r2.id = reservations.id)
    AND montant  = (SELECT montant  FROM public.reservations r2 WHERE r2.id = reservations.id)
    AND statut = 'annulee'
  );

-- ============================================================
-- F3 — retrait de l'INSERT direct joueur. Plus aucune policy INSERT sur
-- reservations : toute création passe désormais par
-- creer_reservation_en_attente (SECURITY DEFINER, plus bas), qui calcule
-- le prix côté serveur et bypasse le RLS légitimement.
-- ============================================================
DROP POLICY IF EXISTS "reservations_insert_joueur" ON public.reservations;

-- ============================================================
-- F4 — verrou direct sur creneau_id, en plus de l'index existant
-- (terrain_id, date_slot, heure_slot). Le check préalable de doublons est
-- fait dans le bloc 0 ci-dessus.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_creneau_unique
  ON public.reservations (creneau_id)
  WHERE statut IN ('en_attente', 'confirmee') AND creneau_id IS NOT NULL;

-- ============================================================
-- Colonnes UnitechPay sur paiements. provider_ref n'est PAS créée :
-- ref_externe existe déjà et joue ce rôle (index unique partiel déjà en
-- place depuis la migration 20260726100000, idx_paiements_ref_externe_
-- unique) — c'est cet index qui donne l'idempotence du webhook.
-- ============================================================
ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS provider_txn_id BIGINT,
  ADD COLUMN IF NOT EXISTS commission      INTEGER,
  ADD COLUMN IF NOT EXISTS montant_net     INTEGER,
  ADD COLUMN IF NOT EXISTS payment_url     TEXT,
  ADD COLUMN IF NOT EXISTS expire_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rembourse_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_ref      TEXT;

-- Confirme/complète l'index déjà posé par 20260726100000 (idempotent,
-- no-op si déjà présent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_paiements_ref_externe_unique
  ON public.paiements (ref_externe) WHERE ref_externe IS NOT NULL;

-- Un seul ticket par réservation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_booking_id_unique
  ON public.tickets (booking_id);

-- Balayage rapide des paiements en_attente à expirer (expirer_paiements_
-- abandonnes ci-dessous).
CREATE INDEX IF NOT EXISTS idx_paiements_en_attente_expire_at
  ON public.paiements (statut, expire_at) WHERE statut = 'en_attente';

-- ============================================================
-- RPC : creer_reservation_en_attente
--
-- Point d'entrée UNIQUE pour créer une réservation (paiement en ligne ou
-- "sur place" — les deux doivent maintenant appeler cette RPC puis, pour
-- le paiement en ligne, l'edge function create-payment ; pour "sur
-- place", insérer directement un paiement mode='sur_place' avec le
-- montant RENVOYÉ par cette RPC, jamais celui saisi côté client).
--
-- SECURITY DEFINER : bypass volontaire du RLS pour l'INSERT (F3) — toute
-- l'autorisation et le calcul de prix sont faits explicitement ici, pas
-- délégués à une policy.
-- ============================================================
CREATE OR REPLACE FUNCTION public.creer_reservation_en_attente(p_creneau_id UUID)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creneau     public.creneaux%ROWTYPE;
  v_terrain     public.terrains%ROWTYPE;
  v_joueur_nom  TEXT;
  v_duree       INTEGER;
  v_montant     INTEGER;
  v_reservation public.reservations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'non_authentifie';
  END IF;

  -- Verrou pessimiste sur le créneau : sérialise les tentatives
  -- concurrentes sur le même créneau (F4). Le SELECT ne porte que sur
  -- creneaux (FOR UPDATE OF c) — les terrains ne sont pas verrouillés,
  -- leur lecture ici n'a pas besoin d'être sérialisée.
  SELECT c.* INTO v_creneau
  FROM public.creneaux c
  WHERE c.id = p_creneau_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'creneau_introuvable';
  END IF;

  IF v_creneau.statut <> 'disponible' THEN
    RAISE EXCEPTION 'creneau_indisponible';
  END IF;

  SELECT t.* INTO v_terrain FROM public.terrains t WHERE t.id = v_creneau.terrain_id;

  IF NOT FOUND OR v_terrain.statut <> 'actif' THEN
    RAISE EXCEPTION 'terrain_inactif';
  END IF;

  IF (v_creneau.date + v_creneau.heure_debut) AT TIME ZONE 'Africa/Dakar' < NOW() THEN
    RAISE EXCEPTION 'creneau_passe';
  END IF;

  v_duree   := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_creneau.heure_fin - v_creneau.heure_debut)) / 3600)::INTEGER);
  v_montant := COALESCE(v_creneau.prix_override, ROUND(v_terrain.price * v_duree));

  IF v_montant IS NULL OR v_montant < 100 THEN
    RAISE EXCEPTION 'montant_invalide';
  END IF;

  SELECT nom INTO v_joueur_nom FROM public.profiles WHERE id = auth.uid();

  BEGIN
    INSERT INTO public.reservations (
      terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom,
      date_slot, heure_slot, duree_heures, montant, statut
    ) VALUES (
      v_terrain.id, auth.uid(), v_creneau.id, v_terrain.nom, COALESCE(v_joueur_nom, 'Joueur'),
      v_creneau.date, v_creneau.heure_debut, v_duree, v_montant, 'en_attente'
    )
    RETURNING * INTO v_reservation;
  EXCEPTION WHEN unique_violation THEN
    -- Filet de sécurité : le verrou FOR UPDATE ci-dessus devrait déjà
    -- avoir empêché ce cas (la 2e transaction voit statut='reserve' après
    -- le commit de la 1re et sort sur creneau_indisponible). Ce garde-fou
    -- couvre les chemins qui contourneraient le verrou (ex: appel
    -- concurrent hors de cette fonction).
    RAISE EXCEPTION 'creneau_deja_reserve';
  END;

  RETURN v_reservation;
END;
$$;

REVOKE ALL ON FUNCTION public.creer_reservation_en_attente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_reservation_en_attente(UUID) TO authenticated;

-- ============================================================
-- RPC : handle_unitech_webhook
--
-- Seul point d'entrée pour appliquer un webhook UnitechPay. Appelée
-- exclusivement par l'edge function payment-webhook via le client
-- service_role, APRÈS vérification de la signature HMAC (jamais côté
-- SQL — le secret HMAC est la clé API, elle ne doit jamais transiter
-- vers une RPC accessible côté client).
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_unitech_webhook(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event        TEXT := p_payload->>'event';
  v_reference    TEXT := p_payload->>'reference';
  v_paiement     public.paiements%ROWTYPE;
  v_montant_recu NUMERIC;
BEGIN
  -- Log brut systématique — y compris si tout le reste échoue ensuite.
  INSERT INTO public.webhook_logs (provider, payload) VALUES ('unitechpay', p_payload);

  -- Les évènements de retrait ne concernent jamais un paiement de
  -- réservation (ceux-ci sont déclenchés par withdraw_funds, hors du
  -- cycle de vie payin traité ici).
  IF v_event LIKE 'withdrawal_%' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_retrait');
  END IF;

  SELECT * INTO v_paiement
  FROM public.paiements
  WHERE ref_externe = v_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Jamais de RAISE ici : UnitechPay retenterait indéfiniment un
    -- webhook pour une référence qu'il ne trouvera jamais côté nous.
    RETURN jsonb_build_object('ok', true, 'skipped', 'paiement_inconnu');
  END IF;

  -- Idempotence : un paiement déjà terminal (valide/rembourse) ne peut
  -- plus être réappliqué par un rejeu du même évènement.
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

    -- Garde AND statut='en_attente' : ne confirme jamais une réservation
    -- déjà annulée entre-temps (ex: expirée par expirer_paiements_
    -- abandonnes juste avant un webhook tardif).
    UPDATE public.reservations
    SET statut = 'confirmee', updated_at = NOW()
    WHERE id = v_paiement.reservation_id AND statut = 'en_attente';

    INSERT INTO public.tickets (booking_id)
    VALUES (v_paiement.reservation_id)
    ON CONFLICT (booking_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'statut', 'confirmee');

  ELSIF v_event IN ('payment_failed', 'payment_expired') THEN
    UPDATE public.paiements
    SET statut = 'echoue', updated_at = NOW()
    WHERE id = v_paiement.id;

    -- Le trigger sync_creneau_statut (inchangé) libère automatiquement le
    -- créneau dès ce passage à 'annulee'.
    UPDATE public.reservations
    SET statut = 'annulee',
        motif_annulation = CASE v_event
          WHEN 'payment_failed' THEN 'Paiement UnitechPay refusé'
          ELSE 'Paiement UnitechPay expiré côté prestataire'
        END,
        updated_at = NOW()
    WHERE id = v_paiement.reservation_id AND statut = 'en_attente';

    RETURN jsonb_build_object('ok', true, 'statut', 'echoue');
  END IF;

  RETURN jsonb_build_object('ok', true, 'skipped', 'evenement_non_gere');
END;
$$;

REVOKE ALL ON FUNCTION public.handle_unitech_webhook(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_unitech_webhook(JSONB) TO service_role;

-- ============================================================
-- RPC : expirer_paiements_abandonnes
--
-- Passe en echoue/annulee les paiements "en_attente" dont expire_at est
-- dépassé (aucun webhook reçu — abandon, oubli, silence prestataire). Le
-- trigger sync_creneau_statut libère le créneau automatiquement.
--
-- Planification pg_cron (à faire manuellement, voir INTEGRATION_
-- UNITECHPAY.md) :
--   SELECT cron.schedule('expirer-paiements-unitechpay', '*/5 * * * *',
--     $$SELECT public.expirer_paiements_abandonnes();$$);
--
-- Note : un job pg_cron générique existe déjà (expire-pending-
-- reservation-payments, migration 20260726100000, basé sur created_at
-- + 15 min plutôt que sur expire_at) et reste actif — il ne fait pas
-- double emploi dangereux (chaque UPDATE est gardé par statut='en_
-- attente'), mais les deux jobs sont redondants pour les paiements
-- UnitechPay ; à consolider séparément si souhaité.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expirer_paiements_abandonnes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired RECORD;
  v_count   INTEGER := 0;
BEGIN
  FOR v_expired IN
    SELECT p.id AS paiement_id, p.reservation_id
    FROM public.paiements p
    WHERE p.statut = 'en_attente'
      AND p.expire_at IS NOT NULL
      AND p.expire_at < NOW()
  LOOP
    UPDATE public.paiements
    SET statut = 'echoue', updated_at = NOW()
    WHERE id = v_expired.paiement_id AND statut = 'en_attente';

    IF v_expired.reservation_id IS NOT NULL THEN
      UPDATE public.reservations
      SET statut = 'annulee',
          motif_annulation = 'Paiement abandonné (délai expiré, aucune confirmation UnitechPay reçue)',
          updated_at = NOW()
      WHERE id = v_expired.reservation_id AND statut = 'en_attente';
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expirer_paiements_abandonnes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirer_paiements_abandonnes() TO service_role;

-- ============================================================
-- VUE : v_remboursements_a_traiter
--
-- UnitechPay n'a pas d'API de remboursement — le trigger sync_creneau_
-- statut (inchangé) bascule déjà un paiement 'valide' en 'rembourse' dès
-- que sa réservation passe à 'annulee', mais aucun argent ne repart
-- réellement. Cette vue liste ces paiements pour traitement manuel via
-- withdraw_funds (voir INTEGRATION_UNITECHPAY.md).
--
-- security_invoker = true est OBLIGATOIRE ici (PG15+) : sans cette
-- option, Postgres évalue les policies RLS des tables sous-jacentes avec
-- les privilèges du PROPRIÉTAIRE de la vue (le rôle qui exécute cette
-- migration, généralement doté de BYPASSRLS) plutôt qu'avec ceux de
-- l'appelant réel — ce qui exposerait TOUS les paiements à rembourser à
-- n'importe quel utilisateur authentifié, RLS ou pas. Avec
-- security_invoker, la vue applique paiements_select/reservations_select
-- avec l'identité de l'appelant, donc seul un admin (les seules policies
-- à autoriser une visibilité globale sur ces tables) voit l'ensemble des
-- lignes.
-- ============================================================
CREATE OR REPLACE VIEW public.v_remboursements_a_traiter
WITH (security_invoker = true) AS
SELECT
  p.id              AS paiement_id,
  p.reservation_id,
  p.montant,
  p.mode,
  p.ref_externe,
  p.numero_tel,
  p.updated_at      AS rembourse_declenche_at,
  r.terrain_nom,
  r.joueur_nom,
  r.motif_annulation,
  pr.tel            AS joueur_tel_profil
FROM public.paiements p
JOIN public.reservations r ON r.id = p.reservation_id
LEFT JOIN public.profiles pr ON pr.id = r.joueur_id
WHERE p.statut = 'rembourse' AND p.rembourse_at IS NULL;

GRANT SELECT ON public.v_remboursements_a_traiter TO authenticated;

-- ============================================================
-- Vérification post-migration :
--
-- -- F1 : doit échouer en session authenticated normale (permission denied)
-- SELECT public.handle_payment_webhook('x', '{}'::jsonb, 'x', 'success');
-- SELECT public.handle_unitech_webhook('{}'::jsonb);
--
-- -- F2 : un joueur ne doit plus pouvoir confirmer sa réservation
-- UPDATE public.reservations SET statut = 'confirmee' WHERE id = '<sa_reservation>';
-- -- -> 0 ligne affectée (bloqué par WITH CHECK, silencieux côté PostgREST/RLS)
--
-- -- F3 : plus aucun INSERT direct possible
-- INSERT INTO public.reservations (...) VALUES (...); -- -> RLS violation
--
-- -- F4 : deux appels concurrents sur le même creneau_id
-- SELECT public.creer_reservation_en_attente('<creneau_id>');
-- -- 2e appel simultané -> ERROR: creneau_indisponible ou creneau_deja_reserve
--
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('reservations','paiements','tickets')
--   AND indexname IN ('idx_reservations_creneau_unique','idx_paiements_ref_externe_unique',
--                      'idx_tickets_booking_id_unique','idx_paiements_en_attente_expire_at');
-- -- -> 4 lignes
-- ============================================================
