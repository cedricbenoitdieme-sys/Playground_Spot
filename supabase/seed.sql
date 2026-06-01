-- ============================================================
-- PlaygroundSpot — Script de Seed (Données Mock Consolidées)
-- Généré par Antigravity — Dakar, Sénégal
-- ============================================================

-- Note : Ce script insère des données dans le schéma public.
-- Pour les liaisons réelles auth.users, dans un environnement de test local Supabase,
-- vous devriez utiliser les UUIDs générés par l'authentification Supabase.
-- Ici, nous utilisons des UUIDs fixes prédéfinis pour nos profils mockés.

BEGIN;

-- Désactiver temporairement les triggers pour éviter les effets de cascade lors de l'insertion de masse si nécessaire
-- ALTER TABLE public.profiles DISABLE TRIGGER ALL;

-- ── 1. INSERTION DES PROFILS UTILISATEURS (MOCK) ────────────────
-- UUIDs prédéterminés pour les rôles (Admin, Gérants, Joueurs)
-- Admin
INSERT INTO public.profiles (id, nom, email, tel, role, quartier, statut, avatar) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Admin Dakar', 'admin@playgroundspot.com', '+221 77 000 00 00', 'admin', 'Plateau', 'actif', 'AD')
ON CONFLICT (id) DO NOTHING;

-- Gérants
INSERT INTO public.profiles (id, nom, email, tel, role, quartier, statut, avatar, date_inscription) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Ibrahima Diallo', 'ibrahima@playgroundspot.sn', '+221 77 123 45 67', 'gerant', 'Almadies', 'actif', 'ID'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Fatou Ndiaye', 'fatou.ndiaye@gmail.com', '+221 76 234 56 78', 'gerant', 'Plateau', 'actif', 'FN'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Moustapha Sarr', 'moustapha.sarr@gmail.com', '+221 70 345 67 89', 'gerant', 'Parcelles Assainies', 'suspendu', 'MS'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'Aissatou Ba', 'aissatou.ba@playgroundspot.sn', '+221 77 456 78 90', 'gerant', 'Ouakam', 'actif', 'AB'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'Cheikh Tidiane Fall', 'cheikh.fall@gmail.com', '+221 78 567 89 01', 'gerant', 'Yoff', 'en_attente', 'CF')
ON CONFLICT (id) DO NOTHING;

-- Joueurs
INSERT INTO public.profiles (id, nom, email, tel, role, quartier, statut, avatar) VALUES
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77', 'Moussa Diop', 'moussa.diop@gmail.com', '+221 77 111 22 33', 'joueur', 'Almadies', 'actif', 'MD'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', 'Fatou Sow', 'fatou.sow@gmail.com', '+221 76 222 33 44', 'joueur', 'Plateau', 'actif', 'FS'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', 'Omar Sy', 'omar.sy@gmail.com', '+221 70 333 44 55', 'joueur', 'Médina', 'actif', 'OS'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'Awa Fall', 'awa.fall@gmail.com', '+221 77 444 55 66', 'joueur', 'Parcelles Assainies', 'suspendu', 'AF'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', 'Ibrahim Ndiaye', 'ibrahim.ndiaye@gmail.com', '+221 78 555 66 77', 'joueur', 'Ouakam', 'actif', 'IN'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', 'Mariam Kane', 'mariam.kane@gmail.com', '+221 77 666 77 88', 'joueur', 'Yoff', 'actif', 'MK'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b44', 'Babacar Ba', 'babacar.ba@gmail.com', '+221 76 777 88 99', 'joueur', 'Mermoz', 'inactif', 'BB'),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b55', 'Samba Diallo', 'samba.diallo@gmail.com', '+221 70 888 99 00', 'joueur', 'Guédiawaye', 'actif', 'SD')
ON CONFLICT (id) DO NOTHING;


-- ── 2. INSERTION DES TERRAINS ───────────────────────────────
-- UUIDs prédéterminés pour les terrains
INSERT INTO public.terrains (id, nom, quartier, price, rating, reviews_count, surface, size, image_url, lat, lng, gerant_id, statut) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Five Dakar Almadies', 'Almadies', 15000, 4.8, 124, 'Synthétique', '5v5', 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800', 14.7483, -17.5147, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'City Sport Plateau', 'Plateau', 12500, 4.5, 89, 'Béton', '5v5', 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=800', 14.6677, -17.4331, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'Parcelles Arena', 'Parcelles Assainies', 10000, 4.2, 156, 'Synthétique', '7v7', 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=800', 14.7558, -17.4419, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'Ouakam Soccer Center', 'Ouakam', 18000, 4.9, 45, 'Synthétique', '5v5', 'https://images.unsplash.com/photo-1459196333979-1eb43a0d2030?auto=format&fit=crop&q=80&w=800', 14.7194, -17.4883, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55', 'Yoff Beach Foot', 'Yoff', 8000, 4.0, 67, 'Sable', '5v5', 'https://images.unsplash.com/photo-1562552052-c72ceddf93dc?auto=format&fit=crop&q=80&w=800', 14.7614, -17.4658, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'actif'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66', 'Mermoz Soccer 5', 'Mermoz', 15000, 4.6, 78, 'Synthétique', '5v5', 'https://images.unsplash.com/photo-1510566337590-2fc1f21d0faa?auto=format&fit=crop&q=80&w=800', 14.7042, -17.4764, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'actif')
ON CONFLICT (id) DO NOTHING;


-- ── 3. INSERTION DES ÉQUIPEMENTS (AMENITIES) ──────────────────
INSERT INTO public.terrain_amenities (terrain_id, label, icone) VALUES
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Vestiaires', 'shirt'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Éclairage', 'bulb'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'Parking', 'parking'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'Éclairage', 'bulb'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'Parking', 'parking'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'Tribune', 'pennant'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'Vestiaires', 'shirt'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'Éclairage', 'bulb'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'Garde', 'shield'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55', 'Douches', 'bath'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66', 'Vestiaires', 'shirt'),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66', 'Parking', 'parking');


-- ── 4. ASSOCIATION GÉRANT TERRAINS ───────────────────────────
INSERT INTO public.gerant_terrains (gerant_id, terrain_id) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55')
ON CONFLICT (gerant_id, terrain_id) DO NOTHING;


-- ── 5. PLANIFICATION DES CRÉNEAUX DE TEST ─────────────────────
-- Insérer des créneaux horaires types pour aujourd'hui et les prochains jours
-- Pour simplifier, nous planifions quelques créneaux fixes pour les terrains 1, 2 et 3
INSERT INTO public.creneaux (id, terrain_id, date, heure_debut, heure_fin, statut) VALUES
-- Five Almadies (Terrain 1)
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', '2026-06-01', '08:00:00', '09:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d12', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', '2026-06-01', '10:00:00', '11:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d13', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', '2026-06-01', '18:00:00', '19:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d14', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', '2026-06-01', '20:00:00', '21:00:00', 'disponible'),
-- City Sport Plateau (Terrain 2)
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d21', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', '2026-06-01', '18:00:00', '19:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', '2026-06-01', '19:00:00', '20:00:00', 'disponible'),
-- Parcelles Arena (Terrain 3)
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d31', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', '2026-06-01', '16:00:00', '17:00:00', 'disponible'),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d32', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', '2026-06-01', '20:00:00', '21:00:00', 'disponible')
ON CONFLICT DO NOTHING;


-- ── 6. HISTORIQUE DE RÉSERVATIONS ET TICKET MATCH ──────────────
-- Réservation 1
INSERT INTO public.reservations (id, terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom, date_slot, heure_slot, montant, statut) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c77', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d13', 'Five Dakar Almadies', 'Moussa Diop', '2026-05-15', '18:00:00', 15000, 'confirmee')
ON CONFLICT DO NOTHING;

INSERT INTO public.paiements (reservation_id, montant, mode, statut, ref_externe) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 15000, 'wave', 'valide', 'TX-WAVE-111222333')
ON CONFLICT DO NOTHING;

-- Réservation 2
INSERT INTO public.reservations (id, terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom, date_slot, heure_slot, montant, statut) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e22', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c88', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d21', 'City Sport Plateau', 'Fatou Sow', '2026-05-15', '19:00:00', 12500, 'en_attente')
ON CONFLICT DO NOTHING;

-- Réservation 3
INSERT INTO public.reservations (id, terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom, date_slot, heure_slot, montant, statut) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c99', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380d31', 'Parcelles Arena', 'Omar Sy', '2026-05-15', '20:00:00', 10000, 'terminee')
ON CONFLICT DO NOTHING;

INSERT INTO public.paiements (reservation_id, montant, mode, statut, ref_externe) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33', 10000, 'sur_place', 'valide', NULL)
ON CONFLICT DO NOTHING;

-- Laisser un avis pour le match terminé
INSERT INTO public.avis (reservation_id, joueur_id, terrain_id, note, commentaire) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c99', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 4, 'Bon terrain synthétique, excellent match avec les amis.')
ON CONFLICT DO NOTHING;

-- Réservation 4
INSERT INTO public.reservations (id, terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom, date_slot, heure_slot, montant, statut) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e44', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', NULL, 'Ouakam Soccer Center', 'Ibrahim Ndiaye', '2026-05-16', '08:00:00', 18000, 'terminee')
ON CONFLICT DO NOTHING;

INSERT INTO public.paiements (reservation_id, montant, mode, statut, ref_externe) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e44', 18000, 'orange_money', 'valide', 'TX-OM-444555666')
ON CONFLICT DO NOTHING;

-- Réservation 5 (Annulée)
INSERT INTO public.reservations (id, terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom, date_slot, heure_slot, montant, statut, motif_annulation) VALUES
('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380e55', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', NULL, 'Ouakam Soccer Center', 'Awa Fall', '2026-05-16', '10:00:00', 18000, 'annulee', 'Indisponibilité des joueurs de l''équipe adverse.')
ON CONFLICT DO NOTHING;

-- ACTIVER à nouveau les triggers
-- ALTER TABLE public.profiles ENABLE TRIGGER ALL;

COMMIT;
