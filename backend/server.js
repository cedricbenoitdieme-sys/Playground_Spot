import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Admin Client (besoin de la service_role pour bypass RLS et écrire dans scan_logs,
// ou simplement pour lire toutes les réservations sans limite)
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

  try {
    // 1. Cherche le token dans reservations
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(`
        *,
        terrains ( nom, quartier ),
        profiles!joueur_id ( nom )
      `)
      .eq('qr_token', token)
      .single();

    if (error || !reservation) {
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
      nbJoueurs: 10, // Valeur mockée ou stockée en DB, à ajuster si stocké
      montant: `${reservation.montant.toLocaleString('fr-FR')} FCFA`
    };

    // 2. Si réservation annulée
    if (reservation.statut === 'annulee') {
      await logScan(token, ip, 'annule', scannerId);
      return res.json({ statut: 'annule', ...responseData, scanAt: null });
    }

    // 3. Si scan_at non null -> déjà utilisé
    if (reservation.scan_at) {
      await logScan(token, ip, 'utilise', scannerId);
      return res.json({ 
        statut: 'utilise', 
        ...responseData, 
        scanAt: formatScanAt(reservation.scan_at) 
      });
    }

    // 4. Si tout est OK (statut confirme ou attente)
    const now = new Date().toISOString();
    
    // Met à jour scan_at
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ scan_at: now })
      .eq('id', reservation.id);

    if (updateError) {
      console.error("Erreur update scan_at:", updateError);
      return res.status(500).json({ error: "Erreur lors de la validation du ticket" });
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

app.listen(PORT, () => {
  console.log(`Backend API démarré sur http://localhost:${PORT}`);
});
