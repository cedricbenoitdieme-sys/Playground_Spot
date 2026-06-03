/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Logger de Sécurité
 * Security Rules: 9.1, 9.2, 9.3, 9.4, 9.5
 * ═══════════════════════════════════════════════════════════
 * 
 * CHAQUE action critique doit être loggée (qui, quoi, quand, où) (9.1)
 * TOUJOURS inclure l'user_id dans les logs (9.2)
 * JAMAIS logguer les mots de passe ou tokens (9.3)
 */

import { supabase } from './supabase';

const IS_DEV = import.meta.env.DEV;

// ── Patterns sensibles à JAMAIS logger (9.3) ────────────────
const SENSITIVE_KEYS = [
  'password', 'mot_de_passe', 'mdp',
  'token', 'jwt', 'access_token', 'refresh_token',
  'secret', 'api_key', 'apiKey',
  'authorization', 'bearer',
  'credit_card', 'carte', 'cvv', 'cvc',
  'pin', 'otp',
];

/**
 * Supprime les champs sensibles d'un objet avant logging.
 * JAMAIS logguer les mots de passe ou tokens (9.3).
 */
const stripSensitiveData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const cleaned = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key of Object.keys(cleaned)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof cleaned[key] === 'object' && cleaned[key] !== null) {
      cleaned[key] = stripSensitiveData(cleaned[key]);
    }
  }
  
  return cleaned;
};

/**
 * Types d'événements de sécurité.
 */
export const SecurityEvent = {
  // Auth
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',
  SIGNUP: 'signup',
  
  // Transactions
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILURE: 'payment_failure',
  
  // Réservations
  RESERVATION_CREATED: 'reservation_created',
  RESERVATION_CANCELLED: 'reservation_cancelled',
  RESERVATION_CONFIRMED: 'reservation_confirmed',
  
  // Admin
  ROLE_CHANGED: 'role_changed',
  USER_SUSPENDED: 'user_suspended',
  USER_ACTIVATED: 'user_activated',
  
  // Security
  ACCESS_DENIED: 'access_denied',
  RATE_LIMITED: 'rate_limited',
  VALIDATION_FAILED: 'validation_failed',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
};

/**
 * Log une action de sécurité.
 * CHAQUE action critique doit être loggée (qui, quoi, quand, où) (9.1)
 * 
 * @param {string} event - Type d'événement (SecurityEvent)
 * @param {object} params - Paramètres du log
 * @param {string} params.userId - ID de l'utilisateur (9.2)
 * @param {string} params.resourceType - Type de ressource (reservation, paiement, etc.)
 * @param {string} params.resourceId - ID de la ressource
 * @param {object} params.metadata - Métadonnées supplémentaires (seront nettoyées)
 * @param {string} params.severity - 'info', 'warning', 'error', 'critical'
 */
export const logSecurityEvent = async (event, {
  userId = null,
  resourceType = null,
  resourceId = null,
  metadata = {},
  severity = 'info',
} = {}) => {
  // ── Nettoyer les données sensibles (9.3) ──
  const cleanedMetadata = stripSensitiveData(metadata);
  
  const logEntry = {
    event,
    user_id: userId,  // (9.2) TOUJOURS inclure l'user_id
    resource_type: resourceType,
    resource_id: resourceId,
    severity,
    metadata: cleanedMetadata,
    timestamp: new Date().toISOString(),
    // Contexte navigateur (sans données sensibles)
    context: {
      url: window.location.pathname,
      userAgent: navigator.userAgent?.substring(0, 100),
    },
  };
  
  // ── Log en console en développement ──
  if (IS_DEV) {
    const logFn = severity === 'error' || severity === 'critical' 
      ? console.error 
      : severity === 'warning' 
        ? console.warn 
        : console.info;
    logFn(`[Security:${severity.toUpperCase()}] ${event}`, logEntry);
  }
  
  // ── Envoyer les logs critiques vers audit_logs Supabase (9.1) ──
  if (severity === 'warning' || severity === 'error' || severity === 'critical') {
    try {
      // On utilise la table audit_logs existante pour les événements critiques
      // En envoyant uniquement si on a un resourceId valide (la table l'exige)
      if (resourceId && resourceType) {
        await supabase
          .from('audit_logs')
          .insert({
            actor_id: userId,
            action: event,
            resource_type: resourceType,
            resource_id: resourceId,
            new_state: cleanedMetadata,
          });
      }
    } catch (err) {
      // Ne jamais bloquer l'app si le logging échoue
      if (IS_DEV) {
        console.warn('[SecurityLogger] Échec envoi log Supabase:', err.message);
      }
    }
  }
};

/**
 * Raccourcis pour les logs courants.
 */
export const securityLog = {
  loginSuccess: (userId) => 
    logSecurityEvent(SecurityEvent.LOGIN_SUCCESS, { userId, severity: 'info' }),
  
  loginFailure: (email) => 
    logSecurityEvent(SecurityEvent.LOGIN_FAILURE, { 
      metadata: { email: email?.substring(0, 3) + '***' }, // Email partiel seulement
      severity: 'warning' 
    }),
  
  accessDenied: (userId, path) => 
    logSecurityEvent(SecurityEvent.ACCESS_DENIED, { 
      userId, 
      metadata: { path }, 
      severity: 'warning' 
    }),
  
  paymentInitiated: (userId, reservationId, montant, mode) => 
    logSecurityEvent(SecurityEvent.PAYMENT_INITIATED, { 
      userId, 
      resourceType: 'paiement', 
      resourceId: reservationId,
      metadata: { montant, mode },
      severity: 'info' 
    }),
  
  paymentFailure: (userId, reservationId, error) => 
    logSecurityEvent(SecurityEvent.PAYMENT_FAILURE, { 
      userId, 
      resourceType: 'paiement', 
      resourceId: reservationId,
      metadata: { error: error?.substring?.(0, 100) },
      severity: 'error' 
    }),
  
  suspiciousActivity: (userId, details) =>
    logSecurityEvent(SecurityEvent.SUSPICIOUS_ACTIVITY, {
      userId,
      metadata: { details },
      severity: 'critical',
    }),
};

export { stripSensitiveData };
