import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('Attempting to sign in with password...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'cedricbenoitdieme@gmail.com',
      password: 'Liberte_75'
    });

    if (authError) {
      console.error('Auth error:', authError);
      return;
    }

    console.log('Auth success. User ID:', authData.user.id);
    
    // Query the profiles table using this authenticated client
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Profile query error:', profileError);
    } else {
      console.log('Profile retrieved successfully:', profile);
    }
  } catch (e) {
    console.error('Unexpected error:', e);
  }
}

run();
