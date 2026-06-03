import { createClient } from '@supabase/supabase-js';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Client Supabase Sécurisé
 * Security Rules: 8.1, 8.5, 10.1, 10.4
 * ═══════════════════════════════════════════════════════════
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// ── Règle 10.4 — Validation au démarrage stricte ────────────
// TOUJOURS faire échouer l'app rapidement si les variables d'environnement requises sont manquantes
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[PlaygroundSpot] ERREUR FATALE : Variables d\'environnement Supabase manquantes.\n' +
    'Configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans votre fichier .env.local.\n' +
    'L\'application ne peut pas démarrer sans ces credentials.'
  );
}

// ── Règle 10.1 — Vérification que la clé anon n'est pas une service_role ──
// La clé service_role contient "service_role" dans le payload JWT
// On vérifie grossièrement que ce n'est pas le cas
try {
  const payload = JSON.parse(atob(supabaseAnonKey.split('.')[1]));
  if (payload.role === 'service_role') {
    throw new Error(
      '[PlaygroundSpot] ERREUR FATALE : La clé VITE_SUPABASE_ANON_KEY contient une clé service_role.\n' +
      'JAMAIS utiliser la clé service_role côté client. Utilisez la clé anon.'
    );
  }
} catch (e) {
  if (e.message.includes('service_role')) throw e;
  // Si le parsing échoue, ce n'est pas un JWT valide, Supabase gérera l'erreur
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ═══════════════════════════════════════════════════════════
// Client-Side Rate Limiter
// Security Rules: 8.1, 8.5
// ═══════════════════════════════════════════════════════════

const rateLimitStore = new Map();

/**
 * Règle 8.1 — Vérifie le rate limit côté client.
 * Limite les appels par action pour protéger contre le spam.
 * 
 * @param {string} action - Nom de l'action (ex: 'createReservation', 'login')
 * @param {number} maxRequests - Nombre max de requêtes dans la fenêtre
 * @param {number} windowMs - Fenêtre de temps en millisecondes
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
export const checkRateLimit = (action, maxRequests = 10, windowMs = 60_000) => {
  const now = Date.now();
  const key = action;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }
  
  const timestamps = rateLimitStore.get(key);
  
  // Nettoyer les entrées expirées
  const validTimestamps = timestamps.filter(t => now - t < windowMs);
  rateLimitStore.set(key, validTimestamps);
  
  if (validTimestamps.length >= maxRequests) {
    const oldestValid = validTimestamps[0];
    const retryAfter = Math.ceil((oldestValid + windowMs - now) / 1000);
    
    // ── Règle 8.5 — Logger les tentatives suspectes ──
    if (import.meta.env.DEV) {
      console.warn(`[RateLimit] Action "${action}" bloquée. ${validTimestamps.length}/${maxRequests} dans les ${windowMs / 1000}s. Retry dans ${retryAfter}s.`);
    }
    
    return { allowed: false, retryAfter };
  }
  
  validTimestamps.push(now);
  return { allowed: true };
};

/**
 * Rate limits spécifiques par action critique.
 */
export const RATE_LIMITS = {
  login: { maxRequests: 5, windowMs: 60_000 },       // 5 tentatives/minute
  signup: { maxRequests: 3, windowMs: 300_000 },      // 3/5 minutes
  createReservation: { maxRequests: 5, windowMs: 60_000 }, // 5/minute
  createPaiement: { maxRequests: 3, windowMs: 60_000 },   // 3/minute
  updateProfile: { maxRequests: 5, windowMs: 60_000 },    // 5/minute
};
