import { supabase } from './supabase';
import { handleServiceError } from './errorHandler';

/**
 * Détecte une erreur "JWT expired" (PostgREST/GoTrue rejette la requête
 * avant même que la RPC ne s'exécute — impossible à traiter côté SQL).
 */
const isExpiredTokenError = (error) => {
  const message = (error?.message || '').toLowerCase();
  return error?.code === 'PGRST301' || message.includes('jwt expired') || (message.includes('jwt') && message.includes('expired'));
};

/**
 * Appelle une RPC Supabase avec un rattrapage automatique en cas de token
 * expiré : le client a autoRefreshToken activé (src/lib/supabase.js), mais
 * son minuteur interne peut être retardé par le navigateur si l'onglet reste
 * en arrière-plan pendant longtemps (courant sur un dashboard admin laissé
 * ouvert) — le token en mémoire peut alors expirer avant le refresh planifié.
 * On rafraîchit explicitement la session une fois puis on retente l'appel,
 * plutôt que de laisser fuiter "JWT expired" tel quel à l'écran.
 */
export const callRpc = async (name, params = {}) => {
  let { data, error } = await supabase.rpc(name, params);

  if (error && isExpiredTokenError(error)) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) {
      ({ data, error } = await supabase.rpc(name, params));
    } else {
      // Si le refresh de token échoue, on purge le stockage et force une redirection propre
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      localStorage.removeItem('admin_active_tab');
      window.location.href = '/?view=login&error=session_expired';
      return null;
    }
  }

  if (error) throw handleServiceError(error, `rpc:${name}`);
  return data;
};
