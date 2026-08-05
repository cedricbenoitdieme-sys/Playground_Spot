import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import verifyRouter from '../backend/routes/verify.js';
import terrainsRouter from '../backend/routes/terrains.js';
import statsRouter from '../backend/routes/stats.js';

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

// Paiements : UnitechPay (webhook Express /api/webhooks/unitech + route
// /api/payments) retiré — remplacé par SenePay via les Edge Functions
// supabase/functions/senepay-initiate, senepay-webhook, senepay-payout-webhook,
// qui gèrent directement les 3 flux (abonnement/boost/réservation) sans
// intermédiaire Express. req.rawBody n'est donc plus nécessaire.
app.use(express.json());

// Routes
app.use('/api/reservations', verifyRouter);
app.use('/api/terrains', terrainsRouter);
app.use('/api/stats', statsRouter);

// Supabase Admin Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERREUR FATALE: Variables d'environnement Supabase manquantes");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Rate limiting : 30 requêtes/minute/IP (anti brute-force sur le scan QR).
// Persisté en base via la RPC check_rate_limit (même pattern que
// create-payment/chatbot-query) plutôt qu'un store express-rate-limit en
// mémoire, qui se réinitialise à chaque cold start sur Vercel serverless
// et ne protège donc rien en pratique.
const verifyLimiter = async (req, res, next) => {
  const identifier = String(req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress);
  const { data: allowed, error } = await supabase.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_action: 'verify_ticket',
    p_max_attempts: 30,
    p_window: '1 minute',
  });

  if (error) {
    console.error('check_rate_limit indisponible:', error.message);
  } else if (allowed === false) {
    return res.status(429).json({ error: 'Trop de requêtes. Veuillez réessayer plus tard.' });
  }

  next();
};

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

// Paiements réservation joueur : UnitechPay retiré (routes
// /api/payment/unitech/initiate, /webhook, /mock-redirect) — remplacé par
// SenePay via les Edge Functions senepay-initiate/senepay-webhook, qui
// gèrent directement les 3 flux (abonnement/boost/réservation) sans
// intermédiaire Express.

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
