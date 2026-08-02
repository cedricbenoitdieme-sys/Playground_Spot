import { supabase } from '../lib/supabase';
import { validatePhone } from '../lib/validators';

/**
 * Service de communication avec l'Edge Function create-payment (UnitechPay).
 * Le client n'envoie JAMAIS le montant ni n'appelle api.unitech.sn en direct.
 */
export const invokeCreatePayment = async ({ creneauId, methode, telephone }) => {
  if (!creneauId) {
    throw { error: 'Créneau non spécifié.', code: 'creneau_introuvable' };
  }

  if (!methode) {
    throw { error: 'Veuillez sélectionner un moyen de paiement.', code: 'methode_requise' };
  }

  // Normalisation / validation du téléphone
  const phoneCheck = validatePhone(telephone);
  if (!phoneCheck.valid) {
    throw { error: phoneCheck.error, code: 'telephone_invalide' };
  }

  const payload = {
    creneau_id: creneauId,
    methode,
    telephone: phoneCheck.sanitized || telephone,
  };

  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: payload,
  });

  if (error) {
    let parsedError = error.message || 'Erreur lors de l’initialisation du paiement.';
    let errorCode = 'erreur_inconnue';

    if (error.context && typeof error.context.json === 'function') {
      try {
        const errJson = await error.context.json();
        if (errJson.error) parsedError = errJson.error;
        if (errJson.code) errorCode = errJson.code;
      } catch (e) {
        // Fallback
      }
    } else if (data && data.error) {
      parsedError = data.error;
      errorCode = data.code || errorCode;
    }

    throw { error: parsedError, code: errorCode };
  }

  if (!data) {
    throw { error: 'Réponse vide du serveur de paiement.', code: 'reponse_vide' };
  }

  if (data.error) {
    throw { error: data.error, code: data.code || 'erreur_serveur' };
  }

  return data;
};

/**
 * Formatage standardisé des montants en FCFA (XOF) sans décimales.
 */
export const formatFCFA = (montant) => {
  if (montant === null || montant === undefined || isNaN(montant)) return '0 FCFA';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(montant)} FCFA`;
};
