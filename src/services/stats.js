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
  const parStatut = {
    confirmee: data.filter(r => r.statut === 'confirmee').length,
    terminee: data.filter(r => r.statut === 'terminee').length,
    annulee: data.filter(r => r.statut === 'annulee').length,
    en_attente: data.filter(r => r.statut === 'en_attente').length,
  };

  // Note moyenne + distribution réelles (avis sur les terrains du gérant, tous statuts confondus)
  const terrainIdsForAvis = terrainId ? [terrainId] : await fetchGerantTerrainIds(gerantId);
  let noteMoyenne = null;
  let noteDistribution = { cinq: 0, quatre: 0, troisOuMoins: 0 };
  if (terrainIdsForAvis.length) {
    const { data: avisData } = await supabase.from('avis').select('note').in('terrain_id', terrainIdsForAvis);
    if (avisData && avisData.length > 0) {
      noteMoyenne = Math.round((avisData.reduce((s, a) => s + a.note, 0) / avisData.length) * 10) / 10;
      noteDistribution = {
        cinq: Math.round((avisData.filter(a => a.note === 5).length / avisData.length) * 100),
        quatre: Math.round((avisData.filter(a => a.note === 4).length / avisData.length) * 100),
        troisOuMoins: Math.round((avisData.filter(a => a.note <= 3).length / avisData.length) * 100),
      };
    }
  }

  return {
    revenus: confirmees.reduce((sum, r) => sum + (r.montant || 0), 0),
    reservations: data.length,
    tauxOccupation: data.length > 0 ? Math.round((confirmees.length / data.length) * 100) : 0,
    noteMoyenne,
    parStatut,
    noteDistribution,
  };
};

/**
 * Helper interne : IDs des terrains d'un gérant.
 */
const fetchGerantTerrainIds = async (gerantId) => {
  const { data } = await supabase.from('terrains').select('id').eq('gerant_id', gerantId);
  return (data || []).map(t => t.id);
};

/**
 * Résout la date de début d'une période gérant ('week'|'month'|'quarter').
 */
const resolveDateDebut = (periode) => {
  const now = new Date();
  switch (periode) {
    case 'week': { const d = new Date(now); d.setDate(now.getDate() - 7); return d; }
    case 'quarter': { const d = new Date(now); d.setMonth(now.getMonth() - 3); return d; }
    case 'month':
    default: return new Date(now.getFullYear(), now.getMonth(), 1);
  }
};

const mapStatutLabel = (s) => ({
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  terminee: 'Terminée',
  annulee: 'Annulée',
}[s] || s);

/**
 * Revenus par jour (7 derniers jours / mois / trimestre) pour le graphique gérant.
 * `montant` = revenus du terrain sélectionné, `all` = revenus tous terrains du gérant confondus.
 */
export const fetchRevenusParJour = async (gerantId, terrainId = null, periode = 'month') => {
  const terrainIds = await fetchGerantTerrainIds(gerantId);
  if (!terrainIds.length) return [];

  const { data, error } = await supabase
    .from('reservations')
    .select('date_slot, montant, terrain_id')
    .in('terrain_id', terrainIds)
    .gte('date_slot', resolveDateDebut(periode).toISOString().split('T')[0])
    .in('statut', ['confirmee', 'terminee']);
  if (error) throw handleServiceError(error, 'fetchRevenusParJour');

  const byDate = {};
  (data || []).forEach(r => {
    if (!byDate[r.date_slot]) byDate[r.date_slot] = { all: 0, montant: 0 };
    byDate[r.date_slot].all += r.montant || 0;
    if (!terrainId || r.terrain_id === terrainId) byDate[r.date_slot].montant += r.montant || 0;
  });

  return Object.keys(byDate).sort().map(dateStr => {
    const d = new Date(dateStr);
    return {
      jour: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      montant: byDate[dateStr].montant,
      all: byDate[dateStr].all,
    };
  });
};

/**
 * Réservations groupées par heure de créneau, pour le graphique "créneaux" gérant.
 */
export const fetchReservationsParCreneau = async (gerantId, terrainId = null, periode = 'month') => {
  const terrainIds = await fetchGerantTerrainIds(gerantId);
  if (!terrainIds.length) return [];

  let query = supabase
    .from('reservations')
    .select('id, heure_slot, montant, statut, joueur_nom, terrain_nom, terrain_id')
    .in('terrain_id', terrainIds)
    .gte('date_slot', resolveDateDebut(periode).toISOString().split('T')[0]);
  if (terrainId) query = query.eq('terrain_id', terrainId);

  const { data, error } = await query;
  if (error) throw handleServiceError(error, 'fetchReservationsParCreneau');

  const byHeure = {};
  (data || []).forEach(r => {
    const heure = `${r.heure_slot?.slice(0, 2)}h`;
    if (!byHeure[heure]) byHeure[heure] = [];
    byHeure[heure].push({
      id: r.id,
      joueur: r.joueur_nom,
      terrain: r.terrain_nom,
      montant: `${r.montant?.toLocaleString('fr-FR')} FCFA`,
      statut: mapStatutLabel(r.statut),
    });
  });

  return Object.keys(byHeure).sort().map(heure => ({
    heure,
    nb: byHeure[heure].length,
    reservations: byHeure[heure],
  }));
};

/**
 * Classement des joueurs les plus fidèles sur les terrains du gérant.
 */
export const fetchTopJoueurs = async (gerantId, terrainId = null, periode = 'month', limit = 5) => {
  const terrainIds = await fetchGerantTerrainIds(gerantId);
  if (!terrainIds.length) return [];

  let query = supabase
    .from('reservations')
    .select('joueur_id, joueur_nom, terrain_nom, montant, statut, date_slot')
    .in('terrain_id', terrainIds)
    .gte('date_slot', resolveDateDebut(periode).toISOString().split('T')[0])
    .in('statut', ['confirmee', 'terminee']);
  if (terrainId) query = query.eq('terrain_id', terrainId);

  const { data, error } = await query;
  if (error) throw handleServiceError(error, 'fetchTopJoueurs');

  const byJoueur = {};
  (data || []).forEach(r => {
    if (!byJoueur[r.joueur_id]) {
      byJoueur[r.joueur_id] = { id: r.joueur_id, nom: r.joueur_nom, reservations: 0, montant: 0, historique: [] };
    }
    byJoueur[r.joueur_id].reservations += 1;
    byJoueur[r.joueur_id].montant += r.montant || 0;
    byJoueur[r.joueur_id].historique.push({
      date: new Date(r.date_slot).toLocaleDateString('fr-FR'),
      terrain: r.terrain_nom,
      montant: `${r.montant?.toLocaleString('fr-FR')} FCFA`,
      statut: mapStatutLabel(r.statut),
    });
  });

  return Object.values(byJoueur)
    .map(j => ({
      ...j,
      initiales: (j.nom || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      historique: j.historique.sort((a, b) => new Date(b.date.split('/').reverse().join('-')) - new Date(a.date.split('/').reverse().join('-'))),
    }))
    .sort((a, b) => b.reservations - a.reservations)
    .slice(0, limit);
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
  const colors = { wave: '#2563EB', orange_money: '#F97316', sur_place: '#1A7A4A', carte: '#8B5CF6', pay_unitech: '#6366F1' };
  const labels = { wave: 'Wave', orange_money: 'Orange Money', sur_place: 'Sur place', carte: 'Carte', pay_unitech: 'Pay Unitech' };

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
    .select('id, heure_debut, heure_fin, prix_override')
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
