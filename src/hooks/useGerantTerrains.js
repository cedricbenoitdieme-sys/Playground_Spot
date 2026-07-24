import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { handleServiceError } from '../lib/errorHandler';

/**
 * SOURCE DE VÉRITÉ UNIQUE pour "les terrains d'un gérant" côté front.
 *
 * N'écris JAMAIS une nouvelle requête `.from('terrains').eq('gerant_id', ...)`
 * ou pire, un fetch via `gerant_terrains` (table de jonction héritée,
 * jamais synchronisée, cause du bug "0 terrain" corrigé le 2026-07-24
 * — voir supabase/migrations/20260724110000 et 20260724120000).
 * Utilise CE hook pour un seul gérant. Pour une liste de PLUSIEURS
 * gérants à la fois (ex. page admin "Gestion des Gérants"), interroge
 * directement la vue `v_gerant_terrains` en une seule requête — ne
 * boucle jamais ce hook sur une liste (N+1 requêtes).
 *
 * @param {string} gerantId
 * @returns {{ terrains: object[], terrainCount: number, loading: boolean, error: string|null, refetch: () => void }}
 */
export const useGerantTerrains = (gerantId) => {
  const [terrains, setTerrains] = useState([]);
  const [terrainCount, setTerrainCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!gerantId) {
      setTerrains([]);
      setTerrainCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_gerant_terrains', { p_gerant_id: gerantId });
      if (rpcError) throw rpcError;
      setTerrains(data?.terrains || []);
      setTerrainCount(data?.terrain_count || 0);
    } catch (err) {
      setError(handleServiceError(err, 'useGerantTerrains').userMessage);
      setTerrains([]);
      setTerrainCount(0);
    } finally {
      setLoading(false);
    }
  }, [gerantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { terrains, terrainCount, loading, error, refetch: fetchData };
};
