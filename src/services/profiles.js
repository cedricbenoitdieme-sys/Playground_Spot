import { supabase } from '../lib/supabase';

/**
 * Récupérer tous les profils (admin only — RLS filtre)
 */
export const fetchProfiles = async ({ role, statut, limit = 100 } = {}) => {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (role) query = query.eq('role', role);
  if (statut) query = query.eq('statut', statut);

  const { data, error } = await query;
  if (error) throw error;
  return data.map(p => ({
    ...p,
    initiales: p.avatar || getInitiales(p.nom),
  }));
};

/**
 * Récupérer les gérants avec leurs terrains
 */
export const fetchGerants = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      gerant_terrains (
        terrains ( id, nom, quartier )
      )
    `)
    .eq('role', 'gerant')
    .order('nom');
  if (error) throw error;
  return data.map(g => ({
    ...g,
    initiales: g.avatar || getInitiales(g.nom),
    terrains: (g.gerant_terrains || []).map(gt => gt.terrains?.nom).filter(Boolean),
  }));
};

/**
 * Récupérer les joueurs (utilisateurs)
 */
export const fetchJoueurs = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'joueur')
    .order('nom');
  if (error) throw error;
  return data.map(j => ({
    ...j,
    initiales: j.avatar || getInitiales(j.nom),
  }));
};

/**
 * Mettre à jour le statut d'un profil (suspendre, activer, etc.)
 */
export const updateProfileStatut = async (profileId, statut) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ statut })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/**
 * Récupérer un profil avec son historique de réservations
 */
export const fetchProfileWithHistory = async (profileId) => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();
  if (profileError) throw profileError;

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
  if (resError) throw resError;

  return {
    ...profile,
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
