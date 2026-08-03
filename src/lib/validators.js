/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Validateurs Centralisés de Sécurité
 * Security Rules: 1.1, 1.2, 2.2, 2.4, 3.3, 4.3
 * ═══════════════════════════════════════════════════════════
 */

// ── Constantes ──────────────────────────────────────────────
const MAX_PAYMENT_AMOUNT = 500_000; // 500 000 FCFA max
const MIN_PAYMENT_AMOUNT = 100;     // 100 FCFA min

// UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Format téléphone Sénégal exact : 7X XXXXXXX (avec préfixe +221 ou 221 toléré)
const SENEGAL_PHONE_RE = /^(\+221|221)?7[0-9]{8}$/;

const ALLOWED_ROLES = ['admin', 'super_admin', 'gerant', 'joueur'];

// ── Règle 2.4 — Validation UUID ─────────────────────────────
export const validateUUID = (id) => {
  if (!id) {
    return { valid: false, error: 'ID requis' };
  }
  if (import.meta.env?.DEV) {
    if (typeof id === 'number' || /^\d+$/.test(id)) {
      return { valid: true };
    }
  }
  if (typeof id !== 'string') {
    return { valid: false, error: 'Format UUID invalide' };
  }
  if (!UUID_REGEX.test(id)) {
    return { valid: false, error: 'Format UUID invalide' };
  }
  return { valid: true };
};

// ── Règle 1.2 — Validation Téléphone Sénégal ────────────────
/**
 * Valide un numéro de téléphone au format sénégalais.
 * @param {string} tel - Le numéro de téléphone
 * @param {boolean} isRequired - Si le champ est obligatoirement requis (ex: Orange Money)
 * @param {boolean} isOrangeMoney - Si la méthode est Orange Money pour le message d'erreur approprié
 * @returns {{ valid: boolean, error?: string, sanitized?: string }}
 */
export const validatePhone = (tel, isRequired = true, isOrangeMoney = false) => {
  const raw = typeof tel === 'string' ? tel : '';
  const cleaned = raw.replace(/[\s\-().]/g, '');

  if (!cleaned) {
    if (isRequired) {
      const emptyMsg = isOrangeMoney ? 'Numéro Orange Money requis' : 'Numéro de téléphone requis';
      return { valid: false, error: emptyMsg };
    }
    return { valid: true, sanitized: '' };
  }

  if (!SENEGAL_PHONE_RE.test(cleaned)) {
    return { valid: false, error: 'Format invalide (ex : 77 123 45 67)' };
  }

  const digits = cleaned.replace(/^(\+221|221)/, '');
  const sanitized = `+221 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;

  return { valid: true, sanitized };
};

// ── Règle 1.1 — Validation Montant ──────────────────────────
export const validateAmount = (montant, options = {}) => {
  const min = options.min ?? MIN_PAYMENT_AMOUNT;
  const max = options.max ?? MAX_PAYMENT_AMOUNT;

  if (montant === null || montant === undefined || typeof montant !== 'number') {
    return { valid: false, error: 'Montant requis (nombre)' };
  }
  if (!Number.isFinite(montant) || Number.isNaN(montant)) {
    return { valid: false, error: 'Montant invalide' };
  }
  if (montant <= 0) {
    return { valid: false, error: 'Le montant doit être supérieur à 0' };
  }
  if (montant < min) {
    return { valid: false, error: `Le montant minimum est de ${min.toLocaleString('fr-FR')} FCFA` };
  }
  if (montant > max) {
    return { valid: false, error: `Le montant maximum est de ${max.toLocaleString('fr-FR')} FCFA` };
  }
  if (!Number.isInteger(montant)) {
    return { valid: false, error: 'Le montant doit être un nombre entier' };
  }
  return { valid: true };
};

// ── Règle 2.2 — Validation Rôle ─────────────────────────────
export const validateRole = (role) => {
  if (!role || typeof role !== 'string') {
    return { valid: false, error: 'Rôle requis' };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { valid: false, error: `Rôle invalide. Autorisés : ${ALLOWED_ROLES.join(', ')}` };
  }
  return { valid: true };
};

// ── Règle 3.3 — Sanitisation Input ──────────────────────────
export const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// ── Règle 1.2 — Validation Email ─────────────────────────────
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email requis' };
  }
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Format email invalide' };
  }
  if (trimmed.length > 254) {
    return { valid: false, error: 'Email trop long' };
  }
  return { valid: true };
};

// ── Règle 4.3 — Validation Mot de Passe ─────────────────────
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Mot de passe requis' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Le mot de passe doit contenir au moins 8 caractères' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Le mot de passe est trop long (max 128 caractères)' };
  }
  return { valid: true };
};

// ── Export des constantes ─────────────────────────────────────
export const LIMITS = {
  MAX_PAYMENT_AMOUNT,
  MIN_PAYMENT_AMOUNT,
  ALLOWED_ROLES,
};
