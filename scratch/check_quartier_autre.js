import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: profs, error: e1 } = await supabase
    .from('profiles')
    .select('id, nom, email, role, quartier, created_at')
    .eq('quartier', 'Autre');
  console.log('--- profiles.quartier = Autre ---');
  if (e1) console.error(e1); else console.log(JSON.stringify(profs, null, 2));

  const { data: terrs, error: e2 } = await supabase
    .from('terrains')
    .select('id, nom, quartier, gerant_id, created_at')
    .eq('quartier', 'Autre');
  console.log('--- terrains.quartier = Autre ---');
  if (e2) console.error(e2); else console.log(JSON.stringify(terrs, null, 2));

  // Distinct quartier values distribution for context
  const { data: allQ } = await supabase.from('profiles').select('quartier').eq('role', 'joueur');
  const counts = {};
  (allQ||[]).forEach(r => { const k = r.quartier || '(null)'; counts[k] = (counts[k]||0)+1; });
  console.log('--- distribution profiles.quartier (role=joueur) ---');
  console.log(JSON.stringify(counts, null, 2));
}
run();
