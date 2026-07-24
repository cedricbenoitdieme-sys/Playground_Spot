import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Lazy loaded Supabase Client helper (service_role) to prevent ESM import timing issues
const getSupabase = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variables d'environnement Supabase manquantes");
  }
  return createClient(supabaseUrl, supabaseKey);
};

// Client scopé sur le JWT de l'appelant : utilisé pour appeler la RPC
// admin_reset_user_access afin que auth.uid() (et donc l'audit log) reflète
// le véritable acteur, plutôt que le service_role.
const getCallerSupabase = (token) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Variables d'environnement Supabase manquantes");
  }
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
};

/**
 * POST /api/admin/users/:id/reset-access
 * Réinitialise l'accès d'un utilisateur (super_admin uniquement).
 *
 * L'autorisation + la trace d'audit sont gérées par la RPC SQL
 * `admin_reset_user_access` (voir supabase/migrations/20260721120000_super_admin_dashboard.sql) :
 * cette RPC ne peut pas elle-même invalider une session ou changer un mot de
 * passe (l'Auth Admin API n'est pas accessible depuis PL/pgSQL). Cette route
 * effectue donc la partie qui nécessite la clé service_role, en suivant le
 * même schéma que POST /api/create-gerant dans server.js.
 */
router.post('/users/:id/reset-access', async (req, res) => {
  const targetUserId = req.params.id;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token d\'authentification manquant ou invalide' });
  }
  const token = authHeader.split(' ')[1];
  const supabase = getSupabase();

  try {
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { data: callerProfile, error: roleError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (roleError || !callerProfile || callerProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès interdit : rôle super_admin requis' });
    }

    // 1. Validation + trace d'audit côté SQL (avec le JWT de l'appelant pour un actor_id correct)
    const callerSupabase = getCallerSupabase(token);
    const { data: rpcResult, error: rpcError } = await callerSupabase.rpc('admin_reset_user_access', {
      p_user_id: targetUserId
    });

    if (rpcError) {
      return res.status(400).json({ error: rpcError.message || 'Utilisateur introuvable' });
    }

    // 2. Invalidation réelle de l'accès : rotation du mot de passe via l'Auth Admin API.
    // Note : GoTrue ne fournit pas de méthode "signOut(userId)" (auth.admin.signOut ne prend
    // qu'un JWT de session, pas un user_id) ; la rotation du mot de passe est le mécanisme
    // documenté pour révoquer l'accès d'un compte sans détenir son JWT actuel.
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const { error: updateError } = await supabase.auth.admin.updateUserById(targetUserId, {
      password: tempPassword
    });

    if (updateError) {
      console.error('Erreur reset accès:', updateError.message || updateError);
      return res.status(500).json({ error: 'Impossible de réinitialiser l\'accès de cet utilisateur' });
    }

    return res.status(200).json({
      success: true,
      user_id: targetUserId,
      email: rpcResult?.email,
      tempPassword
    });
  } catch (error) {
    console.error('Erreur serveur admin/reset-access:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

export default router;
