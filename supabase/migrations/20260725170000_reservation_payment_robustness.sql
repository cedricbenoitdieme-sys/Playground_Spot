-- ============================================================
-- Migration : robustesse backend pour la stabilisation mobile
-- (anti double-réservation, anti double-paiement, perf lecture mobile).
-- Pas d'architecture offline (pas de Dexie) — uniquement des garanties
-- côté base + edge functions.
-- ============================================================

-- ============================================================
-- 1. ANTI DOUBLE-RÉSERVATION
--
-- Audit de l'existant : `createReservation()` (src/services/reservations.js)
-- fait un SELECT de pré-vérification puis un INSERT séparé — classique
-- race condition (TOCTOU) sous requêtes concurrentes. Le commentaire du
-- code lui-même prétend que "la contrainte UNIQUE(terrain_id, date,
-- heure_debut) sur creneaux protège déjà contre le double-booking en
-- dernier recours" — FAUX : cette contrainte est sur la table `creneaux`
-- (empêche deux CRÉNEAUX identiques), pas sur `reservations`, et
-- `reservations.creneau_id` est NULLABLE (ON DELETE SET NULL) — aucune
-- garantie DB n'existe aujourd'hui empêchant deux lignes `reservations`
-- actives sur le même (terrain_id, date_slot, heure_slot).
-- ============================================================

-- Garantie atomique : au plus une réservation "vivante" (en_attente,
-- confirmee, terminee) par (terrain, date, heure) — indépendant de
-- creneau_id. Un index unique PARTIEL (pas une contrainte pleine table)
-- pour ne jamais bloquer l'historique des réservations annulées sur le
-- même créneau (ré-réservation légitime après annulation).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_no_double_booking
  ON public.reservations (terrain_id, date_slot, heure_slot)
  WHERE statut IN ('en_attente', 'confirmee', 'terminee');

-- create_reservation_safe : remplace le pattern SELECT-puis-INSERT racé
-- par un INSERT unique dans un bloc EXCEPTION — c'est la SEULE façon
-- fiable en Postgres de garantir un message propre y compris dans la
-- fenêtre de vraie concurrence (deux requêtes simultanées passeraient
-- toutes les deux un pré-check SELECT avant que l'une des deux n'ait
-- commité ; seul l'INSERT lui-même, protégé par l'index unique
-- ci-dessus, peut arbitrer correctement qui gagne).
--
-- SECURITY INVOKER (pas DEFINER) : s'exécute avec les droits de
-- l'appelant, donc soumis normalement à la policy RLS existante
-- "reservations_insert_joueur" (auth.uid() IS NOT NULL AND joueur_id =
-- auth.uid()) — aucune duplication de cette règle ici, la RLS reste la
-- seule source de vérité pour "qui peut réserver au nom de qui".
DROP FUNCTION IF EXISTS public.create_reservation_safe(UUID, UUID, UUID, TEXT, TEXT, DATE, TIME, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.create_reservation_safe(
  p_terrain_id UUID,
  p_joueur_id UUID,
  p_creneau_id UUID,
  p_terrain_nom TEXT,
  p_joueur_nom TEXT,
  p_date_slot DATE,
  p_heure_slot TIME,
  p_montant INTEGER,
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
-- 2. ANTI DOUBLE-PAIEMENT — idempotence handle_payment_webhook
--
-- Bug trouvé : la fonction appliquait UPDATE paiements/reservations SANS
-- vérifier l'état courant. Un webhook rejoué (retry provider, ou un
-- succès tardif reçu APRÈS qu'un remboursement/annulation manuel ait déjà
-- fait avancer le paiement) réécrivait 'valide'/'confirmee' sans garde-
-- fou — capable de RESSUSCITER une réservation déjà annulée/remboursée.
-- Corrigé en ne transitionnant JAMAIS depuis un statut de paiement autre
-- que 'en_attente' (même pattern que activate_subscription/activate_boost,
-- qui filtrent déjà correctement sur `WHERE status = 'pending'`).
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
  -- 1. Enregistrement du log brut (toujours, y compris les rejeux — utile
  -- pour l'audit, sans effet sur l'idempotence métier ci-dessous).
  INSERT INTO public.webhook_logs (provider, payload)
  VALUES (p_provider, p_payload);

  -- 2. Recherche du paiement via la référence externe
  SELECT id, reservation_id, statut INTO v_paiement_id, v_reservation_id, v_current_statut
  FROM public.paiements
  WHERE ref_externe = p_reference;

  IF v_paiement_id IS NULL THEN
    RAISE EXCEPTION 'Paiement introuvable pour la référence externe %', p_reference;
  END IF;

  -- 3. Idempotence : uniquement si le paiement est encore 'en_attente'.
  -- Un rejeu (même statut déjà appliqué) ou un succès tardif après un état
  -- terminal différent (rembourse/echoue) est un no-op silencieux, jamais
  -- une double confirmation.
  IF v_current_statut <> 'en_attente' THEN
    RAISE NOTICE 'handle_payment_webhook: paiement % déjà au statut % — rejeu ignoré (idempotence)', v_paiement_id, v_current_statut;
    RETURN;
  END IF;

  IF p_status IN ('success', 'approved', 'completed', 'paid') THEN
    UPDATE public.paiements
    SET statut = 'valide', updated_at = NOW()
    WHERE id = v_paiement_id AND statut = 'en_attente';
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Ne confirme la réservation QUE si cette requête a réellement gagné
    -- la transition (protège aussi contre une course entre deux appels
    -- concurrents du webhook pour la même référence).
    IF v_rows_updated > 0 THEN
      UPDATE public.reservations
      SET statut = 'confirmee', updated_at = NOW()
      WHERE id = v_reservation_id;
    END IF;
  ELSIF p_status IN ('failed', 'declined', 'cancelled') THEN
    UPDATE public.paiements
    SET statut = 'echoue', updated_at = NOW()
    WHERE id = v_paiement_id AND statut = 'en_attente';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. PERFORMANCE — lectures mobiles fréquentes (carte, disponibilités)
-- ============================================================

-- 3a. Carte / liste terrains publique : fetchTerrains() et
-- fetchTopTerrains() (src/services/terrains.js) filtrent .eq('statut',
-- 'actif') puis .order('rating', desc) — sans index dédié, Postgres fait
-- un scan complet + tri à chaque appel. Index partiel + pré-trié : sert
-- exactement ce pattern d'accès (et accessoirement rend la policy RLS
-- "terrains_select_all" — déjà correctement écrite pour court-circuiter
-- sur cette même condition avant d'évaluer get_my_role(), donc déjà peu
-- coûteuse — plus rapide encore, l'index couvrant directement son
-- premier terme).
CREATE INDEX IF NOT EXISTS idx_terrains_actifs_par_note
  ON public.terrains (rating DESC)
  WHERE statut = 'actif';

-- Recherche géographique (carte) : déjà couverte par l'index GIST sur
-- `terrains.geog` (migration 20260725150000) — rien à ajouter ici.

-- 3b. Disponibilités : fetchCreneauxDisponibles(terrainId, date)
-- (src/services/stats.js) filtre .eq('terrain_id',...).eq('date',...)
-- .eq('statut','disponible') — l'index existant idx_creneaux_terrain_date
-- (terrain_id, date) couvre déjà les deux premiers filtres ; ce nouvel
-- index partiel réduit encore la taille de l'index à parcourir en
-- excluant d'emblée les créneaux déjà réservés/bloqués, qui s'accumulent
-- dans le temps et ne sont JAMAIS ce que cette requête (hot path joueur)
-- cherche.
CREATE INDEX IF NOT EXISTS idx_creneaux_terrain_date_disponible
  ON public.creneaux (terrain_id, date)
  WHERE statut = 'disponible';

-- ============================================================
-- 4. RLS — audit des lectures publiques fréquentes (carte, disponibilités)
--
-- Aucun changement de policy nécessaire, audit fait explicitement :
--
-- - "creneaux_select_public" (schema.sql) : USING (true) — déjà la policy
--   la moins coûteuse possible (aucune sous-requête, aucun appel de
--   fonction). Rien à optimiser.
--
-- - "terrains_select_all" (migration 20260723120000) :
--   (statut='actif' AND status='approved') OR get_my_role()='admin' OR
--   (get_my_role()='gerant' AND gerant_id=auth.uid())
--   Pour un joueur/anonyme consultant la carte ou la liste publique, la
--   PREMIÈRE branche (statut+status, comparaison directe sur colonnes,
--   maintenant indexée par idx_terrains_actifs_par_note ci-dessus) est
--   évaluée et suffit à valider la ligne — get_my_role() (SELECT sur
--   profiles) n'est jamais atteint pour ces lectures. Déjà optimal, pas
--   de changement de policy nécessaire.
-- ============================================================

-- ============================================================
-- Vérification post-migration :
--
-- -- Double-booking (à exécuter deux fois avec les MÊMES terrain/date/heure) :
-- SELECT public.create_reservation_safe(
--   '<terrain_id>', auth.uid(), NULL, 'Test', 'Test',
--   CURRENT_DATE + 1, '18:00', 15000, 1
-- );
-- -- 2e appel identique -> ERROR: Ce créneau vient d'être réservé
--
-- -- Idempotence webhook (à exécuter deux fois de suite avec la même référence) :
-- SELECT public.handle_payment_webhook('pay_unitech', '{}'::jsonb, '<ref_existante>', 'success');
-- -- 2e appel -> RETURN silencieux (RAISE NOTICE visible dans les logs),
-- --             aucune 2e UPDATE sur reservations.
--
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('reservations','terrains','creneaux')
--   AND indexname IN ('idx_reservations_no_double_booking','idx_terrains_actifs_par_note','idx_creneaux_terrain_date_disponible');
-- -- -> 3 lignes
-- ============================================================
