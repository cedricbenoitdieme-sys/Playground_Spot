import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { normalizeSenegalPhone } from '../lib/phone.js';

const router = express.Router();

// Supabase Admin Client (service_role pour bypass RLS)
const getSupabase = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante");
  }
  return createClient(supabaseUrl, supabaseKey);
};

/**
 * POST /api/payments/initiate
 * Prépare un paiement mobile à partir d'un enregistrement existant dans `paiements`.
 *
 * Body attendu : { paiement_id: UUID, customer: { phone, name?, email? } }
 *
 * Flux :
 * 1. Vérifie que le paiement existe et est en_attente
 * 2. Génère un ref_externe unique (PS-uuid)
 * 3. Enregistre le ref_externe dans la table `paiements`
 * 4. Appelle UnitechPay (ou redirige vers le simulateur en dev)
 * 5. Retourne le payment_url au frontend
 */
router.post('/initiate', async (req, res) => {
  const supabase = getSupabase();
  try {
    const { paiement_id, customer } = req.body;

    // Validation des données d'entrée
    if (!paiement_id || !customer?.phone) {
      return res.status(400).json({ error: 'paiement_id et customer.phone requis' });
    }

    // 1. Récupérer le paiement existant depuis la table `paiements`
    const { data: paiement, error: fetchErr } = await supabase
      .from('paiements')
      .select('id, reservation_id, montant, mode, statut')
      .eq('id', paiement_id)
      .single();

    if (fetchErr || !paiement) {
      console.error('[Payments] Paiement introuvable:', fetchErr);
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    if (paiement.statut !== 'en_attente') {
      return res.status(400).json({ error: 'Ce paiement a déjà été traité' });
    }

    // 2. Générer une référence de transaction unique
    const ref_externe = `PS-${crypto.randomUUID()}`;

    // 3. Sauvegarder la ref_externe dans le paiement
    const { error: updateErr } = await supabase
      .from('paiements')
      .update({ ref_externe })
      .eq('id', paiement_id);

    if (updateErr) {
      console.error('[Payments] Erreur MAJ ref_externe:', updateErr);
      return res.status(500).json({ error: 'Erreur interne' });
    }

    // 4. Appeler l'API de paiement ou mode simulation
    const apiKey = process.env.UNITECH_API_KEY;

    if (!apiKey) {
      // Mode simulation (dev) — redirige vers la page de mock
      console.warn('[Payments] UNITECH_API_KEY absente → mode simulation');
      const backendUrl = process.env.VITE_API_URL || `http://localhost:${process.env.PORT || 3000}`;
      return res.json({
        success: true,
        simulation: true,
        payment_url: `${backendUrl}/api/payment/unitech/mock-redirect?ref=${encodeURIComponent(ref_externe)}&montant=${paiement.montant}`,
        transaction_ref: ref_externe
      });
    }

    // 5. Appel réel UnitechPay
    const action = paiement.mode === 'orange_money' ? 'create_orange_om' : 'create_wave_payment';
    let cleanedPhone;
    try {
      cleanedPhone = normalizeSenegalPhone(customer.phone);
    } catch (phoneErr) {
      return res.status(400).json({ error: phoneErr.message });
    }
    const referer = req.headers.referer || `${req.protocol}://${req.get('host')}`;
    const cleanReferer = referer.endsWith('/') ? referer.slice(0, -1) : referer;

    // Le compte marchand UnitechPay n'a qu'UNE SEULE URL de webhook (voir
    // supabase/functions/webhook-unitech/index.ts) — configurée manuellement
    // dans leur dashboard, pas par ce champ (non documenté comme paramètre
    // accepté par create_wave_payment/create_orange_om). On le renseigne
    // quand même par cohérence, au cas où UnitechPay honore un override
    // par-requête en plus de la config dashboard.
    const supabaseUrlForWebhook = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const webhookUrl = `${supabaseUrlForWebhook}/functions/v1/webhook-unitech`;

    const response = await fetch(`https://api.unitech.sn/api.php?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        amount: paiement.montant,
        customer_number: cleanedPhone,
        // Pas de `reference` envoyée : create_wave_payment/create_orange_om
        // ne l'acceptent pas en entrée (confirmé par le code de Sama Boutik,
        // qui ne l'envoie pas non plus) — UnitechPay génère toujours SA
        // PROPRE référence, relue ci-dessous.
        description: `Réservation PlaygroundSpot`,
        callback_success: `${cleanReferer}?payment_success=true&ref=${encodeURIComponent(ref_externe)}`,
        callback_cancel: `${cleanReferer}?payment_cancel=true&ref=${encodeURIComponent(ref_externe)}`,
        webhook_url: webhookUrl
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Payments] Erreur API (${response.status}):`, errText);
      return res.status(502).json({ error: 'Paiement non initialisé' });
    }

    const result = await response.json();
    const paymentUrl = result.checkout_url || result.payment_url || result.data?.payment_url || result.data?.checkout_url;

    if (!paymentUrl) {
      console.error('[Payments] Pas de payment_url:', result);
      return res.status(502).json({ error: 'Paiement non initialisé' });
    }

    // UnitechPay génère sa PROPRE référence — on la relit et on écrase
    // notre ref_externe pré-générée par la leur (service_role, pas de
    // souci RLS ici), sinon le webhook ne retrouvera jamais ce paiement.
    // On stocke aussi payment_url (utile pour "renvoyer le lien" côté
    // front sans rappeler l'API si l'utilisateur revient sur la page).
    let finalRef = ref_externe;
    const unitechOwnReference = result.reference || result.data?.reference;
    const paymentRowUpdate = { payment_url: paymentUrl };
    if (unitechOwnReference && unitechOwnReference !== ref_externe) {
      paymentRowUpdate.ref_externe = unitechOwnReference;
    }
    {
      const { error: refUpdateErr } = await supabase
        .from('paiements')
        .update(paymentRowUpdate)
        .eq('id', paiement_id);
      if (refUpdateErr) {
        console.error('[Payments] Erreur mise à jour paiement (ref_externe/payment_url):', refUpdateErr);
      } else if (paymentRowUpdate.ref_externe) {
        console.log(`[Payments] ref_externe mise à jour: ${ref_externe} → ${unitechOwnReference}`);
        finalRef = unitechOwnReference;
      }
    }

    return res.json({ success: true, payment_url: paymentUrl, transaction_ref: finalRef });

  } catch (error) {
    console.error('[Payments] Erreur initiation:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * GET /api/payments/status
 * Récupère le statut d'un paiement par sa ref_externe
 */
router.get('/status', async (req, res) => {
  const supabase = getSupabase();
  try {
    const { ref } = req.query;
    if (!ref) {
      return res.status(400).json({ error: 'Référence manquante' });
    }

    const { data: paiement, error } = await supabase
      .from('paiements')
      .select('statut')
      .eq('ref_externe', ref)
      .maybeSingle();

    if (error) {
      console.error('[Payments] Erreur statut:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!paiement) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    return res.json({ status: paiement.statut });
  } catch (error) {
    console.error('[Payments] Erreur:', error);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

export default router;
