import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('--- Storage Bucket Diagnostics & Setup ---');
    
    // 1. Check if the "avatars" bucket exists
    const { data: buckets, error: getBucketsError } = await supabase.storage.listBuckets();
    if (getBucketsError) {
      console.error('Error listing buckets:', getBucketsError);
      return;
    }
    
    const avatarBucket = buckets.find(b => b.id === 'avatars');
    
    if (avatarBucket) {
      console.log(`✅ Bucket "avatars" exists. Public: ${avatarBucket.public}`);
      if (!avatarBucket.public) {
        console.log('Updating "avatars" bucket to be public...');
        const { error: updateError } = await supabase.storage.updateBucket('avatars', { public: true });
        if (updateError) console.error('Error updating bucket:', updateError);
        else console.log('✅ Bucket "avatars" updated to be public.');
      }
    } else {
      console.log('Bucket "avatars" does not exist. Creating it...');
      const { data, error: createError } = await supabase.storage.createBucket('avatars', {
        public: true,
        fileSizeLimit: 1048576, // 1MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
      });
      if (createError) {
        console.error('Error creating bucket:', createError);
        return;
      }
      console.log('✅ Bucket "avatars" created successfully.');
    }
    
    // 2. Set/verify Storage Policies (RLS on storage.objects)
    console.log('Applying RLS policies to storage.objects for "avatars"...');
    
    // We can use RPC or raw SQL via client if enabled, but since client cannot run raw sql,
    // let\'s check we can write custom queries or do it via direct DB queries if needed.
    // However, since we are using service role key, we bypass RLS anyway. But we want to ensure
    // other users can read/write objects correctly.
    // Let\'s check policies in storage.objects for the bucket "avatars".
    // We can execute SQL via RPC if we have an RPC function, or we can suggest SQL in final response.
    
  } catch (e) {
    console.error(e);
  }
}

run();
