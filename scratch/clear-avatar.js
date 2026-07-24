import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    for (const user of users) {
      console.log(`Checking user: ${user.email} (ID: ${user.id})`);
      const metadata = user.user_metadata || {};
      
      let needsUpdate = false;
      const newMetadata = { ...metadata };

      if (metadata.avatar_url && (metadata.avatar_url.startsWith('data:image') || metadata.avatar_url.length > 1000)) {
        console.log(`-> User ${user.email} has large avatar_url of length ${metadata.avatar_url.length}. Overwriting with null...`);
        newMetadata.avatar_url = null; // Set to null instead of deleting
        needsUpdate = true;
      }

      if (needsUpdate) {
        const { data, error: updateError } = await supabase.auth.admin.updateUserById(
          user.id,
          { user_metadata: newMetadata }
        );
        if (updateError) {
          console.error(`Error updating ${user.email}:`, updateError);
        } else {
          console.log(`Successfully updated ${user.email}.`);
        }
      } else {
        console.log(`-> No update needed for ${user.email}`);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

run();
