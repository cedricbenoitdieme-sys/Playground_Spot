import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Lazy loaded Supabase Client helper to prevent ESM import timing issues
const getSupabase = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variables d'environnement Supabase manquantes");
  }
  return createClient(supabaseUrl, supabaseKey);
};

/**
 * GET /api/reservations/verify?token=[qr_token]
 * Vérifie l'authenticité d'un ticket par son token unique
 */
router.get('/verify', async (req, res) => {
  const supabase = getSupabase();
  try {
    const { token } = req.query;

    // 2. Si token absent
    if (!token) {
      return res.status(400).json({ valid: false, reason: 'Token manquant' });
    }

    // 3. SELECT dans reservations avec jointures terrains et profiles
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(`
        date_slot,
        heure_slot,
        terrains ( nom ),
        profiles!joueur_id ( nom, tel )
      `)
      .eq('qr_token', token)
      .maybeSingle();

    if (error) {
      console.error('Erreur Supabase verify:', error);
      return res.status(500).json({ valid: false, reason: 'Erreur base de données' });
    }

    // 4. Si aucun résultat
    if (!reservation) {
      return res.status(404).json({ valid: false, reason: 'QR invalide' });
    }

    // 5. Si trouvé
    return res.status(200).json({
      valid: true,
      terrain: reservation.terrains?.nom || 'Terrain Inconnu',
      date: reservation.date_slot,
      heure: reservation.heure_slot ? reservation.heure_slot.slice(0, 5) : '--:--',
      joueur: reservation.profiles?.nom || 'Joueur Inconnu',
      phone: reservation.profiles?.tel || 'Non renseigné'
    });

  } catch (error) {
    console.error('Erreur lors de la vérification du ticket:', error);
    return res.status(500).json({ valid: false, reason: 'Erreur interne du serveur' });
  }
});

export default router;
