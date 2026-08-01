import express from 'express';
import cors from 'cors';
import dns from 'dns';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';

// Prioritize IPv4 over IPv6 to fix Node.js fetch ConnectTimeoutError on dual-stack networks
dns.setDefaultResultOrder('ipv4first');
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '.env.local') });

import webhooksRouter from './routes/webhooks.js';
import paymentsRouter from './routes/payments.js';
import verifyRouter from './routes/verify.js';
import adminRouter from './routes/admin.js';
import terrainsRouter from './routes/terrains.js';
import statsRouter from './routes/stats.js';
import { normalizeSenegalPhone } from './lib/phone.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS — restreint aux origines autorisées
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));

// Webhooks mounted BEFORE express.json() for raw body parsing
app.use('/api/webhooks', webhooksRouter);

// `verify` conserve les octets bruts sur req.rawBody — nécessaire pour
// vérifier une signature HMAC UnitechPay calculée sur le corps brut exact
// (JSON.stringify() d'un objet reconstruit après parsing ne donne PAS les
// mêmes octets : ordre des clés différent, champs absents, etc.).
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Routes
app.use('/api/payments', paymentsRouter);
app.use('/api/reservations', verifyRouter);
app.use('/api/admin', adminRouter);
app.use('/api/terrains', terrainsRouter);
app.use('/api/stats', statsRouter);

// Supabase Admin Client (besoin de la service_role pour bypass RLS et écrire dans scan_logs,
// ou simplement pour lire toutes les réservations sans limite)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERREUR FATALE: Variables d'environnement Supabase manquantes");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Global settings
let modeMaintenance = false;
let commissionPlateforme = 10;

async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value');
    if (!error && data) {
      const maint = data.find(d => d.key === 'mode_maintenance');
      const comm = data.find(d => d.key === 'commission_plateforme');
      if (maint) {
        modeMaintenance = maint.value === true || maint.value === 'true' || maint.value?.value === true;
      }
      if (comm) {
        commissionPlateforme = parseFloat(comm.value) || parseFloat(comm.value?.value) || 10;
      }
    }
  } catch (err) {
    // Graceful fallback to local memory state
  }
}

// Initial load
loadSettings();

// Global Maintenance Middleware
const maintenanceMiddleware = async (req, res, next) => {
  const path = req.path;
  if (
    path.startsWith('/api/settings') || 
    path.startsWith('/api/auth') || 
    path.startsWith('/api/payment/unitech/webhook') ||
    path.startsWith('/api/cron')
  ) {
    return next();
  }

  await loadSettings();

  if (modeMaintenance) {
    // Check if requester is an admin by inspecting Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser(token);
        if (supabaseUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', supabaseUser.id)
            .single();
          if (profile && profile.role === 'admin') {
            return next(); // Admins bypass maintenance
          }
        }
      } catch (err) {
        // Ignore
      }
    }
    return res.status(503).json({ 
      error: 'Maintenance', 
      message: 'La plateforme est actuellement en maintenance. Veuillez réessayer plus tard.' 
    });
  }
  next();
};

app.use(maintenanceMiddleware);

// Rate Limiting : 30 requêtes par minute par IP (Anti brute-force)
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limite à 30 requêtes par IP par fenêtre
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth Middleware (Vérification du JWT via Supabase)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token d\'authentification manquant ou invalide' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !supabaseUser) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const user = supabaseUser;

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
  const ip = req.ip || req.connection.remoteAddress;
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
  const { email, nom, tel, quartier } = req.body;
  if (!email || !nom) {
    return res.status(400).json({ error: 'Email et Nom complet requis' });
  }

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
    let newUserId;
    let authUser = null;
    let createError = null;

    try {
      const authRes = await supabase.auth.admin.createUser({
        email: email.trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          nom: nom.trim(),
          role: 'gerant'
        }
      });
      authUser = authRes.data;
      createError = authRes.error;
    } catch (err) {
      createError = err;
    }

    if (createError) {
      console.error('Erreur création auth:', createError.message || createError);
      return res.status(400).json({ error: 'Impossible de créer le compte gérant' });
    }

    newUserId = authUser.user.id;

    // 3. Mettre à jour le profil SQL associé (pour le cas où l'auth user a bien été créé)
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
      return res.status(500).json({ error: `Erreur profils: ${updateError.message}` });
    }

    return res.json({ 
      success: true, 
      user: updatedProfile,
      tempPassword
    });

  } catch (error) {
    console.error("Erreur create-gerant:", error);
    return res.status(500).json({ error: error.message || 'Erreur interne du serveur' });
  }
});

// Auto-sync admin user at startup
const autoSyncAdmin = async () => {
  const targetEmail = process.env.ADMIN_EMAIL;
  const targetPassword = process.env.ADMIN_PASSWORD;

  if (!targetEmail || !targetPassword) {
    console.warn('[Auto-Sync] ADMIN_EMAIL / ADMIN_PASSWORD non configurés, skip.');
    return;
  }

  try {
    console.log(`[Auto-Sync] Verification du compte admin: ${targetEmail}`);

    // Check profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', targetEmail)
      .maybeSingle();

    if (profileError) {
      console.error('[Auto-Sync] Erreur profiles:', profileError.message);
      return;
    }

    // List auth users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('[Auto-Sync] Erreur list auth users:', listError.message);
      return;
    }

    const authUser = users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());

    if (authUser) {
      console.log(`[Auto-Sync] Utilisateur auth trouve: ${authUser.id}`);
      // Sync password
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: targetPassword
      });
      if (updateError) {
        console.error('[Auto-Sync] Erreur update password:', updateError.message);
      } else {
        console.log('[Auto-Sync] Mot de passe admin synchronise.');
      }

      // Check profile sync
      if (profile) {
        if (profile.id !== authUser.id) {
          console.warn('[Auto-Sync] UUID Mismatch! Correction du profil...');
          await supabase.from('profiles').delete().eq('id', profile.id);
          await supabase.from('profiles').upsert({
            id: authUser.id,
            nom: profile.nom,
            email: profile.email,
            role: 'admin',
            statut: 'actif'
          });
          console.log('[Auto-Sync] Profil synchronise avec auth UUID.');
        } else if (profile.role !== 'admin' || profile.statut !== 'actif') {
          await supabase.from('profiles').update({ role: 'admin', statut: 'actif' }).eq('id', profile.id);
          console.log('[Auto-Sync] Profil mis a jour (admin, actif).');
        }
      } else {
        await supabase.from('profiles').insert({
          id: authUser.id,
          nom: authUser.user_metadata?.nom || 'Cedric Benoit Dieme',
          email: targetEmail,
          role: 'admin',
          statut: 'actif'
        });
        console.log('[Auto-Sync] Profil cree pour l\'utilisateur auth existant.');
      }
    } else {
      console.log('[Auto-Sync] Utilisateur auth non trouve. Creation...');

      if (profile) {
        console.log(`[Auto-Sync] Suppression du profil temporaire pour recreation propre: ${profile.id}`);
        const { error: deleteError } = await supabase.from('profiles').delete().eq('id', profile.id);
        if (deleteError) {
          console.error('[Auto-Sync] Erreur suppression profil:', deleteError.message);
        }
      }

      const uid = profile?.id || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: targetEmail,
        password: targetPassword,
        email_confirm: true,
        user_metadata: {
          nom: profile?.nom || 'Cedric Benoit Dieme',
          role: 'admin'
        }
      });

      if (createError) {
        console.error('[Auto-Sync] Erreur creation auth user:', JSON.stringify(createError, null, 2));
      } else {
        console.log('[Auto-Sync] Utilisateur auth cree avec succes!');
        // Ensure the profile is marked as admin and active (the trigger creates it but role defaults to joueur)
        await supabase.from('profiles').update({ role: 'admin', statut: 'actif' }).eq('id', newUser.user.id);
        console.log('[Auto-Sync] Profil mis a jour (admin, actif).');
      }
    }
  } catch (err) {
    console.error('[Auto-Sync] Erreur critique:', err);
  }
};

const unitechApiKey = process.env.UNITECH_API_KEY;
// Doc officielle UnitechPay : "Votre clé API est utilisée comme secret de
// signature" — le HMAC des webhooks se calcule avec la clé API elle-même,
// pas un secret dédié séparé. UNITECH_WEBHOOK_SECRET reste supporté comme
// override explicite si UnitechPay confirme un jour un secret distinct
// pour ce compte marchand, mais le défaut suit la doc.
const unitechWebhookSecret = process.env.UNITECH_WEBHOOK_SECRET || unitechApiKey;

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
        checkout_url: `http://localhost:${PORT}/api/payment/unitech/mock-redirect?paiement_id=${paiement_id}&montant=${finalMontant}`
      });
    }

    const url = `https://api.unitech.sn/api.php?action=${action}`;
    let cleanedPhone;
    try {
      cleanedPhone = normalizeSenegalPhone(numero_tel);
    } catch (phoneErr) {
      return res.status(400).json({ error: phoneErr.message });
    }
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
        // Le compte marchand UnitechPay n'a qu'UNE SEULE URL de webhook,
        // configurée dans leur dashboard vers webhook-unitech (voir
        // supabase/functions/webhook-unitech/index.ts) — renseigné ici
        // aussi par cohérence, au cas où un override par-requête est honoré.
        webhook_url: `${supabaseUrl}/functions/v1/webhook-unitech`
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
      checkout_url: realUrl || `http://localhost:${PORT}/api/payment/unitech/mock-redirect?paiement_id=${paiement_id}&montant=${finalMontant}`
    });

  } catch (error) {
    console.error('[UnitechPay] Erreur initiation:', error);
    return res.status(500).json({ error: 'Impossible d\'initier le paiement' });
  }
});

// Webhook Pay Unitech
app.post('/api/payment/unitech/webhook', async (req, res) => {
  const { reference, status } = req.body;
  // Doc UnitechPay : signature envoyée dans l'en-tête x-unitechpay-signature.
  const signature = req.headers['x-unitechpay-signature'] || req.body.signature;

  try {
    console.log('[UnitechPay Webhook] Payload reçu:', JSON.stringify(req.body));

    if (reference && reference.startsWith('mock-')) {
      console.log(`[UnitechPay Webhook] Simulation de succès reçue pour le paiement mock ${reference}.`);
      return res.json({ success: true, message: 'Simulation de démo traitée avec succès' });
    }

    // Fail-closed : contrairement au comportement précédent (vérification
    // ignorée silencieusement si le secret n'était pas configuré, ET
    // entièrement contournée pour toute référence 'PS-' puisque cette
    // branche renvoyait avant même d'atteindre le check de signature plus
    // bas), un webhook non signé ou mal configuré est désormais TOUJOURS
    // rejeté, y compris pour les références PS-.
    if (!unitechWebhookSecret) {
      console.error('[UnitechPay Webhook] UNITECH_WEBHOOK_SECRET non configuré — requête rejetée');
      return res.status(500).json({ error: 'Webhook non configuré' });
    }
    if (!signature) {
      console.warn('[UnitechPay Webhook] Signature manquante');
      return res.status(401).json({ error: 'Signature manquante' });
    }
    {
      // HMAC calculé sur le corps BRUT (req.rawBody, capturé par le
      // verify() de express.json() plus haut) — pas sur un objet JS
      // reconstruit après parsing.
      const computedSignature = crypto
        .createHmac('sha256', unitechWebhookSecret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');
      if (computedSignature !== signature) {
        console.error('[UnitechPay Webhook] Signature invalide');
        return res.status(401).json({ error: 'Signature invalide' });
      }
    }

    if (reference && reference.startsWith('PS-')) {
      console.log(`[UnitechPay Webhook] Simulation de succès reçue pour le paiement PS ${reference}`);

      const { data: existingPaiement } = await supabase
        .from('paiements')
        .select('id, reservation_id, statut')
        .eq('ref_externe', reference)
        .maybeSingle();

      // Idempotence : ne transitionner que depuis 'en_attente'. Un rejeu
      // (retry provider) ou un succès tardif reçu après un remboursement/
      // annulation manuel ne doit jamais re-déclencher une confirmation.
      if (!existingPaiement || existingPaiement.statut !== 'en_attente') {
        console.log(`[Webhook] Paiement pour ${reference} introuvable ou déjà traité (statut='${existingPaiement?.statut}') — rejeu ignoré`);
        return res.json({ success: true, message: 'Déjà traité (idempotence)' });
      }

      const statutMap = { 'success': 'valide', 'failed': 'echoue', 'cancelled': 'echoue' };
      const newStatut = statutMap[status] || 'echoue';

      // .eq('statut', 'en_attente') protège aussi contre une course entre
      // deux appels concurrents de ce webhook pour la même référence.
      const { data: updatedPaiement, error: updatePaymentErr } = await supabase
        .from('paiements')
        .update({ statut: newStatut })
        .eq('id', existingPaiement.id)
        .eq('statut', 'en_attente')
        .select('id');

      if (updatePaymentErr) {
        console.error('[Webhook] Erreur mise à jour paiement:', updatePaymentErr);
      }

      if (newStatut === 'valide' && existingPaiement.reservation_id && updatedPaiement?.length > 0) {
        await supabase
          .from('reservations')
          .update({ statut: 'confirmee' })
          .eq('id', existingPaiement.reservation_id);
        console.log(`[Webhook] Réservation ${existingPaiement.reservation_id} confirmée.`);
      }

      return res.json({ success: true, message: 'Simulation PS traitée' });
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

// Settings Endpoints
app.get('/api/settings', async (req, res) => {
  await loadSettings();
  res.json({
    modeMaintenance,
    commissionPlateforme
  });
});

app.post('/api/settings', authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    
    // Only allow admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();
      
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accès interdit. Administrateur requis.' });
    }

    if (key === 'mode_maintenance') {
      const valBool = value === true || value === 'true';
      const { error } = await supabase.from('system_settings').upsert({ key: 'mode_maintenance', value: valBool });
      if (error) throw error;
      modeMaintenance = valBool;
    } else if (key === 'commission_plateforme') {
      const valNum = parseFloat(value) || 10;
      const { error } = await supabase.from('system_settings').upsert({ key: 'commission_plateforme', value: valNum });
      if (error) throw error;
      commissionPlateforme = valNum;
    } else {
      return res.status(400).json({ error: 'Clé invalide' });
    }
    
    res.json({ success: true, modeMaintenance, commissionPlateforme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to generate weekly PDF report
app.get('/api/reports/weekly', async (req, res) => {
  try {
    await loadSettings();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch count of reservations
    const { count: resCount } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneWeekAgo.toISOString())
      .in('statut', ['confirmee', 'terminee']);

    // Fetch revenue sum
    const { data: reservations } = await supabase
      .from('reservations')
      .select('montant')
      .gte('created_at', oneWeekAgo.toISOString())
      .in('statut', ['confirmee', 'terminee']);

    const totalRevenue = (reservations || []).reduce((sum, r) => sum + (r.montant || 0), 0);
    const comm = Math.round(totalRevenue * (commissionPlateforme / 100));

    // Create jsPDF instance
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(15, 35, 24); // Primary dark color
    doc.text("PlaygroundSpot", 20, 25);

    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("RAPPORT HEBDOMADAIRE D'ACTIVITE", 20, 33);
    doc.text(`Genere le : ${now.toLocaleDateString('fr-FR')}`, 20, 40);

    // Draw divider line
    doc.setDrawColor(26, 122, 74); // Primary green color
    doc.setLineWidth(1);
    doc.line(20, 45, 190, 45);

    // Section header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 35, 24);
    doc.text("Statistiques Generales", 20, 60);

    // General Stats details
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    doc.text(`Nombre total de reservations : ${resCount || 0}`, 20, 70);
    doc.text(`Revenus generes : ${totalRevenue.toLocaleString('fr-FR')} FCFA`, 20, 80);
    doc.text(`Commission plateforme (${commissionPlateforme}%) : ${comm.toLocaleString('fr-FR')} FCFA`, 20, 90);

    // Footer notice
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("Document genere automatiquement par PlaygroundSpot. Tous droits reserves.", 20, 280);

    // Output PDF as Buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Rapport_Hebdomadaire_${now.toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating PDF report:", err);
    res.status(500).json({ error: 'Erreur lors de la generation du rapport PDF' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API démarré sur http://localhost:${PORT}`);
  autoSyncAdmin();
});
