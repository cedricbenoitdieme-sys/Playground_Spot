import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * Service pour la gestion des abonnements, des tarifs, des quotas et du budget visibilité
 */

/**
 * Récupère le plan et les limites actuels de l'utilisateur via RPC
 */
export const fetchUserPlanAndLimits = async (userId) => {
  try {
    if (!userId) return null;
    const { data, error } = await supabase.rpc('get_user_plan_and_limits', {
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erreur lors de la récupération du plan utilisateur:', err);
    return null;
  }
};

/**
 * Récupère l'intégralité de la grille tarifaire (plan_limits)
 */
export const fetchAllPlanLimits = async () => {
  try {
    const { data, error } = await supabase
      .from('plan_limits')
      .select('*')
      .order('prix_mensuel', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Erreur lors de la récupération de la grille tarifaire:', err);
    // En cas d'erreur ou d'environnement local hors-ligne, retourne la structure de secours
    return [
      { plan_id: 'free', nom: 'Free', prix_mensuel: 0, prix_annuel: null, max_terrains: 1, max_reservations_mois: 20, commission_rate: 12.0 },
      { plan_id: 'starter', nom: 'Starter', prix_mensuel: 4900, prix_annuel: null, max_terrains: 3, max_reservations_mois: null, commission_rate: 8.0 },
      { plan_id: 'pro', nom: 'Pro', prix_mensuel: 9900, prix_annuel: 89100, max_terrains: null, max_reservations_mois: null, commission_rate: 2.0 },
      { plan_id: 'entreprise', nom: 'Entreprise', prix_mensuel: 24900, prix_annuel: 224100, max_terrains: null, max_reservations_mois: null, commission_rate: 0.0 },
    ];
  }
};

/**
 * Vérifie un quota spécifique (terrains ou reservations) via RPC
 */
export const checkUserQuota = async (userId, quotaType) => {
  try {
    if (!userId) return { quota_atteint: false, utilise: 0, limite: null, illimite: true };
    const { data, error } = await supabase.rpc('check_quota', {
      p_user_id: userId,
      p_quota_type: quotaType,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error(`Erreur vérification quota ${quotaType}:`, err);
    return { quota_atteint: false, utilise: 0, limite: null, illimite: true };
  }
};

/**
 * Déclenche l'Edge Function create-payment pour initier un abonnement
 */
export const initiateSubscriptionPayment = async ({ plan_id, cycle, phone_number, mode = 'wave' }) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error('Vous devez être connecté pour souscrire un abonnement.');
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: {
        plan: plan_id,
        billing_period: cycle === 'annuel' ? 'annual' : 'monthly',
        payment_method: mode,
        customer_number: phone_number,
      },
    });

    if (error) {
      console.error('Erreur invoke create-payment:', error);
      throw new Error(error.message || 'Impossible d\'initialiser le paiement.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (err) {
    return handleServiceError(err, 'Échec de l\'initialisation du paiement');
  }
};

/**
 * Récupère le statut d'une souscription par ID
 */
export const fetchSubscriptionStatus = async (subscriptionId) => {
  try {
    if (!subscriptionId) return null;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id, status, plan_id, cycle, date_debut, date_fin, unitech_reference')
      .eq('id', subscriptionId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erreur lecture statut souscription:', err);
    return null;
  }
};

/**
 * Initie le paiement d'une campagne de boost (Wave/Orange) via UnitechPay.
 */
export const initiateBoostPayment = async ({ terrain_id, budget_fcfa, duree_jours, phone_number, mode = 'wave' }) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Vous devez être connecté pour activer un boost.');
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: {
        payment_type: 'boost',
        terrain_id,
        budget_fcfa,
        duree_jours,
        payment_method: mode,
        customer_number: phone_number,
      },
    });

    if (error) throw new Error(error.message || "Impossible d'initialiser le paiement.");
    if (data?.error) throw new Error(data.error);
    return data; // { success, payment_url, deep_links, boost_id, unitech_reference, montant }
  } catch (err) {
    return handleServiceError(err, 'Échec de l\'initialisation du paiement de boost');
  }
};

/**
 * Statut d'un boost par ID (pour le polling post-paiement).
 */
export const fetchBoostStatus = async (boostId) => {
  try {
    if (!boostId) return null;
    const { data, error } = await supabase
      .from('visibility_boosts')
      .select('id, statut, date_debut, date_fin, duree_jours, unitech_reference')
      .eq('id', boostId)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erreur lecture statut boost:', err);
    return null;
  }
};

/**
 * Obtenir les statistiques d'un boost
 */
export const getBoostStats = async (boostId) => {
  try {
    if (!boostId) return null;
    const { data, error } = await supabase.rpc('get_boost_stats', {
      p_boost_id: boostId,
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erreur lecture stats boost:', err);
    return null;
  }
};

// Ancienne fonction fetchGerantTerrainsForBoost supprimée : elle sélectionnait
// une colonne inexistante (`prix_heure`, la vraie colonne est `price`), ce qui
// faisait échouer la requête à chaque appel. L'erreur était avalée
// silencieusement (try/catch → []), affichant "Aucun terrain enregistré"
// même quand le gérant en avait un. Remplacée par la réutilisation directe
// de `fetchTerrainsByGerant` (services/terrains.js), déjà utilisée et
// fonctionnelle dans "Mon Terrain" — une seule requête à maintenir plutôt
// que deux logiques divergentes pour la même donnée.

/**
 * Liste les boosts existants du gérant
 */
export const fetchGerantBoosts = async (gerantId) => {
  try {
    if (!gerantId) return [];
    const { data, error } = await supabase
      .from('visibility_boosts')
      .select(`
        id,
        budget_alloue,
        date_debut,
        date_fin,
        duree_jours,
        unitech_reference,
        statut,
        vues_generees,
        created_at,
        terrains (
          nom,
          image_url
        )
      `)
      .eq('gerant_id', gerantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Erreur chargement boosts du gérant:', err);
    return [];
  }
};
