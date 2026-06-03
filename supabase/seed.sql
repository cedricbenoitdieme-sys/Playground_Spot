-- ============================================================
-- PlaygroundSpot — Script de Seed Complet
-- Génère d'abord les utilisateurs dans auth.users, puis les profils
-- ============================================================

BEGIN;

-- ── 1. INSERTION DANS auth.users (nécessaire pour la FK) ──────────────────────
-- On insère des utilisateurs fictifs directement dans auth.users
-- Ceci est possible depuis le SQL Editor Supabase (mode postgres superuser)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, role
)
VALUES
  -- Admin
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'admin@playgroundspot.com',
   '$2a$10$placeholder_hash_admin', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Admin Dakar","role":"admin"}',
   FALSE, 'authenticated'),
  -- Gérants
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'ibrahima@playgroundspot.sn',
   '$2a$10$placeholder_hash_ib', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Ibrahima Diallo","role":"gerant"}',
   FALSE, 'authenticated'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'fatou.ndiaye@gmail.com',
   '$2a$10$placeholder_hash_fn', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Fatou Ndiaye","role":"gerant"}',
   FALSE, 'authenticated'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'moustapha.sarr@gmail.com',
   '$2a$10$placeholder_hash_ms', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Moustapha Sarr","role":"gerant"}',
   FALSE, 'authenticated'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'aissatou.ba@playgroundspot.sn',
   '$2a$10$placeholder_hash_ab', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Aissatou Ba","role":"gerant"}',
   FALSE, 'authenticated'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'cheikh.fall@gmail.com',
   '$2a$10$placeholder_hash_cf', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Cheikh Tidiane Fall","role":"gerant"}',
   FALSE, 'authenticated'),
  -- Joueurs
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77', 'moussa.diop@gmail.com',
   '$2a$10$placeholder_hash_md', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Moussa Diop","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', 'fatou.sow@gmail.com',
   '$2a$10$placeholder_hash_fs', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Fatou Sow","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', 'omar.sy@gmail.com',
   '$2a$10$placeholder_hash_os', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Omar Sy","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'awa.fall@gmail.com',
   '$2a$10$placeholder_hash_af', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Awa Fall","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', 'ibrahim.ndiaye@gmail.com',
   '$2a$10$placeholder_hash_in', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Ibrahim Ndiaye","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', 'mariam.kane@gmail.com',
   '$2a$10$placeholder_hash_mk', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Mariam Kane","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b44', 'babacar.ba@gmail.com',
   '$2a$10$placeholder_hash_bb', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Babacar Ba","role":"joueur"}',
   FALSE, 'authenticated'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b55', 'samba.diallo@gmail.com',
   '$2a$10$placeholder_hash_sd', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}',
   '{"nom":"Samba Diallo","role":"joueur"}',
   FALSE, 'authenticated')
ON CONFLICT (id) DO NOTHING;


-- ── 2. PROFILS ────────────────────────────────────────────────────────────────

INSERT INTO public.profiles (id, nom, email, tel, role, quartier, statut, avatar) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Admin Dakar', 'admin@playgroundspot.com', '+221 77 000 00 00', 'admin', 'Plateau', 'actif', 'AD'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Ibrahima Diallo', 'ibrahima@playgroundspot.sn', '+221 77 123 45 67', 'gerant', 'Almadies', 'actif', 'ID'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Fatou Ndiaye', 'fatou.ndiaye@gmail.com', '+221 76 234 56 78', 'gerant', 'Plateau', 'actif', 'FN'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Moustapha Sarr', 'moustapha.sarr@gmail.com', '+221 70 345 67 89', 'gerant', 'Parcelles Assainies', 'suspendu', 'MS'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'Aissatou Ba', 'aissatou.ba@playgroundspot.sn', '+221 77 456 78 90', 'gerant', 'Ouakam', 'actif', 'AB'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'Cheikh Tidiane Fall', 'cheikh.fall@gmail.com', '+221 78 567 89 01', 'gerant', 'Yoff', 'en_attente', 'CF'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77', 'Moussa Diop', 'moussa.diop@gmail.com', '+221 77 111 22 33', 'joueur', 'Almadies', 'actif', 'MD'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', 'Fatou Sow', 'fatou.sow@gmail.com', '+221 76 222 33 44', 'joueur', 'Plateau', 'actif', 'FS'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', 'Omar Sy', 'omar.sy@gmail.com', '+221 70 333 44 55', 'joueur', 'Médina', 'actif', 'OS'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'Awa Fall', 'awa.fall@gmail.com', '+221 77 444 55 66', 'joueur', 'Parcelles Assainies', 'suspendu', 'AF'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', 'Ibrahim Ndiaye', 'ibrahim.ndiaye@gmail.com', '+221 78 555 66 77', 'joueur', 'Ouakam', 'actif', 'IN'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', 'Mariam Kane', 'mariam.kane@gmail.com', '+221 77 666 77 88', 'joueur', 'Yoff', 'actif', 'MK'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b44', 'Babacar Ba', 'babacar.ba@gmail.com', '+221 76 777 88 99', 'joueur', 'Mermoz', 'inactif', 'BB'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b55', 'Samba Diallo', 'samba.diallo@gmail.com', '+221 70 888 99 00', 'joueur', 'Guédiawaye', 'actif', 'SD')
ON CONFLICT (id) DO UPDATE SET
  nom = EXCLUDED.nom,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  statut = EXCLUDED.statut;


-- ── 3. TERRAINS ───────────────────────────────────────────────────────────────

INSERT INTO public.terrains (id, nom, quartier, price, rating, reviews_count, surface, size, image_url, lat, lng, gerant_id, statut) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Five Dakar Almadies', 'Almadies', 15000, 4.8, 124, 'Synthétique', '5v5', 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800', 14.7483, -17.5147, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'City Sport Plateau', 'Plateau', 12500, 4.5, 89, 'Béton', '5v5', 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=800', 14.6677, -17.4331, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'Parcelles Arena', 'Parcelles Assainies', 10000, 4.2, 156, 'Synthétique', '7v7', 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=800', 14.7558, -17.4419, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'Ouakam Soccer Center', 'Ouakam', 18000, 4.9, 45, 'Synthétique', '5v5', 'https://images.unsplash.com/photo-1459196333979-1eb43a0d2030?auto=format&fit=crop&q=80&w=800', 14.7194, -17.4883, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55', 'Yoff Beach Foot', 'Yoff', 8000, 4.0, 67, 'Sable', '5v5', 'https://images.unsplash.com/photo-1562552052-c72ceddf93dc?auto=format&fit=crop&q=80&w=800', 14.7614, -17.4658, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66', 'Mermoz Soccer 5', 'Mermoz', 15000, 4.6, 78, 'Synthétique', '5v5', 'https://images.unsplash.com/photo-1510566337590-2fc1f21d0faa?auto=format&fit=crop&q=80&w=800', 14.7042, -17.4764, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'actif')
ON CONFLICT (id) DO UPDATE SET
  nom = EXCLUDED.nom,
  price = EXCLUDED.price,
  rating = EXCLUDED.rating,
  statut = EXCLUDED.statut;


-- ── 4. ÉQUIPEMENTS ────────────────────────────────────────────────────────────

INSERT INTO public.terrain_amenities (terrain_id, label, icone)
SELECT v.terrain_id, v.label, v.icone FROM (VALUES
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11'::uuid, 'Vestiaires', 'shirt'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11'::uuid, 'Éclairage', 'bulb'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11'::uuid, 'Parking', 'parking'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22'::uuid, 'Éclairage', 'bulb'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33'::uuid, 'Parking', 'parking'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33'::uuid, 'Tribune', 'pennant'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44'::uuid, 'Vestiaires', 'shirt'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44'::uuid, 'Éclairage', 'bulb'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44'::uuid, 'Garde', 'shield'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55'::uuid, 'Douches', 'bath'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66'::uuid, 'Vestiaires', 'shirt'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66'::uuid, 'Parking', 'parking')
) AS v(terrain_id, label, icone)
WHERE NOT EXISTS (
  SELECT 1 FROM public.terrain_amenities a
  WHERE a.terrain_id = v.terrain_id AND a.label = v.label
);


-- ── 5. ASSOCIATION GÉRANT-TERRAIN ─────────────────────────────────────────────

INSERT INTO public.gerant_terrains (gerant_id, terrain_id) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55')
ON CONFLICT (gerant_id, terrain_id) DO NOTHING;


-- ── 6. CRÉNEAUX ───────────────────────────────────────────────────────────────

INSERT INTO public.creneaux (id, terrain_id, date, heure_debut, heure_fin, statut) VALUES
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', CURRENT_DATE, '08:00:00', '09:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d12', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', CURRENT_DATE, '10:00:00', '11:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d13', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', CURRENT_DATE, '18:00:00', '19:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d14', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', CURRENT_DATE, '20:00:00', '21:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d21', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', CURRENT_DATE, '18:00:00', '19:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', CURRENT_DATE, '19:00:00', '20:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d31', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', CURRENT_DATE, '16:00:00', '17:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d32', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', CURRENT_DATE, '20:00:00', '21:00:00', 'disponible')
ON CONFLICT (terrain_id, date, heure_debut) DO NOTHING;


-- ── 7. RÉSERVATIONS ───────────────────────────────────────────────────────────

INSERT INTO public.reservations (id, terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom, date_slot, heure_slot, montant, statut) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d13', 'Five Dakar Almadies', 'Moussa Diop', CURRENT_DATE - 16, '18:00:00', 15000, 'confirmee'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d21', 'City Sport Plateau', 'Fatou Sow', CURRENT_DATE - 16, '19:00:00', 12500, 'en_attente'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d31', 'Parcelles Arena', 'Omar Sy', CURRENT_DATE - 16, '16:00:00', 10000, 'terminee'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e44', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', NULL, 'Ouakam Soccer Center', 'Ibrahim Ndiaye', CURRENT_DATE - 15, '08:00:00', 18000, 'terminee'),
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', NULL, 'Ouakam Soccer Center', 'Awa Fall', CURRENT_DATE - 15, '10:00:00', 18000, 'annulee')
ON CONFLICT (id) DO NOTHING;


-- ── 8. PAIEMENTS ──────────────────────────────────────────────────────────────

INSERT INTO public.paiements (reservation_id, montant, mode, statut, ref_externe)
SELECT v.reservation_id, v.montant, v.mode, v.statut, v.ref FROM (VALUES
  ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11'::uuid, 15000, 'wave'::mode_paiement, 'valide'::statut_paiement, 'TX-WAVE-111222333'),
  ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33'::uuid, 10000, 'sur_place'::mode_paiement, 'valide'::statut_paiement, NULL),
  ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e44'::uuid, 18000, 'orange_money'::mode_paiement, 'valide'::statut_paiement, 'TX-OM-444555666')
) AS v(reservation_id, montant, mode, statut, ref)
WHERE NOT EXISTS (
  SELECT 1 FROM public.paiements p WHERE p.reservation_id = v.reservation_id
);


-- ── 9. AVIS ───────────────────────────────────────────────────────────────────

INSERT INTO public.avis (reservation_id, joueur_id, terrain_id, note, commentaire)
VALUES (
  'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
  4,
  'Bon terrain synthétique, excellent match avec les amis.'
)
ON CONFLICT (reservation_id) DO NOTHING;

COMMIT;
