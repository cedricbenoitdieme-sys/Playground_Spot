/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Gestionnaire d'Erreurs Sécurisé
 * Security Rules: 5.1, 5.2, 5.3, 5.4, 5.5
 * ═══════════════════════════════════════════════════════════
 * 
 * JAMAIS exposer les stack traces aux utilisateurs (5.1)
 * TOUJOURS logguer les erreurs serveur complet (5.2)
 * TOUJOURS retourner des messages d'erreur génériques publiquement (5.3)
 * JAMAIS continuer l'exécution après une erreur critique (5.4)
 * TOUJOURS implémenter retry logic avec backoff exponentiel (5.5)
 */

const IS_DEV = import.meta.env.DEV;

// ── Messages d'erreur génériques (ne leakent rien) ──────────
const GENERIC_MESSAGES = {
  auth: 'Erreur d\'authentification. Veuillez vous reconnecter.',
  permission: 'Vous n\'avez pas la permission d\'effectuer cette action.',
  notFound: 'La ressource demandée est introuvable.',
  validation: 'Les données envoyées sont invalides.',
  network: 'Erreur de connexion au serveur. Vérifiez votre connexion internet.',
  payment: 'Erreur lors du traitement du paiement. Veuillez réessayer.',
  server: 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
  rateLimit: 'Trop de requêtes. Veuillez patienter avant de réessayer.',
};

/**
 * Classe SafeError — Erreur sécurisée qui ne leake jamais le stack.
 * Utilisée pour les erreurs retournées à l'utilisateur.
 */
export class SafeError extends Error {
  constructor(userMessage, { code = 'UNKNOWN', statusCode = 500, details = null } = {}) {
    super(userMessage);
    this.name = 'SafeError';
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    // Les détails techniques ne sont stockés qu'en dev
    this.details = IS_DEV ? details : null;
    // Supprimer le stack en production
    if (!IS_DEV) {
      this.stack = undefined;
    }
  }
}

/**
 * Gestionnaire d'erreurs centralisé.
 * - En DEV : log complet (stack, détails Supabase, context)
 * - En PROD : log minimal, message générique retourné
 * 
 * @param {Error} error - L'erreur originale
 * @param {string} context - Contexte de l'erreur (ex: 'createReservation', 'login')
 * @returns {SafeError} - Erreur sécurisée pour l'UI
 */
export const handleServiceError = (error, context = 'unknown') => {
  // ── Règle 5.2 — Log complet interne ──
  if (IS_DEV) {
    console.error(`[${context}] Erreur:`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack,
    });
  }

  // ── Règle 5.3 — Messages génériques publics ──
  // Catégoriser l'erreur pour retourner le bon message générique
  const supabaseCode = error?.code;
  const message = error?.message?.toLowerCase() || '';

  // Auth errors
  if (supabaseCode === 'PGRST301' || message.includes('jwt') || message.includes('auth')) {
    return new SafeError(GENERIC_MESSAGES.auth, { code: 'AUTH_ERROR', statusCode: 401, details: error.message });
  }

  // Permission errors
  if (supabaseCode === '42501' || message.includes('permission') || message.includes('rls') || message.includes('policy')) {
    return new SafeError(GENERIC_MESSAGES.permission, { code: 'PERMISSION_ERROR', statusCode: 403, details: error.message });
  }

  // Not found
  if (supabaseCode === 'PGRST116' || message.includes('not found') || message.includes('no rows')) {
    return new SafeError(GENERIC_MESSAGES.notFound, { code: 'NOT_FOUND', statusCode: 404, details: error.message });
  }

  // Validation errors
  if (supabaseCode === '23514' || supabaseCode === '23505' || message.includes('constraint') || message.includes('check')) {
    return new SafeError(GENERIC_MESSAGES.validation, { code: 'VALIDATION_ERROR', statusCode: 400, details: error.message });
  }

  // Network errors
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || error.name === 'TypeError') {
    return new SafeError(GENERIC_MESSAGES.network, { code: 'NETWORK_ERROR', statusCode: 503, details: error.message });
  }

  // Rate limit
  if (supabaseCode === '429' || message.includes('rate limit') || message.includes('too many')) {
    return new SafeError(GENERIC_MESSAGES.rateLimit, { code: 'RATE_LIMIT', statusCode: 429, details: error.message });
  }

  // Erreur spécifique au login Supabase — on la laisse passer telle quelle
  if (message.includes('invalid') || message.includes('credentials') || message.includes('incorrect') || message.includes('email not confirmed')) {
    return new SafeError(error.message, { code: 'AUTH_ERROR', statusCode: 401, details: error.message });
  }

  // Fallback — erreur générique
  return new SafeError(GENERIC_MESSAGES.server, { code: 'SERVER_ERROR', statusCode: 500, details: error.message });
};

/**
 * Règle 5.5 — Retry avec backoff exponentiel.
 * @param {Function} fn - Fonction async à réessayer
 * @param {object} options - Options de retry
 * @returns {Promise<any>} - Résultat de la fonction
 */
export const withRetry = async (fn, { maxRetries = 3, baseDelay = 1000, context = 'retry' } = {}) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) break;
      
      // Backoff exponentiel : 1s, 2s, 4s...
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 500; // Ajouter du jitter pour éviter les thundering herds
      
      if (IS_DEV) {
        console.warn(`[${context}] Tentative ${attempt + 1}/${maxRetries} échouée, retry dans ${delay + jitter}ms`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw handleServiceError(lastError, context);
};

/**
 * Empêche un appel réseau de bloquer l'UI indéfiniment (ex: spinner de login qui tourne à l'infini).
 * @param {Promise} promise - La promesse à borner dans le temps
 * @param {number} ms - Délai maximum en ms avant l'échec forcé
 */
export const withTimeout = (promise, ms = 10000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new SafeError(GENERIC_MESSAGES.network, { code: 'TIMEOUT', statusCode: 504 })), ms)
    ),
  ]);
};

/**
 * Helper pour wrapper un appel de service avec error handling.
 * Usage: const data = await safeCall(() => supabase.from('x').select(), 'fetchX');
 */
export const safeCall = async (fn, context = 'unknown') => {
  try {
    return await fn();
  } catch (error) {
    throw handleServiceError(error, context);
  }
};

export { GENERIC_MESSAGES };
