import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabaseUrl = urlMatch ? urlMatch[1].trim() : '';
const supabaseAnonKey = keyMatch ? keyMatch[1].trim() : '';

console.log('Testing Supabase Connection...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  try {
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    if (error) {
      console.error('Error fetching profiles:', error);
    } else {
      console.log('Success! Profiles fetched:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

test();
