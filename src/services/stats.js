import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * Statistiques admin globales
 */
export const fetchAdminStats = async () => {
  const { data, error } = await supabase.rpc('get_admin_stats');
  if (error) {
    // Fallback : requêtes individuelles si la RPC n'existe pas encore
    if (import.meta.env.DEV) {
      console.warn('RPC get_admin_stats non disponible, fallback queries...');
    }
    return await fetchAdminStatsFallback();
  }
  return data;
};

const fetchAdminStatsFallback = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [revRes, todayRes, terrainsRes, joueursRes] = await Promise.all([
    supabase.from('reservations')
      .select('montant')
      .gte('date_slot', startOfMonth)
      .in('statut', ['confirmee', 'terminee']),
    supabase.from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('date_slot', today),
    supabase.from('terrains')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'actif'),
    supabase.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'joueur'),
  ]);

  return {
    revenus_mois: (revRes.data || []).reduce((sum, r) => sum + (r.montant || 0), 0),
    reservations_jour: todayRes.count || 0,
    terrains_actifs: terrainsRes.count || 0,
    joueurs_inscrits: joueursRes.count || 0,
  };
};

/**
 * Occupation par quartier (pour le chart admin)
 */
export const fetchOccupationByQuartier = async () => {
  const { data, error } = await supabase
    .from('terrains')
    .select('quartier')
    .eq('statut', 'actif');
  if (error) throw handleServiceError(error, 'fetchOccupationByQuartier');

  // Grouper par quartier et calculer un taux d'occupation simulé à partir de la DB
  const quartiers = {};
  data.forEach(t => {
    if (!quartiers[t.quartier]) quartiers[t.quartier] = 0;
    quartiers[t.quartier]++;
  });

  // Récupérer les réservations du mois en cours pour enrichir
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const { data: reservations } = await supabase
    .from('reservations')
    .select('terrain_id, terrains!inner(quartier)')
    .gte('date_slot', startOfMonth)
    .in('statut', ['confirmee', 'terminee']);

  const resParQuartier = {};
  (reservations || []).forEach(r => {
    const q = r.terrains?.quartier;
    if (q) {
      resParQuartier[q] = (resParQuartier[q] || 0) + 1;
    }
  });

  const total = Object.values(resParQuartier).reduce((a, b) => a + b, 1); // +1 to avoid /0
  return Object.keys(quartiers).map(q => ({
    quartier: q,
    percentage: Math.min(100, Math.round(((resParQuartier[q] || 0) / total) * 100 * Object.keys(quartiers).length)),
  }));
};

/**
 * Réservations récentes pour le tableau admin
 */
export const fetchRecentReservations = async (limit = 10) => {
  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      profiles!joueur_id ( nom ),
      paiements ( mode, statut )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw handleServiceError(error, 'fetchRecentReservations');

  const mapStatut = (s) => ({
    'en_attente': 'En attente',
    'confirmee': 'Confirmée',
    'terminee': 'Terminée',
    'annulee': 'Annulée',
  }[s] || s);

  return data.map(r => ({
    id: r.id,
    terrain: r.terrain_nom,
    player: r.joueur_nom,
    slot: `${new Date(r.date_slot).toLocaleDateString('fr-FR')} - ${r.heure_slot?.slice(0, 5)}`,
    amount: `${r.montant?.toLocaleString('fr-FR')} FCFA`,
    status: mapStatut(r.statut),
    // Raw pour actions
    raw: r,
  }));
};

/**
 * Stats gérant : KPIs par terrain et période
 */
export const fetchGerantKpis = async (gerantId, terrainId = null, periode = 'month') => {
  const now = new Date();
  let dateDebut;

  switch (periode) {
    case 'week':
      dateDebut = new Date(now); dateDebut.setDate(now.getDate() - 7); break;
    case 'quarter':
      dateDebut = new Date(now); dateDebut.setMonth(now.getMonth() - 3); break;
    case 'month':
    default:
      dateDebut = new Date(now.getFullYear(), now.getMonth(), 1); break;
  }

  let query = supabase
    .from('reservations')
    .select('montant, statut, terrain_id')
    .gte('date_slot', dateDebut.toISOString().split('T')[0]);

  if (terrainId) {
    query = query.eq('terrain_id', terrainId);
  } else {
    // Toutes les réservations des terrains du gérant
    const { data: mesTerrains } = await supabase
      .from('terrains')
      .select('id')
      .eq('gerant_id', gerantId);
    const ids = (mesTerrains || []).map(t => t.id);
    if (ids.length) query = query.in('terrain_id', ids);
  }

  const { data, error } = await query;
  if (error) throw handleServiceError(error, 'fetchGerantKpis');

  const confirmees = data.filter(r => r.statut === 'confirmee' || r.statut === 'terminee');
  return {
    revenus: confirmees.reduce((sum, r) => sum + (r.montant || 0), 0),
    reservations: data.length,
    tauxOccupation: data.length > 0 ? Math.round((confirmees.length / data.length) * 100) : 0,
    noteMoyenne: null, // sera enrichi par un appel séparé si besoin
  };
};

/**
 * Répartition des paiements par mode (pour graphiques gérant)
 */
export const fetchRepartitionPaiements = async (gerantId) => {
  const { data: mesTerrains } = await supabase
    .from('terrains')
    .select('id')
    .eq('gerant_id', gerantId);
  const terrainIds = (mesTerrains || []).map(t => t.id);
  if (!terrainIds.length) return [];

  const { data, error } = await supabase
    .from('paiements')
    .select('mode, montant, statut, reservation_id, reservations!inner(terrain_id)')
    .in('reservations.terrain_id', terrainIds)
    .eq('statut', 'valide');
  if (error) throw handleServiceError(error, 'fetchRepartitionPaiements');

  const grouped = {};
  (data || []).forEach(p => {
    if (!grouped[p.mode]) grouped[p.mode] = { montant: 0, count: 0 };
    grouped[p.mode].montant += p.montant || 0;
    grouped[p.mode].count++;
  });

  const total = Object.values(grouped).reduce((s, g) => s + g.montant, 1);
  const colors = { wave: '#2563EB', orange_money: '#F97316', sur_place: '#1A7A4A', carte: '#8B5CF6' };
  const labels = { wave: 'Wave', orange_money: 'Orange Money', sur_place: 'Sur place', carte: 'Carte' };

  return Object.entries(grouped).map(([mode, stats]) => ({
    label: labels[mode] || mode,
    value: Math.round((stats.montant / total) * 100),
    color: colors[mode] || '#666',
    montant: stats.montant,
    transactions: stats.count,
  }));
};

/**
 * Créneaux disponibles pour un terrain (joueur)
 */
export const fetchCreneauxDisponibles = async (terrainId, date) => {
  const { data, error } = await supabase
    .from('creneaux')
    .select('*')
    .eq('terrain_id', terrainId)
    .eq('date', date)
    .eq('statut', 'disponible')
    .order('heure_debut');
  if (error) throw handleServiceError(error, 'fetchCreneauxDisponibles');
  return data;
};

/**
 * Tous les créneaux d'un terrain pour une date (gérant - planning)
 */
export const fetchCreneauxByDate = async (terrainId, date) => {
  const { data, error } = await supabase
    .from('creneaux')
    .select(`
      *,
      reservations ( id, joueur_nom, statut )
    `)
    .eq('terrain_id', terrainId)
    .eq('date', date)
    .order('heure_debut');
  if (error) throw handleServiceError(error, 'fetchCreneauxByDate');
  return data;
};

/**
 * Créer un créneau (gérant)
 */
export const createCreneau = async ({ terrain_id, date, heure_debut, heure_fin, statut = 'disponible', motif_blocage = null }) => {
  const { data, error } = await supabase
    .from('creneaux')
    .insert({ terrain_id, date, heure_debut, heure_fin, statut, motif_blocage })
    .select()
    .single();
  if (error) throw handleServiceError(error, 'createCreneau');
  return data;
};

/**
 * Mettre à jour un créneau (bloquer/débloquer)
 */
export const updateCreneau = async (creneauId, updates) => {
  const { data, error } = await supabase
    .from('creneaux')
    .update(updates)
    .eq('id', creneauId)
    .select()
    .single();
  if (error) throw handleServiceError(error, 'updateCreneau');
  return data;
};

/**
 * Supprimer un créneau
 */
export const deleteCreneau = async (creneauId) => {
  const { error } = await supabase
    .from('creneaux')
    .delete()
    .eq('id', creneauId);
  if (error) throw handleServiceError(error, 'deleteCreneau');
};

/**
 * Helper : formater un montant en abrégé
 */
export const formatAmountAbbreviated = (num) => {
  if (typeof num !== 'number') {
    const cleanStr = num.toString().replace(/\s/g, '').replace(/[^0-9]/g, '');
    const parsed = parseInt(cleanStr, 10);
    if (isNaN(parsed)) return num;
    num = parsed;
  }
  if (num >= 1000000000) {
    return (num / 1000000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Md';
  }
  if (num >= 1000000) {
    return (num / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  }
  if (num >= 1000) {
    return (num / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' K';
  }
  return num.toLocaleString('fr-FR');
};
