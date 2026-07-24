import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'cedricbenoitdieme@gmail.com',
      password: 'Liberte_75'
    });

    if (authError) {
      console.error('Sign in error:', authError);
      return;
    }

    console.log('Logged in user ID:', authData.user.id);

    // Fetch the user's profile to make sure it exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    } else {
      console.log('Profile:', profile);
    }

    // Try to get a terrain ID to use
    const { data: terrains, error: terrainsError } = await supabase
      .from('terrains')
      .select('id, nom')
      .limit(1);

    if (terrainsError) {
      console.error('Terrains fetch error:', terrainsError);
      return;
    }

    if (!terrains || terrains.length === 0) {
      console.error('No terrains found in DB!');
      return;
    }

    const terrain = terrains[0];
    console.log('Using terrain:', terrain);

    // Try to insert a reservation
    console.log('Attempting to insert reservation...');
    const reservationData = {
      terrain_id: terrain.id,
      joueur_id: authData.user.id,
      terrain_nom: terrain.nom,
      joueur_nom: profile?.nom || 'Test User',
      date_slot: new Date().toISOString().split('T')[0],
      heure_slot: '18:00:00',
      montant: 15000,
      duree_heures: 1,
      statut: 'en_attente',
      qr_token: `PS-TEST-${Date.now().toString(36).toUpperCase()}`
    };

    const { data: res, error: resError } = await supabase
      .from('reservations')
      .insert(reservationData)
      .select()
      .single();

    if (resError) {
      console.error('❌ Reservation Insert Error:', resError);
    } else {
      console.log('✅ Reservation Insert Success:', res);
    }

  } catch (err) {
    console.error('System error:', err);
  }
}

run();
