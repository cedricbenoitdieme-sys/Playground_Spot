import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nom, email, avatar, quartier, tel, role, created_at')
    .or('nom.ilike.%elhadi%,nom.ilike.%khadijah%,avatar.ilike.%googleusercontent%');
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data, null, 2));

  // Also check raw_user_meta_data via auth admin API for these users
  for (const p of data || []) {
    const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(p.id);
    if (uErr) { console.error('auth admin error for', p.id, uErr.message); continue; }
    console.log(`\n--- raw_user_meta_data for ${p.nom} (${p.id}) ---`);
    console.log(JSON.stringify(userData.user.user_metadata, null, 2));
  }
}
run();
