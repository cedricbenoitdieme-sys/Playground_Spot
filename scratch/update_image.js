import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const unsplashUrl = 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800';
  
  const { data, error } = await supabase
    .from('terrains')
    .update({ image_url: unsplashUrl })
    .eq('nom', 'Ouakam Soccer Center')
    .select();

  if (error) {
    console.error("Error updating image URL in DB:", error.message);
  } else {
    console.log("Success! Updated DB row:", data);
  }
}

run();
