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

    console.log('Logged in successfully.');
    const session = authData.session;

    const uniqueEmail = `test.gerant.${Date.now()}@gmail.com`;
    const response = await fetch('http://localhost:3000/api/create-gerant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        nom: 'Test Gerant Correct',
        email: uniqueEmail,
        tel: '771234567',
        quartier: 'Ouakam'
      })
    });

    const text = await response.text();
    console.log('API Response Status:', response.status);
    console.log('API Response Body:', text);
  } catch (err) {
    console.error('System error:', err);
  }
}

run();
