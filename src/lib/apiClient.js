/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Client API Sécurisé
 * Security Rules: 6.1, 6.2, 6.3, 6.4, 6.5
 * ═══════════════════════════════════════════════════════════
 * 
 * TOUJOURS vérifier le statut HTTP avant de traiter la réponse (6.1)
 * TOUJOURS définir des timeouts (max 30s) (6.2)
 * TOUJOURS valider la réponse avant d'utiliser les données (6.3)
 * JAMAIS faire confiance aux données externes sans validation (6.4)
 * TOUJOURS logger les appels API (requête + réponse) (6.5)
 */

const IS_DEV = import.meta.env.DEV;

/**
 * Timeout par défaut pour les requêtes API (30 secondes).
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Fetch sécurisé avec timeout, validation de réponse et logging.
 * Utilisé pour les intégrations API externes (Wave, Orange Money, etc.)
 * 
 * @param {string} url - URL de l'API
 * @param {object} options - Options fetch standard + options custom
 * @param {number} options.timeout - Timeout en ms (défaut: 30s)
 * @param {string} options.context - Contexte pour le logging
 * @returns {Promise<object>} - Données JSON de la réponse
 */
export const secureFetch = async (url, {
  timeout = DEFAULT_TIMEOUT_MS,
  context = 'api_call',
  validateResponse = null,
  ...fetchOptions
} = {}) => {
  // ── Règle 6.2 — Timeout obligatoire ──
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const startTime = Date.now();
  
  try {
    // ── Règle 6.5 — Logger la requête ──
    if (IS_DEV) {
      console.info(`[API:${context}] → ${fetchOptions.method || 'GET'} ${url}`);
    }
    
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });
    
    const duration = Date.now() - startTime;
    
    // ── Règle 6.1 — Vérifier le statut HTTP ──
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'No body');
      
      if (IS_DEV) {
        console.error(`[API:${context}] ← ${response.status} (${duration}ms)`, errorBody);
      }
      
      throw new Error(
        `Erreur API: ${response.status} ${response.statusText}`
      );
    }
    
    // ── Règle 6.3 — Valider la réponse ──
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error('Réponse API invalide (JSON attendu)');
    }
    
    // ── Règle 6.4 — Validation custom si fournie ──
    if (validateResponse && typeof validateResponse === 'function') {
      const validation = validateResponse(data);
      if (validation !== true) {
        throw new Error(typeof validation === 'string' ? validation : 'Données de réponse invalides');
      }
    }
    
    // ── Règle 6.5 — Logger la réponse ──
    if (IS_DEV) {
      console.info(`[API:${context}] ← 200 (${duration}ms)`);
    }
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error.name === 'AbortError') {
      if (IS_DEV) {
        console.error(`[API:${context}] ⏱ Timeout après ${duration}ms`);
      }
      throw new Error(`Requête expirée après ${timeout / 1000}s. Vérifiez votre connexion.`);
    }
    
    if (IS_DEV) {
      console.error(`[API:${context}] ✗ Erreur (${duration}ms):`, error.message);
    }
    
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Helper pour les appels POST sécurisés.
 */
export const securePost = (url, body, options = {}) => {
  return secureFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options,
  });
};

/**
 * Helper pour les appels GET sécurisés.
 */
export const secureGet = (url, options = {}) => {
  return secureFetch(url, {
    method: 'GET',
    ...options,
  });
};
