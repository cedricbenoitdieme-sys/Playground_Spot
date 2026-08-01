import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * Service API SenePay client
 */

/**
 * Récupère dynamiquement la liste des pays et opérateurs de SenePay
 */
export const fetchSenePayCountries = async () => {
  try {
    const baseUrl = import.meta.env.VITE_SENEPAY_API_BASE_URL || 'https://api.senepay.sn';
    const res = await fetch(`${baseUrl}/v1/countries`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Impossible de charger les opérateurs');
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[SenePay Service] Fallback sur opérateurs par défaut SN:', err);
    // Fallback Sénégal par défaut
    return [
      {
        code: 'SN',
        name: 'Sénégal',
        currency: 'XOF',
        operators: [
          { code: 'wave', name: 'Wave Mobile Money', icon: 'wave' },
          { code: 'orange', name: 'Orange Money Sénégal', icon: 'orange' },
          { code: 'free', name: 'Free Money', icon: 'free' },
          { code: 'emoney', name: 'E-Money', icon: 'emoney' }
        ]
      }
    ];
  }
};

/**
 * Initie un paiement SenePay via Edge Function senepay-initiate
 */
export const initiateSenePayPayment = async ({
  type_flux,
  plan,
  billing_period,
  terrain_id,
  budget_fcfa,
  duree_jours,
  reservation_id,
  payment_method = 'wave',
  customer_number,
  otp_code,
  order_id
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Vous devez être connecté pour effectuer cette opération.');
    }

    const { data, error } = await supabase.functions.invoke('senepay-initiate', {
      body: {
        type_flux,
        plan,
        billing_period,
        terrain_id,
        budget_fcfa,
        duree_jours,
        reservation_id,
        payment_method,
        customer_number: customer_number?.replace(/\s+/g, ''),
        otp_code,
        order_id
      }
    });

    if (error) {
      console.error('[SenePay Initiate] Erreur invoke:', error);
      throw new Error(error.message || 'Échec de l\'initialisation du paiement SenePay.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (err) {
    return handleServiceError(err, 'Erreur lors du paiement SenePay');
  }
};

/**
 * Polling du statut d'une transaction SenePay
 */
export const pollSenePayStatus = async (orderId) => {
  try {
    if (!orderId) return null;
    const { data, error } = await supabase
      .from('senepay_payments')
      .select('status, next_action, raw_response, updated_at')
      .eq('order_id', orderId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[SenePay Poll] Erreur lecture statut:', err);
    return null;
  }
};

/**
 * Enregistre ou met à jour les coordonnées de paiement du gérant (Payout Info)
 */
export const upsertGerantPayoutInfo = async ({ phone, operator }) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non connecté');

    const { data, error } = await supabase.rpc('upsert_gerant_payout_info', {
      p_phone: phone.replace(/\s+/g, ''),
      p_operator: operator
    });

    if (error) throw error;
    return data;
  } catch (err) {
    return handleServiceError(err, 'Impossible d\'enregistrer les coordonnées de versement');
  }
};

/**
 * Récupère les coordonnées de virement du gérant connecté
 */
export const fetchGerantPayoutInfo = async (gerantId) => {
  try {
    if (!gerantId) return null;
    const { data, error } = await supabase
      .from('gerant_payout_info')
      .select('*')
      .eq('gerant_id', gerantId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[Payout Info] Erreur lecture:', err);
    return null;
  }
};

/**
 * Récupère la liste des versements (Payouts) du gérant
 */
export const fetchGerantPayouts = async (gerantId) => {
  try {
    if (!gerantId) return [];
    const { data, error } = await supabase
      .from('gerant_payouts')
      .select(`
        id,
        external_id,
        disbursement_id,
        amount,
        commission_rate_applied,
        status,
        created_at,
        updated_at,
        reservations (
          id,
          terrain_nom,
          joueur_nom,
          date_slot,
          heure_slot,
          montant
        )
      `)
      .eq('gerant_id', gerantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[Gerant Payouts] Erreur chargement versements:', err);
    return [];
  }
};
