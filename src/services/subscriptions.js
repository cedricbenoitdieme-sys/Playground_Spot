import { supabase } from '../lib/supabase';
import { callRpc } from '../lib/supabaseRpc';
import { handleServiceError } from '../lib/errorHandler';
import { PLANS_LIST } from '../config/plansConfig';

/**
 * Service pour la gestion des abonnements, des tarifs, des quotas et du budget visibilité
 */

/**
 * Activates the Free plan for the logged-in user via RPC (no create-payment call)
 */
export const activateFreePlan = async () => {
  try {
    const { data, error } = await supabase.rpc('activate_free_plan');
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Erreur activation plan Free:', err);
    return handleServiceError(err, 'Échec de l\'activation du plan Free');
  }
};

/**
 * Starts a 30-day trial for a given plan (starter | pro | entreprise) via RPC
 */
export const startTrial = async (planId) => {
  try {
    const { data, error } = await supabase.rpc('start_trial', { p_plan: planId });
    if (error) {
      // Check for trial already used error message
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('déjà') || msg.includes('already') || msg.includes('trial') || error.code === 'P0001') {
        throw new Error('Vous avez déjà bénéficié de votre période d\'essai de 30 jours sur ce compte.');
      }
      throw error;
    }
    return { success: true, data };
  } catch (err) {
    console.error('Erreur activation essai 30 jours:', err);
    const customMsg = err.message?.includes('déjà bénéficié')
      ? err.message
      : 'Période d\'essai déjà utilisée ou indisponible pour ce compte.';
    return { success: false, error: customMsg };
  }
};

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
 * Récupère l'intégralité de la grille tarifaire (utilise plansConfig par défaut)
 */
export const fetchAllPlanLimits = async () => {
  try {
    const { data, error } = await supabase
      .from('plan_limits')
      .select('*')
      .order('prix_mensuel', { ascending: true });

    if (error || !data || data.length === 0) {
      return PLANS_LIST;
    }
    return data;
  } catch (err) {
    console.error('Erreur lors de la récupération de la grille tarifaire:', err);
    return PLANS_LIST;
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
 * Body exact: { kind: 'subscription', plan, payment_method, customer_number }
 * N'envoie JAMAIS de montant au serveur.
 */
export const initiateSubscriptionPayment = async ({ plan_id, phone_number, mode = 'wave' }) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error('Vous devez être connecté pour souscrire un abonnement.');
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: {
        kind: 'subscription',
        plan: plan_id,
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
 * Récupère le statut d'un paiement via la RPC get_payment_status
 */
export const getPaymentStatus = async (paymentId) => {
  try {
    if (!paymentId) return null;
    const { data, error } = await supabase.rpc('get_payment_status', { p_payment_id: paymentId });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erreur lecture statut paiement (RPC):', err);
    return null;
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
 * Initie le paiement d'une campagne de visibilité via UnitechPay.
 * Body exact: { kind: 'campaign', terrain_id, budget, duration_days, payment_method, customer_number }
 */
export const initiateBoostPayment = async ({ terrain_id, budget, duration_days, phone_number, mode = 'wave' }) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Vous devez être connecté pour activer un boost.');
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: {
        kind: 'campaign',
        terrain_id,
        budget: Number(budget),
        duration_days: Number(duration_days),
        payment_method: mode,
        customer_number: phone_number,
      },
    });

    if (error) {
      // 403 Forbidden check (Plan Free)
      if (error.status === 403 || error.message?.includes('403')) {
        const customError = new Error('Ce module nécessite un abonnement Starter ou supérieur.');
        customError.isForbiddenPlan = true;
        throw customError;
      }
      throw new Error(error.message || "Impossible d'initialiser le paiement.");
    }
    if (data?.error) {
      if (data.error.includes('403') || data.error.includes('Starter') || data.error.includes('plan')) {
        const customError = new Error('Ce module nécessite un abonnement Starter ou supérieur.');
        customError.isForbiddenPlan = true;
        throw customError;
      }
      throw new Error(data.error);
    }
    return data;
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
