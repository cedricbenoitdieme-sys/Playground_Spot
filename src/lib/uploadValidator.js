/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Validateur d'Uploads Sécurisé
 * Security Rules: 7.1, 7.2, 7.3, 7.4, 7.5
 * ═══════════════════════════════════════════════════════════
 * 
 * TOUJOURS vérifier l'extension ET le type MIME (7.1)
 * JAMAIS stocker les fichiers en locations exécutables (7.2)
 * TOUJOURS limiter la taille (max 50MB par défaut) (7.3)
 * TOUJOURS vérifier l'espace disque avant upload (7.4)
 * JAMAIS accepter les chemins avec ../ ou chemins absolus (7.5)
 */

// ── Constantes ──────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Types MIME autorisés par catégorie
const ALLOWED_MIME_TYPES = {
  image: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

// Extensions autorisées par catégorie
const ALLOWED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'],
  document: ['.pdf', '.doc', '.docx'],
};

// Patterns de chemins dangereux
const DANGEROUS_PATH_PATTERNS = [
  /\.\.\//,         // Directory traversal
  /\.\.\\/,         // Directory traversal (Windows)
  /^[a-zA-Z]:\\/,   // Chemin absolu Windows
  /^\//,            // Chemin absolu Unix
  /[<>:"|?*]/,      // Caractères interdits
  /\0/,             // Null byte injection
];

/**
 * Règle 7.1 — Vérifie l'extension ET le type MIME d'un fichier.
 * 
 * @param {File} file - Le fichier à valider
 * @param {string} category - Catégorie ('image' ou 'document')
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFileType = (file, category = 'image') => {
  if (!file || !(file instanceof File)) {
    return { valid: false, error: 'Fichier requis' };
  }
  
  // Vérifier le type MIME
  const allowedMimes = ALLOWED_MIME_TYPES[category] || [];
  if (!allowedMimes.includes(file.type)) {
    return { 
      valid: false, 
      error: `Type de fichier non autorisé (${file.type}). Types acceptés : ${allowedMimes.join(', ')}` 
    };
  }
  
  // Vérifier l'extension
  const allowedExts = ALLOWED_EXTENSIONS[category] || [];
  const fileName = file.name.toLowerCase();
  const hasValidExt = allowedExts.some(ext => fileName.endsWith(ext));
  if (!hasValidExt) {
    return { 
      valid: false, 
      error: `Extension non autorisée. Extensions acceptées : ${allowedExts.join(', ')}` 
    };
  }
  
  return { valid: true };
};

/**
 * Règle 7.3 — Vérifie la taille du fichier.
 * TOUJOURS limiter la taille (max 50MB par défaut).
 * 
 * @param {File} file - Le fichier à valider
 * @param {number} maxSizeMB - Taille max en MB (défaut: 50)
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFileSize = (file, maxSizeMB = MAX_FILE_SIZE_MB) => {
  if (!file || !(file instanceof File)) {
    return { valid: false, error: 'Fichier requis' };
  }
  
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { 
      valid: false, 
      error: `Le fichier est trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} MB). Taille max : ${maxSizeMB} MB` 
    };
  }
  
  if (file.size === 0) {
    return { valid: false, error: 'Le fichier est vide' };
  }
  
  return { valid: true };
};

/**
 * Règle 7.5 — Vérifie que le chemin/nom de fichier est sûr.
 * JAMAIS accepter les chemins avec ../ ou chemins absolus.
 * 
 * @param {string} filename - Le nom de fichier à valider
 * @returns {{ valid: boolean, error?: string, sanitized?: string }}
 */
export const validateFilePath = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Nom de fichier requis' };
  }
  
  // Vérifier les patterns dangereux
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(filename)) {
      return { valid: false, error: 'Nom de fichier invalide ou dangereux' };
    }
  }
  
  // Nettoyer le nom de fichier
  const sanitized = filename
    .replace(/[^a-zA-Z0-9._\-\s()]/g, '') // Garder uniquement les caractères sûrs
    .replace(/\s+/g, '_')                  // Espaces → underscores
    .slice(0, 255);                         // Limiter la longueur
  
  return { valid: true, sanitized };
};

/**
 * Validation complète d'un fichier avant upload.
 * Combine type, taille et chemin.
 * 
 * @param {File} file - Le fichier à valider
 * @param {object} options - Options de validation
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateUpload = (file, { category = 'image', maxSizeMB = MAX_FILE_SIZE_MB } = {}) => {
  // Type check
  const typeCheck = validateFileType(file, category);
  if (!typeCheck.valid) return typeCheck;
  
  // Size check
  const sizeCheck = validateFileSize(file, maxSizeMB);
  if (!sizeCheck.valid) return sizeCheck;
  
  // Path check
  const pathCheck = validateFilePath(file.name);
  if (!pathCheck.valid) return pathCheck;
  
  return { valid: true, sanitizedName: pathCheck.sanitized };
};

export { MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS };
