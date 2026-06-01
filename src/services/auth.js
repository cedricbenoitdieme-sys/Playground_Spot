import { supabase } from '../lib/supabase';

/**
 * Inscription d'un nouvel utilisateur
 * Le trigger `trg_on_auth_user_created` crée automatiquement le profil
 */
export const signUp = async ({ email, password, nom, role = 'joueur', quartier = '', tel = '' }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nom, role, quartier, tel }
    }
  });
  if (error) throw error;
  return data;
};

/**
 * Connexion par email/mot de passe
 */
export const signIn = async ({ email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

/**
 * Déconnexion
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

/**
 * Récupérer la session active
 */
export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

/**
 * Récupérer le profil complet d'un utilisateur connecté
 */
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

/**
 * Mettre à jour le profil
 */
export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/**
 * Écouter les changements d'état d'authentification
 */
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};
