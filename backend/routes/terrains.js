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

// Client scopé sur le JWT de l'appelant : nécessaire pour que auth.uid()
// à l'intérieur de update_terrain_location() (SECURITY DEFINER) reflète le
// vrai gérant appelant, pas le service_role (même pattern que
// getCallerSupabase dans routes/admin.js).
const getCallerSupabase = (token) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Variables d'environnement Supabase manquantes");
  }
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
};

/**
 * GET /api/terrains/populaires?limit=20
 * Classement public : boost de visibilité actif (dégressif dans le temps)
 * en premier, puis note moyenne, puis réservations des 30 derniers jours.
 * Public, sans authentification — délègue tout le filtrage (statut actif +
 * validé admin) à la RPC public.get_terrains_populaires (migration
 * 20260725110000_terrains_populaires.sql), qui reproduit exactement les
 * mêmes critères que la policy RLS "terrains_select_all".
 */
router.get('/populaires', async (req, res) => {
  const supabase = getSupabase();
  try {
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;

    const { data, error } = await supabase.rpc('get_terrains_populaires', { p_limit: limit });

    if (error) {
      console.error('Erreur get_terrains_populaires:', error);
      return res.status(500).json({ error: 'Impossible de charger les terrains populaires' });
    }

    return res.json({ terrains: data || [] });
  } catch (error) {
    console.error('Erreur /api/terrains/populaires:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

/**
 * PATCH /api/terrains/:id/location
 * Body: { lat: number, lng: number }
 * Enregistre la position (géolocalisation navigateur "ma position" ou
 * point choisi sur la carte Leaflet par le gérant) d'un terrain. Auth
 * requise (gérant propriétaire ou admin) — l'autorisation réelle est
 * vérifiée dans la RPC public.update_terrain_location (migration
 * 20260725150000_terrains_postgis_geolocation.sql), cette route ne fait
 * que valider le token et relayer l'appel avec le bon contexte auth.uid().
 */
router.patch('/:id/location', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token d\'authentification manquant ou invalide' });
  }
  const token = authHeader.split(' ')[1];

  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat et lng (nombres) requis' });
  }

  try {
    const supabase = getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const callerSupabase = getCallerSupabase(token);
    const { data, error } = await callerSupabase.rpc('update_terrain_location', {
      p_terrain_id: req.params.id,
      p_lat: lat,
      p_lng: lng,
    });

    if (error) {
      console.error('Erreur update_terrain_location:', error);
      const status = error.message?.includes('Accès refusé') ? 403
        : error.message?.includes('introuvable') ? 404
        : error.message?.includes('bornes') || error.message?.includes('requises') ? 400
        : 500;
      return res.status(status).json({ error: error.message || 'Impossible de mettre à jour la position' });
    }

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/terrains/:id/location:', error);
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

export default router;
