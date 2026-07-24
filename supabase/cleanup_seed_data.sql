-- ============================================================
-- Nettoyage des données de seed/test — PlaygroundSpot
--
-- Cible EXCLUSIVEMENT les lignes dont les UUID correspondent
-- littéralement à supabase/seed.sql (voir PROD_DATA_AUDIT.md pour
-- la méthode d'identification), + 2 lignes audit_logs générées par
-- des tests RPC manuels. Aucune autre donnée n'est touchée.
--
-- MODE D'EMPLOI :
--   1. Laisser v_dry_run = true et exécuter une première fois.
--      Le script n'effectue AUCUNE suppression, il liste seulement
--      (via RAISE NOTICE) le nombre de lignes concernées par table.
--   2. Relire attentivement la sortie.
--   3. Repasser v_dry_run = false et ré-exécuter pour supprimer.
--
-- Ordre de suppression respectant les contraintes FK (enfants
-- avant parents) : tickets, avis, paiements, reservations,
-- creneaux, terrain_amenities, gerant_terrains, terrains, profiles.
-- Les 13 profils seed sont supprimés en dernier ; ils n'ont déjà
-- plus de ligne correspondante dans auth.users (voir audit), donc
-- rien à faire côté auth.users.
-- ============================================================

DO $$
DECLARE
  v_dry_run BOOLEAN := false;  -- ⚠️ Passer à false pour exécuter réellement

  v_seed_profile_ids UUID[] := ARRAY[
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b44',
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b55'
  ]::UUID[];

  v_seed_terrain_ids UUID[] := ARRAY[
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11',
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22',
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44',
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55',
    'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66'
  ]::UUID[];

  -- Profils créés par nos scripts de test RPC (scratch/test-admin-rpcs.js),
  -- distincts du seed.sql mais référencés par des entrées audit_logs de bruit.
  v_test_script_resource_ids UUID[] := ARRAY[
    '3cc69482-7825-4197-a1a9-f95e129a875b',
    '10264bde-7e75-456a-98c7-75e9241016a0'
  ]::UUID[];

  v_count INT;
BEGIN
  -- ── tickets ──
  SELECT COUNT(*) INTO v_count FROM public.tickets
    WHERE booking_id IN (SELECT id FROM public.reservations WHERE terrain_id = ANY(v_seed_terrain_ids));
  RAISE NOTICE 'tickets seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.tickets
      WHERE booking_id IN (SELECT id FROM public.reservations WHERE terrain_id = ANY(v_seed_terrain_ids));
  END IF;

  -- ── avis ──
  SELECT COUNT(*) INTO v_count FROM public.avis WHERE terrain_id = ANY(v_seed_terrain_ids);
  RAISE NOTICE 'avis seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.avis WHERE terrain_id = ANY(v_seed_terrain_ids);
  END IF;

  -- ── paiements ──
  SELECT COUNT(*) INTO v_count FROM public.paiements
    WHERE reservation_id IN (SELECT id FROM public.reservations WHERE terrain_id = ANY(v_seed_terrain_ids));
  RAISE NOTICE 'paiements seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.paiements
      WHERE reservation_id IN (SELECT id FROM public.reservations WHERE terrain_id = ANY(v_seed_terrain_ids));
  END IF;

  -- ── reservations ──
  SELECT COUNT(*) INTO v_count FROM public.reservations WHERE terrain_id = ANY(v_seed_terrain_ids);
  RAISE NOTICE 'reservations seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.reservations WHERE terrain_id = ANY(v_seed_terrain_ids);
  END IF;

  -- ── creneaux ──
  SELECT COUNT(*) INTO v_count FROM public.creneaux WHERE terrain_id = ANY(v_seed_terrain_ids);
  RAISE NOTICE 'creneaux seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.creneaux WHERE terrain_id = ANY(v_seed_terrain_ids);
  END IF;

  -- ── terrain_amenities ──
  SELECT COUNT(*) INTO v_count FROM public.terrain_amenities WHERE terrain_id = ANY(v_seed_terrain_ids);
  RAISE NOTICE 'terrain_amenities seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.terrain_amenities WHERE terrain_id = ANY(v_seed_terrain_ids);
  END IF;

  -- ── gerant_terrains ──
  SELECT COUNT(*) INTO v_count FROM public.gerant_terrains WHERE terrain_id = ANY(v_seed_terrain_ids);
  RAISE NOTICE 'gerant_terrains seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.gerant_terrains WHERE terrain_id = ANY(v_seed_terrain_ids);
  END IF;

  -- ── abonnements (aucun aujourd'hui, gardé pour robustesse future) ──
  SELECT COUNT(*) INTO v_count FROM public.abonnements WHERE gerant_id = ANY(v_seed_profile_ids);
  RAISE NOTICE 'abonnements seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.abonnements WHERE gerant_id = ANY(v_seed_profile_ids);
  END IF;

  -- ── terrains ──
  SELECT COUNT(*) INTO v_count FROM public.terrains WHERE id = ANY(v_seed_terrain_ids);
  RAISE NOTICE 'terrains seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.terrains WHERE id = ANY(v_seed_terrain_ids);
  END IF;

  -- ── audit_logs de bruit (tests RPC manuels, hors seed.sql) ──
  SELECT COUNT(*) INTO v_count FROM public.audit_logs WHERE resource_id = ANY(v_test_script_resource_ids);
  RAISE NOTICE 'audit_logs de test (hors seed): %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.audit_logs WHERE resource_id = ANY(v_test_script_resource_ids);
  END IF;

  -- ── profiles (en dernier) ──
  SELECT COUNT(*) INTO v_count FROM public.profiles WHERE id = ANY(v_seed_profile_ids);
  RAISE NOTICE 'profiles seed: %', v_count;
  IF NOT v_dry_run THEN
    DELETE FROM public.profiles WHERE id = ANY(v_seed_profile_ids);
  END IF;

  IF v_dry_run THEN
    RAISE NOTICE '--- DRY RUN : aucune suppression effectuée. Repasser v_dry_run à false pour exécuter. ---';
  ELSE
    RAISE NOTICE '--- Nettoyage exécuté. ---';
  END IF;
END $$;
