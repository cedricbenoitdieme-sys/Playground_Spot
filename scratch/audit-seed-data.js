// Audit en LECTURE SEULE : identifie les données de seed/test dans la BDD live.
// N'effectue AUCUNE écriture ni suppression.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceKey);

// IDs exacts extraits de supabase/seed.sql (fixture, jamais générés par gen_random_uuid())
const SEED_PROFILE_IDS = [
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Admin Dakar
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', // Ibrahima Diallo
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', // Fatou Ndiaye
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', // Moustapha Sarr
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', // Aissatou Ba
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66', // Cheikh Tidiane Fall
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a77', // Moussa Diop
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a88', // Fatou Sow
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99', // Omar Sy
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', // Awa Fall
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', // Ibrahim Ndiaye
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', // Mariam Kane
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b44', // Babacar Ba
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380b55', // Samba Diallo
];
const SEED_TERRAIN_IDS = [
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11',
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22',
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c44',
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c55',
  'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380c66',
];

async function run() {
  console.log('=== PROFILES ===');
  const { data: allProfiles } = await supabase.from('profiles').select('id, nom, email, role, statut, created_at').order('created_at');
  console.log(`Total profiles: ${allProfiles.length}`);
  const seedProfiles = allProfiles.filter(p => SEED_PROFILE_IDS.includes(p.id));
  const testScriptProfiles = allProfiles.filter(p => /^test\.(signup|rpc\.guard)\./.test(p.email) || /^Test (Signup|RPC Guard)/.test(p.nom));
  const realProfiles = allProfiles.filter(p => !SEED_PROFILE_IDS.includes(p.id) && !testScriptProfiles.includes(p));
  console.log(`  Seed (supabase/seed.sql): ${seedProfiles.length}`);
  seedProfiles.forEach(p => console.log(`    - ${p.id}  ${p.email}  (${p.role}/${p.statut})`));
  console.log(`  Créés par nos scripts de test RPC (cette session): ${testScriptProfiles.length}`);
  testScriptProfiles.forEach(p => console.log(`    - ${p.id}  ${p.email}`));
  console.log(`  Réels (à conserver): ${realProfiles.length}`);
  realProfiles.forEach(p => console.log(`    - ${p.id}  ${p.email}  (${p.role}/${p.statut})`));

  console.log('\n=== TERRAINS ===');
  const { data: allTerrains } = await supabase.from('terrains').select('id, nom, gerant_id, statut, created_at').order('created_at');
  console.log(`Total terrains: ${allTerrains.length}`);
  const seedTerrains = allTerrains.filter(t => SEED_TERRAIN_IDS.includes(t.id));
  const realTerrains = allTerrains.filter(t => !SEED_TERRAIN_IDS.includes(t.id));
  console.log(`  Seed: ${seedTerrains.length}`);
  seedTerrains.forEach(t => console.log(`    - ${t.id}  ${t.nom}`));
  console.log(`  Réels (à conserver): ${realTerrains.length}`);
  realTerrains.forEach(t => console.log(`    - ${t.id}  ${t.nom}`));

  console.log('\n=== RÉSERVATIONS liées à un terrain ou joueur seed ===');
  const { data: allReservations } = await supabase.from('reservations').select('id, terrain_id, joueur_id, statut, created_at');
  const seedReservations = allReservations.filter(r => SEED_TERRAIN_IDS.includes(r.terrain_id) || SEED_PROFILE_IDS.includes(r.joueur_id));
  console.log(`Total réservations: ${allReservations.length} — dont liées au seed: ${seedReservations.length}`);
  seedReservations.forEach(r => console.log(`    - ${r.id}  terrain=${r.terrain_id}  joueur=${r.joueur_id}`));

  console.log('\n=== PAIEMENTS liés à une réservation seed ===');
  const seedReservationIds = seedReservations.map(r => r.id);
  const { data: allPaiements } = await supabase.from('paiements').select('id, reservation_id, montant, mode, statut');
  const seedPaiements = allPaiements.filter(p => seedReservationIds.includes(p.reservation_id));
  console.log(`Total paiements: ${allPaiements.length} — dont liés au seed: ${seedPaiements.length}`);

  console.log('\n=== AVIS liés au seed ===');
  const { data: allAvis } = await supabase.from('avis').select('id, reservation_id, joueur_id, terrain_id');
  const seedAvis = allAvis.filter(a => seedReservationIds.includes(a.reservation_id) || SEED_TERRAIN_IDS.includes(a.terrain_id) || SEED_PROFILE_IDS.includes(a.joueur_id));
  console.log(`Total avis: ${allAvis.length} — dont liés au seed: ${seedAvis.length}`);

  console.log('\n=== TERRAIN_AMENITIES / GERANT_TERRAINS liés au seed ===');
  const { data: allAmenities } = await supabase.from('terrain_amenities').select('id, terrain_id');
  const seedAmenities = allAmenities.filter(a => SEED_TERRAIN_IDS.includes(a.terrain_id));
  console.log(`terrain_amenities liés au seed: ${seedAmenities.length} / ${allAmenities.length}`);
  const { data: allGT } = await supabase.from('gerant_terrains').select('gerant_id, terrain_id');
  const seedGT = allGT.filter(g => SEED_TERRAIN_IDS.includes(g.terrain_id) || SEED_PROFILE_IDS.includes(g.gerant_id));
  console.log(`gerant_terrains liés au seed: ${seedGT.length} / ${allGT.length}`);

  console.log('\n=== CRENEAUX liés au seed ===');
  const { data: allCreneaux } = await supabase.from('creneaux').select('id, terrain_id');
  const seedCreneaux = allCreneaux.filter(c => SEED_TERRAIN_IDS.includes(c.terrain_id));
  console.log(`creneaux liés au seed: ${seedCreneaux.length} / ${allCreneaux.length}`);

  console.log('\n=== ABONNEMENTS liés à un gérant seed ===');
  const { data: allAbo } = await supabase.from('abonnements').select('id, gerant_id');
  const seedAbo = (allAbo || []).filter(a => SEED_PROFILE_IDS.includes(a.gerant_id));
  console.log(`abonnements liés au seed: ${seedAbo.length} / ${(allAbo || []).length}`);

  console.log('\n=== TICKETS liés à une réservation seed ===');
  const { data: allTickets } = await supabase.from('tickets').select('id, booking_id');
  const seedTickets = (allTickets || []).filter(t => seedReservationIds.includes(t.booking_id));
  console.log(`tickets liés au seed: ${seedTickets.length} / ${(allTickets || []).length}`);
}

run();
