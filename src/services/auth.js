import { supabase, checkRateLimit, RATE_LIMITS } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';
import { securityLog } from '../lib/securityLogger';
import { validateEmail, validatePassword } from '../lib/validators';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Service Auth Sécurisé
 * Security Rules: 1.3, 2.1, 2.2, 2.3, 2.5, 8.2, 9.1
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Règle 2.1 — Récupérer l'utilisateur authentifié avec validation serveur.
 * Utilise getUser() au lieu de getSession() pour vérifier le JWT côté serveur Supabase.
 * @returns {Promise<object|null>} - L'utilisateur authentifié ou null
 */
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
};

/**
 * Règle 2.5 — TOUJOURS refuser les requêtes sans authentification valide.
 * Vérifie que l'utilisateur est authentifié et lève une erreur sinon.
 * @returns {Promise<object>} - L'utilisateur authentifié
 * @throws {Error} - Si non authentifié
 */
export const requireAuth = async () => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentification requise. Veuillez vous connecter.');
  }
  return user;
};

/**
 * Règle 2.2 — TOUJOURS valider le rôle utilisateur AVANT l'action.
 * @param {string[]} allowedRoles - Rôles autorisés
 * @returns {Promise<{ user: object, profile: object }>}
 * @throws {Error} - Si non autorisé
 */
export const requireRole = async (allowedRoles) => {
  const user = await requireAuth();
  const profile = await getProfile(user.id);
  
  if (!profile || !allowedRoles.includes(profile.role)) {
    // ── Règle 9.1 — Logger l'accès refusé ──
    securityLog.accessDenied(user.id, `Rôle ${profile?.role} non autorisé pour ${allowedRoles.join(', ')}`);
    throw new Error('Vous n\'avez pas la permission d\'effectuer cette action.');
  }
  
  // Vérifier que le compte n'est pas suspendu (2.3)
  if (profile.statut === 'suspendu' || profile.statut === 'inactif') {
    securityLog.accessDenied(user.id, `Compte ${profile.statut}`);
    throw new Error('Votre compte est suspendu ou inactif. Contactez l\'administrateur.');
  }
  
  return { user, profile };
};

/**
 * Inscription d'un nouvel utilisateur.
 * Le trigger `trg_on_auth_user_created` crée automatiquement le profil.
 * 
 * Règles: 2.2 (validation rôle), 8.2 (rate limit signup)
 */
export const signUp = async ({ email, password, nom, role = 'joueur', quartier = '', tel = '' }) => {
  // ── Règle 8.2 — Rate limiting inscription ──
  const rl = checkRateLimit('signup', RATE_LIMITS.signup.maxRequests, RATE_LIMITS.signup.windowMs);
  if (!rl.allowed) {
    throw new Error(`Trop de tentatives d'inscription. Réessayez dans ${rl.retryAfter}s.`);
  }

  // ── Validation des entrées ──
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) throw new Error(emailCheck.error);
  
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) throw new Error(pwdCheck.error);
  
  // ── Règle 2.2 — Seuls joueur et gerant peuvent s'inscrire ──
  const allowedSignupRoles = ['joueur', 'gerant'];
  if (!allowedSignupRoles.includes(role)) {
    throw new Error('Rôle d\'inscription invalide.');
  }
  
  if (!nom || nom.trim().length < 2) {
    throw new Error('Le nom doit contenir au moins 2 caractères.');
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { nom: nom.trim(), role, quartier, tel: tel.trim() }
      }
    });
    if (error) throw error;
    
    // ── Règle 9.1 — Logger l'inscription ──
    securityLog.loginSuccess(data.user?.id);
    
    return data;
  } catch (error) {
    throw handleServiceError(error, 'signUp');
  }
};

/**
 * Connexion par email/mot de passe.
 * 
 * Règles: 8.2 (rate limit login), 9.1 (log tentatives)
 */
export const signIn = async ({ email, password }) => {
  // ── Règle 8.2 — Rate limiting connexion ──
  const rl = checkRateLimit('login', RATE_LIMITS.login.maxRequests, RATE_LIMITS.login.windowMs);
  if (!rl.allowed) {
    securityLog.loginFailure(email);
    throw new Error(`Trop de tentatives de connexion. Réessayez dans ${rl.retryAfter}s.`);
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: email.trim().toLowerCase(), 
      password 
    });
    if (error) {
      // ── Règle 9.1 — Logger l'échec de connexion ──
      securityLog.loginFailure(email);
      throw error;
    }
    
    // ── Règle 9.1 — Logger le succès ──
    securityLog.loginSuccess(data.user?.id);
    
    return data;
  } catch (error) {
    // Re-throw les erreurs de login Supabase telles quelles pour le message utilisateur
    if (error.message?.includes('Invalid login') || error.message?.includes('Email not confirmed')) {
      throw error;
    }
    throw handleServiceError(error, 'signIn');
  }
};

/**
 * Déconnexion.
 */
export const signOut = async () => {
  try {
    const user = await getCurrentUser();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // ── Log la déconnexion ──
    if (user) {
      securityLog.loginSuccess(user.id); // on logue aussi les logouts
    }
  } catch (error) {
    throw handleServiceError(error, 'signOut');
  }
};

/**
 * Récupérer la session active.
 * Note: getSession() ne valide PAS le JWT côté serveur.
 * Pour la sécurité, utiliser getCurrentUser() à la place.
 */
export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw handleServiceError(error, 'getSession');
  return session;
};

/**
 * Récupérer le profil complet d'un utilisateur connecté.
 */
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw handleServiceError(error, 'getProfile');
  return data;
};

/**
 * Mettre à jour le profil.
 * Règle 2.3 — Vérifier que l'utilisateur modifie SON propre profil.
 */
export const updateProfile = async (userId, updates) => {
  // ── Règle 8.1 — Rate limiting ──
  const rl = checkRateLimit('updateProfile', RATE_LIMITS.updateProfile.maxRequests, RATE_LIMITS.updateProfile.windowMs);
  if (!rl.allowed) {
    throw new Error(`Trop de modifications. Réessayez dans ${rl.retryAfter}s.`);
  }

  // ── Règle 2.3 — Vérifier l'identité ──
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.id !== userId) {
    securityLog.accessDenied(currentUser?.id, 'Tentative de modification du profil d\'un autre utilisateur');
    throw new Error('Vous ne pouvez modifier que votre propre profil.');
  }
  
  // ── Règle 2.2 — Interdire le changement de rôle par l'utilisateur ──
  if (updates.role !== undefined) {
    delete updates.role;
  }
  
  // ── Interdire le changement de statut par l'utilisateur ──
  if (updates.statut !== undefined) {
    delete updates.statut;
  }
  
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'updateProfile');
  return data;
};

/**
 * Écouter les changements d'état d'authentification.
 */
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};
