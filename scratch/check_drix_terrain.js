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
  console.error('Missing credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: terrains, error: tErr } = await supabase
    .from('terrains')
    .select('id, nom, image_url, statut, status, gerant_id, created_at')
    .ilike('nom', '%drix%');

  if (tErr) { console.error('terrains query error:', tErr.message); return; }
  console.log('--- Terrains matching "drix" ---');
  console.log(JSON.stringify(terrains, null, 2));

  for (const t of terrains || []) {
    const { data: photos, error: pErr } = await supabase
      .from('terrain_photos')
      .select('id, storage_path, ordre, is_principale, created_at')
      .eq('terrain_id', t.id)
      .order('ordre', { ascending: true });

    console.log(`\n--- terrain_photos for ${t.nom} (${t.id}) ---`);
    if (pErr) console.error('photos query error:', pErr.message);
    console.log(JSON.stringify(photos, null, 2));

    if (photos && photos.length > 0) {
      const { data: listing, error: lErr } = await supabase
        .storage
        .from('terrain-photos')
        .list(t.id, { limit: 20 });
      console.log(`--- storage.objects listing for folder ${t.id} ---`);
      if (lErr) console.error('storage list error:', lErr.message);
      console.log(JSON.stringify(listing, null, 2));

      const { data: signed, error: sErr } = await supabase
        .storage
        .from('terrain-photos')
        .createSignedUrl(photos[0].storage_path, 60);
      console.log('--- signed URL test for first photo ---');
      if (sErr) console.error('createSignedUrl error:', sErr.message);
      else console.log(signed);
    }
  }
}

run();
