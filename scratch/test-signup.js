import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const email = `test.signup.${Date.now()}@gmail.com`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: 'TestPassword123!',
      options: {
        data: {
          nom: 'Test Signup User',
          role: 'joueur'
        }
      }
    });

    if (error) {
      console.error('Signup error:', error);
    } else {
      console.log('Signup success:', data);
    }
  } catch (e) {
    console.error(e);
  }
}

run();
