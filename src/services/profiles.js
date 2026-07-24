import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';
import { validateUUID } from '../lib/validators';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Service Profils Sécurisé
 * Security Rules: 3.2, 3.3, 5.1, 5.3
 * ═══════════════════════════════════════════════════════════
 */

/**
 * Règle 3.3 — Masquer les données sensibles (email, téléphone).
 * JAMAIS retourner les emails/téléphones complets sauf pour le propriétaire.
 * 
 * @param {object} profile - Le profil complet
 * @param {string|null} currentUserId - L'ID de l'utilisateur connecté
 * @param {string|null} currentUserRole - Le rôle de l'utilisateur connecté
 * @returns {object} - Profil avec données sensibles masquées
 */
const maskSensitiveData = (profile, currentUserId = null, currentUserRole = null) => {
  if (!profile) return profile;
  
  // Le propriétaire du profil ou un admin voit tout
  if (currentUserId === profile.id || ['admin', 'super_admin'].includes(currentUserRole)) {
    return profile;
  }
  
  // ── Règle 3.3 — Masquage email et tel pour les autres ──
  return {
    ...profile,
    email: profile.email ? `${profile.email.substring(0, 3)}***@${profile.email.split('@')[1] || '***'}` : null,
    tel: profile.tel ? `${profile.tel.substring(0, 7)}***` : null,
  };
};

/**
 * Récupérer tous les profils (admin only — RLS filtre).
 * Règle 3.2 — TOUJOURS filtrer les données selon le rôle utilisateur.
 */
export const fetchProfiles = async ({ role, statut, limit = 100, currentUserId = null, currentUserRole = null } = {}) => {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (role) query = query.eq('role', role);
  if (statut) query = query.eq('statut', statut);

  const { data, error } = await query;
  if (error) throw handleServiceError(error, 'fetchProfiles');
  
  return data.map(p => ({
    ...maskSensitiveData(p, currentUserId, currentUserRole),
    initiales: p.avatar || getInitiales(p.nom),
  }));
};

/**
 * Récupérer les gérants avec leurs terrains.
 *
 * NOTE DE SÉCURITÉ ET PERFORMANCE :
 * N'utilise PAS le hook useGerantTerrains ici (conçu pour un seul gérant, boucler créerait un problème N+1).
 * Interroge directement la vue `v_gerant_terrains` qui agrège l'ensemble des terrains par gérant en une seule requête.
 * (Voir migrations 20260724110000 et 20260724120000 pour la vue canonique).
 */
export const fetchGerants = async ({ currentUserId = null, currentUserRole = null } = {}) => {
  const { data: gerants, error: gerantsErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'gerant')
    .order('nom');
  if (gerantsErr) throw handleServiceError(gerantsErr, 'fetchGerants:profiles');

  const { data: terrainStats, error: statsErr } = await supabase
    .from('v_gerant_terrains')
    .select('*');
  if (statsErr) throw handleServiceError(statsErr, 'fetchGerants:v_gerant_terrains');

  const statsByGerant = Object.fromEntries((terrainStats || []).map(s => [s.gerant_id, s]));

  return gerants.map(g => {
    const stats = statsByGerant[g.id];
    return {
      ...maskSensitiveData(g, currentUserId, currentUserRole),
      initiales: g.avatar || getInitiales(g.nom),
      terrains: stats?.terrains || [],
      terrainCount: stats?.terrain_count || 0,
    };
  });
};

/**
 * Récupérer les joueurs (utilisateurs).
 */
export const fetchJoueurs = async ({ currentUserId = null, currentUserRole = null } = {}) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'joueur')
    .order('nom');
  if (error) throw handleServiceError(error, 'fetchJoueurs');
  
  return data.map(j => ({
    ...maskSensitiveData(j, currentUserId, currentUserRole),
    initiales: j.avatar || getInitiales(j.nom),
  }));
};

/**
 * Mettre à jour le statut d'un profil (suspendre, activer, etc.).
 */
export const updateProfileStatut = async (profileId, statut) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(profileId);
  if (!idCheck.valid) throw new Error(idCheck.error);
  
  // ── Validation du statut ──
  const validStatuts = ['actif', 'suspendu', 'inactif', 'en_attente'];
  if (!validStatuts.includes(statut)) {
    throw new Error('Statut invalide.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ statut })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'updateProfileStatut');
  return data;
};

/**
 * Récupérer un profil avec son historique de réservations.
 */
export const fetchProfileWithHistory = async (profileId, { currentUserId = null, currentUserRole = null } = {}) => {
  // ── Règle 2.4 — Validation UUID ──
  const idCheck = validateUUID(profileId);
  if (!idCheck.valid) throw new Error(idCheck.error);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();
  if (profileError) throw handleServiceError(profileError, 'fetchProfileWithHistory');

  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select(`
      *,
      terrains ( nom, quartier ),
      paiements ( mode, statut )
    `)
    .eq('joueur_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (resError) throw handleServiceError(resError, 'fetchProfileWithHistory:reservations');

  const maskedProfile = maskSensitiveData(profile, currentUserId, currentUserRole);
  
  return {
    ...maskedProfile,
    initiales: profile.avatar || getInitiales(profile.nom),
    historique: reservations.map(r => ({
      date: new Date(r.date_slot).toLocaleDateString('fr-FR'),
      terrain: r.terrains?.nom || r.terrain_nom,
      creneau: r.heure_slot?.slice(0, 5),
      montant: `${r.montant?.toLocaleString('fr-FR')} FCFA`,
      statut: mapStatut(r.statut),
    })),
    depenses: reservations
      .filter(r => r.statut === 'confirmee' || r.statut === 'terminee')
      .reduce((sum, r) => sum + (r.montant || 0), 0),
    reservations: reservations.length,
  };
};

// ── Helpers ─────────────────────────────────────────────
const getInitiales = (nom) => {
  if (!nom) return '??';
  return nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

const mapStatut = (statut) => {
  const map = {
    'en_attente': 'En attente',
    'confirmee': 'Confirmée',
    'terminee': 'Terminée',
    'annulee': 'Annulée',
  };
  return map[statut] || statut;
};
