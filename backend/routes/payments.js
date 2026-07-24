import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
    const cleanedPhone = customer.phone.replace(/\D/g, '');
    const referer = req.headers.referer || `${req.protocol}://${req.get('host')}`;
    const cleanReferer = referer.endsWith('/') ? referer.slice(0, -1) : referer;

    const response = await fetch(`https://api.unitech.sn/api.php?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        amount: paiement.montant,
        customer_number: cleanedPhone,
        reference: ref_externe,
        description: `Réservation PlaygroundSpot`,
        callback_success: `${cleanReferer}?payment_success=true`,
        callback_cancel: `${cleanReferer}?payment_cancel=true`,
        webhook_url: `${req.protocol}://${req.get('host')}/api/payment/unitech/webhook`
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

    return res.json({ success: true, payment_url: paymentUrl, transaction_ref: ref_externe });

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
