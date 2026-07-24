import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    console.log('All auth users emails:', users.map(u => u.email));
  } catch (e) {
    console.error(e);
  }
}

run();
