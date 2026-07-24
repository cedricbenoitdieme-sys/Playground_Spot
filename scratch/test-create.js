import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const email = `test.gerant.admin.${Date.now()}@gmail.com`;
    console.log('Using URL:', supabaseUrl);
    console.log('Using Key suffix:', supabaseKey?.slice(-10));
    
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: 'TemporaryPassword123!',
      email_confirm: true,
      user_metadata: {
        nom: 'Test Gerant Admin',
        role: 'gerant'
      }
    });

    if (error) {
      console.error('Create user error:', error);
    } else {
      console.log('Success created auth user:', data);
    }
  } catch (e) {
    console.error(e);
  }
}

run();
