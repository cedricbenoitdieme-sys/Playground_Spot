import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    console.log('--- Database Diagnostics ---');
    
    // 1. Get all profiles
    const { data: profiles, error: err1 } = await supabase
      .from('profiles')
      .select('id, nom, email, role, statut');
      
    if (err1) {
      console.error('Error fetching profiles:', err1);
    } else {
      console.log('\nProfiles in DB:');
      console.table(profiles);
    }

    // 2. Check auth users
    const { data: { users }, error: err2 } = await supabase.auth.admin.listUsers();
    if (err2) {
      console.error('Error listing auth users:', err2);
    } else {
      console.log('\nAuth Users in DB:');
      console.table(users.map(u => ({ id: u.id, email: u.email, role: u.user_metadata?.role })));
    }

  } catch (e) {
    console.error('Error:', e);
  }
}

run();
