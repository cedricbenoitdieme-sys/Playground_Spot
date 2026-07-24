import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import webhooksRouter from '../backend/routes/webhooks.js';
import paymentsRouter from '../backend/routes/payments.js';
import verifyRouter from '../backend/routes/verify.js';

const app = express();

// Middleware CORS — restreint à l'origine de l'app en production
const allowedOrigins = process.env.VERCEL_URL
  ? [`https://${process.env.VERCEL_URL}`, process.env.ALLOWED_ORIGIN].filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (appels serveur-à-serveur, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
    callback(new Error('Non autorisé par CORS'));
  },
  credentials: true,
}));

// Webhooks mounted BEFORE express.json() for raw body parsing
app.use('/api/webhooks', webhooksRouter);

app.use(express.json());

// Routes
app.use('/api/payments', paymentsRouter);
app.use('/api/reservations', verifyRouter);

// Supabase Admin Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERREUR FATALE: Variables d'environnement Supabase manquantes");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Rate Limiting : 30 requêtes par minute par IP (Anti brute-force)
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limite à 30 requêtes par IP par fenêtre
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Use X-Forwarded-For if behind a proxy like Vercel
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress,
});

// Auth Middleware (Vérification du JWT via Supabase)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token d\'authentification manquant ou invalide' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    // Récupération du profil pour vérifier le rôle
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'gerant' && profile.role !== 'admin')) {
      return res.status(403).json({ error: 'Accès refusé. Rôle gérant ou admin requis.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur interne lors de la vérification' });
  }
};

// Log de scan Helper
const logScan = async (token, ip, statut, userId = null) => {
  try {
    await supabase.from('scan_logs').insert({
      token,
      ip_address: ip,
      statut_retourne: statut,
      scanned_by: userId
    });
  } catch (error) {
    console.error("Erreur d'insertion dans scan_logs:", error);
  }
};

// Helper de formatage date
const formatScanAt = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).replace(',', ' à');
};

const formatDateFront = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR');
};

// Route API de vérification
app.get('/api/verify/:token', verifyLimiter, authMiddleware, async (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
  const scannerId = req.user.id;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

  try {
    let reservation = null;
    let ticket = null;

    if (isUUID) {
      // 1. Cherche dans la table tickets
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          reservations (
            *,
            terrains ( nom, quartier ),
            profiles!joueur_id ( nom )
          )
        `)
        .eq('token', token)
        .single();

      if (!ticketError && ticketData) {
        ticket = ticketData;
        reservation = ticketData.reservations;
      }
    } else {
      // 2. Cherche le token dans reservations (format PS-XXXXXX)
      const { data: resData } = await supabase
        .from('reservations')
        .select(`
          *,
          terrains ( nom, quartier ),
          profiles!joueur_id ( nom )
        `)
        .eq('qr_token', token)
        .single();
      
      reservation = resData;
    }

    if (!reservation) {
      await logScan(token, ip, 'invalide', scannerId);
      return res.json({ statut: 'invalide' });
    }

    // Extraction des données pour le front
    const responseData = {
      joueur: reservation.profiles?.nom || reservation.joueur_nom,
      terrain: reservation.terrains?.nom || reservation.terrain_nom,
      quartier: reservation.terrains?.quartier || '',
      date: formatDateFront(reservation.date_slot),
      creneau: `${reservation.heure_slot.slice(0, 5)} – ${String(parseInt(reservation.heure_slot.slice(0, 2)) + reservation.duree_heures).padStart(2, '0')}h00`,
      nbJoueurs: 10,
      montant: `${reservation.montant.toLocaleString('fr-FR')} FCFA`
    };

    // Si c'est un ticket UUID
    if (ticket) {
      if (reservation.statut === 'annulee' || ticket.status === 'expired') {
        await logScan(token, ip, 'annule', scannerId);
        return res.json({ statut: 'annule', ...responseData, scanAt: null });
      }

      if (ticket.status === 'used') {
        await logScan(token, ip, 'utilise', scannerId);
        return res.json({ 
          statut: 'utilise', 
          ...responseData, 
          scanAt: formatScanAt(ticket.used_at) 
        });
      }
    } else {
      // Si c'est une réservation classique (PS-XXXXXX)
      if (reservation.statut === 'annulee') {
        await logScan(token, ip, 'annule', scannerId);
        return res.json({ statut: 'annule', ...responseData, scanAt: null });
      }

      if (reservation.scan_at) {
        await logScan(token, ip, 'utilise', scannerId);
        return res.json({ 
          statut: 'utilise', 
          ...responseData, 
          scanAt: formatScanAt(reservation.scan_at) 
        });
      }
    }

    // Mettre à jour le statut en base de données
    const now = new Date().toISOString();
    
    if (ticket) {
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'used', used_at: now, used_by: scannerId })
        .eq('id', ticket.id);

      if (updateError) {
        console.error("Erreur update ticket status:", updateError);
        return res.status(500).json({ error: "Erreur lors de la validation du ticket" });
      }
    } else {
      const { error: updateError } = await supabase
        .from('reservations')
        .update({ scan_at: now })
        .eq('id', reservation.id);

      if (updateError) {
        console.error("Erreur update scan_at:", updateError);
        return res.status(500).json({ error: "Erreur lors de la validation du ticket" });
      }
    }

    await logScan(token, ip, 'valide', scannerId);

    return res.json({ 
      statut: 'valide', 
      ...responseData, 
      scanAt: formatScanAt(now) 
    });

  } catch (error) {
    console.error("Erreur serveur verify:", error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route API pour ajouter un gérant (Admin uniquement)
app.post('/api/create-gerant', authMiddleware, async (req, res) => {
  const createGerantSchema = z.object({
    email: z.string().email('Email invalide'),
    nom: z.string().min(1, 'Nom complet requis'),
    tel: z.string().optional().nullable(),
    quartier: z.string().optional().nullable(),
  });

  const parsed = createGerantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  
  const { email, nom, tel, quartier } = parsed.data;

  try {
    // 1. Récupérer le rôle de l'utilisateur qui fait la requête pour s'assurer que c'est un Admin
    const { data: profile, error: roleError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (roleError || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès interdit : Rôle Admin requis' });
    }

    // Mot de passe temporaire aléatoire
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';

    // 2. Créer l'utilisateur dans auth.users via l'admin client
    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        nom: nom.trim(),
        role: 'gerant'
      }
    });

    if (createError) {
      console.error(createError);
      return res.status(400).json({ error: 'Erreur lors de la création de l\'utilisateur' });
    }

    const newUserId = authUser.user.id;

    // 3. Mettre à jour le profil SQL associé
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        tel: tel?.trim() || null,
        quartier: quartier?.trim() || null,
        statut: 'en_attente'
      })
      .eq('id', newUserId)
      .select()
      .single();

    if (updateError) {
      // Nettoyage en cas d'erreur
      await supabase.auth.admin.deleteUser(newUserId);
      console.error(updateError);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
    }

    return res.json({ 
      success: true, 
      user: updatedProfile,
      tempPassword
    });

  } catch (error) {
    console.error("Erreur create-gerant:", error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

const unitechApiKey = process.env.UNITECH_API_KEY;
const unitechWebhookSecret = process.env.UNITECH_WEBHOOK_SECRET;

// Initiate Pay Unitech Payment
app.post('/api/payment/unitech/initiate', async (req, res) => {
  const { paiement_id, mode: reqMode, montant, numero_tel } = req.body;
  if (!paiement_id || !numero_tel) {
    return res.status(400).json({ error: 'paiement_id et numero_tel requis' });
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paiement_id);

  try {
    let mode = reqMode || 'wave';
    let finalMontant = montant || 10000;

    if (isUUID) {
      // 1. Récupérer le mode et le montant vérifié depuis la base de données (Sécurité RLS/Anti-triche)
      const { data: paiement, error: dbError } = await supabase
        .from('paiements')
        .select('mode, montant')
        .eq('id', paiement_id)
        .single();

      if (dbError || !paiement) {
        console.error('[UnitechPay] Impossible de récupérer le paiement en BDD:', dbError);
        return res.status(404).json({ error: 'Paiement introuvable en base de données' });
      }

      mode = paiement.mode;
      finalMontant = paiement.montant;
    } else {
      console.warn(`[UnitechPay] Identifiant de paiement non-UUID reçu (${paiement_id}), fallback simulation.`);
    }

    // 2. Déterminer l'action Pay Unitech
    let action = 'create_wave_payment';
    if (mode === 'orange_money') {
      action = 'create_orange_om';
    }

    console.log(`[UnitechPay] Initialisation du paiement ${paiement_id} (${mode}) via action ${action} pour le montant ${finalMontant} FCFA sur le numéro ${numero_tel}`);

    if (!unitechApiKey) {
      console.warn("[UnitechPay] Clé API UNITECH_API_KEY non configurée. Simulation de la redirection.");
      return res.json({
        success: true,
        simulation: true,
        checkout_url: `/api/payment/unitech/mock-redirect?paiement_id=${paiement_id}&montant=${finalMontant}`
      });
    }

    const url = `https://api.unitech.sn/api.php?action=${action}`;
    const cleanedPhone = numero_tel.replace(/\D/g, '');
    const referer = req.headers.referer || `${req.protocol}://${req.get('host')}`;
    const cleanReferer = referer.endsWith('/') ? referer.slice(0, -1) : referer;
    const callback_success = `${cleanReferer}?payment_success=true`;
    const callback_cancel = `${cleanReferer}?payment_cancel=true`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${unitechApiKey}`
      },
      body: JSON.stringify({
        amount: finalMontant,
        customer_number: cleanedPhone,
        reference: paiement_id,
        description: `Réservation PlaygroundSpot #${paiement_id.substring(0, 8)}`,
        callback_success,
        callback_cancel,
        webhook_url: `${req.protocol}://${req.get('host')}/api/payment/unitech/webhook`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API Unitech: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[UnitechPay] Réponse API reçue:', JSON.stringify(result));

    const realUrl = result.checkout_url || result.payment_url || result.data?.payment_url || result.data?.checkout_url;

    return res.json({
      success: true,
      checkout_url: realUrl || `/api/payment/unitech/mock-redirect?paiement_id=${paiement_id}&montant=${finalMontant}`
    });

  } catch (error) {
    console.error('[UnitechPay] Erreur initiation:', error);
    return res.status(500).json({ error: 'Impossible d\'initier le paiement' });
  }
});

// Webhook Pay Unitech
app.post('/api/payment/unitech/webhook', async (req, res) => {
  const { reference, status, signature } = req.body;

  try {
    console.log('[UnitechPay Webhook] Payload reçu:', JSON.stringify(req.body));

    if (reference && reference.startsWith('mock-')) {
      console.log(`[UnitechPay Webhook] Simulation de succès reçue pour le paiement mock ${reference}.`);
      return res.json({ success: true, message: 'Simulation de démo traitée avec succès' });
    }

    if (unitechWebhookSecret && signature) {
      const computedSignature = crypto
        .createHmac('sha256', unitechWebhookSecret)
        .update(JSON.stringify({ reference, status }))
        .digest('hex');

      if (computedSignature !== signature) {
        console.error('[UnitechPay Webhook] Signature invalide');
        return res.status(401).json({ error: 'Signature invalide' });
      }
    }

    const { error: rpcError } = await supabase.rpc('handle_payment_webhook', {
      p_provider: 'pay_unitech',
      p_payload: req.body,
      p_reference: reference,
      p_status: status
    });

    if (rpcError) {
      console.error('[UnitechPay Webhook] Erreur rpc handle_payment_webhook:', rpcError);
      return res.status(500).json({ error: 'Erreur mise à jour paiement en BDD' });
    }

    console.log(`[UnitechPay Webhook] Statut de paiement ${reference} mis à jour avec succès : ${status}`);
    return res.json({ success: true });

  } catch (error) {
    console.error('[UnitechPay Webhook] Erreur traitement:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route de redirection de simulation
app.get('/api/payment/unitech/mock-redirect', (req, res) => {
  const { ref, montant } = req.query;
  res.send(`
    <html>
      <head>
        <title>Simulation UnitechPay</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #FAF9F6; margin: 0; }
          .card { background: white; padding: 2.5rem; border: 1px solid rgba(0,0,0,0.1); border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align: center; max-width: 400px; }
          h2 { color: #0F2318; margin-top: 0; }
          button { background: #6366F1; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 1rem; width: 100%; margin-top: 1rem; }
          button.fail { background: #EF4444; margin-top: 0.5rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Portail de Paiement Pay Unitech (Simulateur)</h2>
          <p>Réf: <strong>${ref}</strong></p>
          <p>Montant: <strong>${montant} FCFA</strong></p>
          <button onclick="sendWebhook('success')">Simuler Succès (Payer)</button>
          <button class="fail" onclick="sendWebhook('failed')">Simuler Échec</button>
        </div>
        <script>
          async function sendWebhook(status) {
            try {
              const res = await fetch('/api/payment/unitech/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: '${ref}',
                  status: status
                })
              });
              if (res.ok) {
                alert('Webhook de simulation envoyé! Vous pouvez fermer cette fenêtre.');
                window.close();
              } else {
                alert('Erreur lors de l\\'envoi du webhook');
              }
            } catch (e) {
              alert('Erreur réseau');
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
