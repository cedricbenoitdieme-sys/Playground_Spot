import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

function logResult(label, { data, error }) {
  if (error) {
    console.log(`❌ ${label} — ERROR: ${error.message}`);
  } else {
    console.log(`✅ ${label}`);
    console.log(JSON.stringify(data, null, 2));
  }
  console.log('---');
}

async function runAsAdmin() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword
  });

  if (signInError || !signInData?.session) {
    console.error('Impossible de se connecter avec le compte admin:', signInError?.message);
    process.exit(1);
  }
  console.log(`Connecté en tant que ${adminEmail}\n`);

  logResult('get_admin_dashboard_stats()', await supabase.rpc('get_admin_dashboard_stats'));

  const terrains = await supabase.rpc('admin_list_terrains', {
    p_search: null, p_zone: null, p_statut: null, p_page: 1, p_page_size: 5
  });
  logResult('admin_list_terrains()', terrains);

  const users = await supabase.rpc('admin_list_users', {
    p_role: null, p_search: null, p_statut: null, p_page: 1, p_page_size: 5
  });
  logResult('admin_list_users() — email/tel doivent être masqués', users);

  // Utilise le premier utilisateur retourné pour tester le reveal de contact
  const firstUser = users?.data?.items?.[0];
  if (firstUser) {
    logResult(
      `admin_reveal_user_contact('${firstUser.id}') — email/tel en clair`,
      await supabase.rpc('admin_reveal_user_contact', { p_user_id: firstUser.id })
    );
  } else {
    console.log('(aucun utilisateur trouvé pour tester admin_reveal_user_contact)\n---');
  }

  logResult('admin_list_subscriptions()', await supabase.rpc('admin_list_subscriptions', {
    p_statut: null, p_search: null, p_page: 1, p_page_size: 5
  }));

  logResult('admin_get_commission_summary()', await supabase.rpc('admin_get_commission_summary', {
    p_date_debut: null, p_date_fin: null
  }));

  logResult('admin_list_logs()', await supabase.rpc('admin_list_logs', {
    p_action: null, p_date_debut: null, p_date_fin: null, p_admin_id: null, p_page: 1, p_page_size: 5
  }));

  await supabase.auth.signOut();
}

async function runAsGuestExpectRejection() {
  console.log('\n=== Test de rejet : compte joueur (non-admin) ===\n');
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const email = `test.rpc.guard.${Date.now()}@gmail.com`;
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password: 'TestPassword123!',
    options: { data: { nom: 'Test RPC Guard', role: 'joueur' } }
  });

  if (signUpError) {
    console.error('Impossible de créer le compte joueur de test:', signUpError.message);
    return;
  }

  const { error, data } = await supabase.rpc('get_admin_dashboard_stats');
  if (error) {
    console.log(`✅ Rejet confirmé pour un compte joueur : ${error.message}`);
  } else {
    console.log('❌ ALERTE : un compte joueur a pu appeler get_admin_dashboard_stats() !', data);
  }
}

async function runFullyAnonymousExpectRejection() {
  console.log('\n=== Test de rejet : aucune session (anon pur, sans compte) ===\n');
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { error, data } = await supabase.rpc('get_admin_dashboard_stats');
  if (error) {
    console.log(`✅ Rejet confirmé sans session : ${error.message}`);
  } else {
    console.log('❌ ALERTE : un appel totalement anonyme a pu appeler get_admin_dashboard_stats() !', data);
  }
}

async function run() {
  await runAsAdmin();
  await runAsGuestExpectRejection();
  await runFullyAnonymousExpectRejection();
}

run();
