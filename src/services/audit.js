import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Service Audit Sécurisé
 * Security Rules: 5.1, 5.3, 9.1
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Récupère les logs d'audit avec les informations de l'acteur (profil) associé.
 */
export const fetchAuditLogs = async () => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      *,
      profiles:actor_id (
        id,
        nom,
        avatar,
        role
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    // ── Règle 5.1 — Ne jamais exposer les détails internes ──
    // ── Règle 5.3 — Message générique ──
    throw handleServiceError(error, 'fetchAuditLogs');
  }
  return data;
};
