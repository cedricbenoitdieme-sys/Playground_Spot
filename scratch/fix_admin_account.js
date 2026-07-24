import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Create a Supabase client using the service role key to bypass RLS and manage auth users
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  const targetEmail = 'cedricbenoitdieme@gmail.com';
  const targetPassword = 'Liberte_75';

  console.log(`Checking account status for: ${targetEmail}...`);

  try {
    // 1. Check if profile exists in public.profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', targetEmail)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return;
    }

    // 2. Check if user exists in auth.users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('Error listing auth users:', listError);
      return;
    }

    const authUser = users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());

    if (authUser) {
      console.log(`✅ Auth user found with ID: ${authUser.id}`);
      
      // Update password to make sure it is correct
      console.log('Updating user password to match target...');
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: targetPassword
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
      } else {
        console.log('✅ Password successfully updated!');
      }

      // Check if profile exists and matches UUID
      if (profile) {
        if (profile.id !== authUser.id) {
          console.warn(`⚠️ Warning: UUID mismatch! Auth ID is ${authUser.id} but Profile ID is ${profile.id}.`);
          console.log('Re-linking profile to match auth user ID...');
          
          // Delete old profile and create a new one matching the auth user ID
          const { error: deleteError } = await supabase.from('profiles').delete().eq('id', profile.id);
          if (deleteError) console.error('Error deleting mismatched profile:', deleteError);

          const { error: insertError } = await supabase.from('profiles').upsert({
            id: authUser.id,
            nom: profile.nom,
            email: profile.email,
            role: 'admin',
            statut: 'actif'
          });

          if (insertError) {
            console.error('Error creating linked profile:', insertError);
          } else {
            console.log('✅ Profile successfully re-linked to Auth UUID.');
          }
        } else {
          console.log('✅ Profile and Auth UUID match.');
          
          // Ensure role is admin and status is active
          if (profile.role !== 'admin' || profile.statut !== 'actif') {
            console.log('Updating profile to admin role and active status...');
            await supabase.from('profiles').update({ role: 'admin', statut: 'actif' }).eq('id', profile.id);
          }
        }
      } else {
        console.log('Creating missing profile for existing auth user...');
        const { error: insertError } = await supabase.from('profiles').insert({
          id: authUser.id,
          nom: authUser.user_metadata?.nom || 'Cedric Benoit Dieme',
          email: targetEmail,
          role: 'admin',
          statut: 'actif'
        });
        if (insertError) console.error('Error inserting profile:', insertError);
        else console.log('✅ Profile created successfully.');
      }

    } else {
      console.log('❌ Auth user not found in auth.users.');
      
      let targetUserId = profile?.id;

      if (profile) {
        console.log(`Found existing profile with ID: ${profile.id}. Creating auth user with this specific ID...`);
        
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          id: profile.id, // specify the exact UUID to match foreign key
          email: targetEmail,
          password: targetPassword,
          email_confirm: true,
          user_metadata: {
            nom: profile.nom,
            role: 'admin'
          }
        });

        if (createError) {
          console.error('Error creating auth user with profile UUID:', createError);
        } else {
          console.log('✅ Auth user created successfully and linked to profile!', newUser.user.id);
        }
      } else {
        console.log('No existing profile found. Creating brand new admin user...');
        
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: targetEmail,
          password: targetPassword,
          email_confirm: true,
          user_metadata: {
            nom: 'Cedric Benoit Dieme',
            role: 'admin'
          }
        });

        if (createError) {
          console.error('Error creating new admin user:', createError);
        } else {
          console.log('✅ Auth user created. Creating corresponding profile...');
          const { error: insertError } = await supabase.from('profiles').insert({
            id: newUser.user.id,
            nom: 'Cedric Benoit Dieme',
            email: targetEmail,
            role: 'admin',
            statut: 'actif'
          });
          if (insertError) console.error('Error inserting profile:', insertError);
          else console.log('✅ Profile created successfully!');
        }
      }
    }

    console.log('\nAll done! Please restart your web page, log out, and log back in.');
  } catch (err) {
    console.error('System error:', err);
  }
}

run();
