// ⚠️ Monter cette route AVANT express.json() dans server.js
// pour que express.raw() puisse parser le body brut pour la vérification HMAC.

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
 * POST /api/webhooks/unitech
 * Webhook sécurisé UnitechPay — vérifie la signature HMAC SHA256,
 * met à jour le paiement dans `paiements` et confirme la réservation.
 */
router.post('/unitech', express.raw({ type: 'application/json' }), async (req, res) => {
  const supabase = getSupabase();
  try {
    const secret = process.env.UNITECHPAY_WEBHOOK_SECRET;

    // Vérification de signature si le secret est configuré
    if (secret) {
      const signature = req.headers['x-unitechpay-signature'];
      if (!signature) {
        console.warn('[Webhook] Signature manquante');
        return res.status(401).json({ error: 'Signature manquante' });
      }

      const computedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.body)
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'utf8');
      const compBuffer = Buffer.from(computedSignature, 'utf8');

      if (sigBuffer.length !== compBuffer.length || !crypto.timingSafeEqual(sigBuffer, compBuffer)) {
        console.warn('[Webhook] Signature invalide');
        return res.status(401).json({ error: 'Signature invalide' });
      }
    }

    // Parser le body brut
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (parseErr) {
      console.error('[Webhook] JSON malformé:', parseErr);
      return res.status(400).json({ error: 'JSON malformé' });
    }

    const { transaction_ref, status } = payload;
    if (!transaction_ref || !status) {
      return res.status(400).json({ error: 'transaction_ref et status requis' });
    }

    console.log(`[Webhook] Traitement: ref=${transaction_ref}, status=${status}`);

    // Mapper le statut externe vers l'enum `statut_paiement`
    const statutMap = {
      'success': 'valide', 'approved': 'valide', 'completed': 'valide', 'paid': 'valide',
      'failed': 'echoue', 'declined': 'echoue', 'cancelled': 'echoue'
    };
    const newStatut = statutMap[status] || 'echoue';

    // Rechercher le paiement par ref_externe dans la table `paiements`
    const { data: paiement, error: fetchErr } = await supabase
      .from('paiements')
      .select('id, reservation_id')
      .eq('ref_externe', transaction_ref)
      .maybeSingle();

    if (fetchErr || !paiement) {
      console.error('[Webhook] Paiement introuvable pour ref:', transaction_ref);
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    // Mettre à jour le statut du paiement
    const { error: updateErr } = await supabase
      .from('paiements')
      .update({ statut: newStatut })
      .eq('id', paiement.id);

    if (updateErr) {
      console.error('[Webhook] Erreur MAJ paiement:', updateErr);
      return res.status(500).json({ error: 'Erreur mise à jour paiement' });
    }

    // Si paiement réussi → confirmer la réservation
    if (newStatut === 'valide' && paiement.reservation_id) {
      const { error: resErr } = await supabase
        .from('reservations')
        .update({ statut: 'confirmee' })
        .eq('id', paiement.reservation_id);

      if (resErr) {
        console.error('[Webhook] Erreur MAJ réservation:', resErr);
      } else {
        console.log(`[Webhook] Réservation ${paiement.reservation_id} confirmée.`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Erreur globale:', error);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

export default router;
