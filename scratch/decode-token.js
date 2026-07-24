import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'cedricbenoitdieme@gmail.com',
      password: 'Liberte_75'
    });

    if (authError) {
      console.error(authError);
      return;
    }

    const token = authData.session.access_token;
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    console.log('Payload keys:', Object.keys(payload));
    console.log('User metadata keys:', Object.keys(payload.user_metadata || {}));
    
    // Check sizes of fields in user_metadata
    for (const key of Object.keys(payload.user_metadata || {})) {
      const val = payload.user_metadata[key];
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
      console.log(`Metadata field "${key}" size: ${strVal.length} characters`);
      if (strVal.length > 500) {
        console.log(`Preview of "${key}":`, strVal.slice(0, 200) + '...');
      }
    }
  } catch (e) {
    console.error(e);
  }
}

run();
