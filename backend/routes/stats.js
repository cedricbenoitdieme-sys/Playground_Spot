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
 * GET /api/stats/plateforme
 * Statistiques publiques agrégées (joueurs, terrains, satisfaction) pour le
 * ruban de la landing page. Lecture seule du cache public.stats_plateforme_cache
 * (migration 20260725120000_stats_plateforme.sql), recalculé mensuellement
 * par un cron — jamais de calcul à la volée sur cette route.
 * `taux_satisfaction` peut être `null` (pas assez d'avis en base pour un
 * chiffre fiable) : au frontend de décider de l'affichage neutre.
 */
router.get('/plateforme', async (req, res) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from('stats_plateforme_cache')
      .select('nombre_joueurs, nombre_terrains, taux_satisfaction, nombre_avis, updated_at')
      .eq('id', true)
      .maybeSingle();

    if (error) {
      console.error('Erreur stats_plateforme_cache:', error);
      return res.status(500).json({ error: 'Impossible de charger les statistiques' });
    }

    return res.json(data || {
      nombre_joueurs: 0,
      nombre_terrains: 0,
      taux_satisfaction: null,
      nombre_avis: 0,
      updated_at: null,
    });
  } catch (error) {
    console.error('Erreur /api/stats/plateforme:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

export default router;
