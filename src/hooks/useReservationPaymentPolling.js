import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook de sondage (polling) du statut d'un paiement de réservation.
 * - Interroge la RPC Supabase `get_reservation_payment_status`
 * - Sonde toutes les 4 secondes
 * - Max 15 minutes (225 tentatives)
 */
export const useReservationPaymentPolling = () => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'polling' | 'success' | 'failed' | 'timeout'
  const [error, setError] = useState(null);
  const [reservationData, setReservationData] = useState(null);
  const timerRef = useRef(null);
  const maxAttempts = 225; // 15 min à 4s — même cadence que les abonnements/boosts
  const intervalMs = 4000;

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async (reference) => {
    if (!reference) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('get_reservation_payment_status', { p_reference: reference });
      if (rpcError) {
        console.error('Erreur RPC get_reservation_payment_status:', rpcError);
        return;
      }
      if (!data) return;

      setReservationData(data);

      if (data.statut_paiement === 'valide') {
        setStatus('success');
        stopPolling();
      } else if (data.statut_paiement === 'echoue' || data.statut_paiement === 'expire') {
        setStatus('failed');
        setError(data.statut_paiement === 'expire' ? 'Le paiement a expiré (délai dépassé).' : 'Le paiement a été refusé.');
        stopPolling();
      }
    } catch (err) {
      console.error('Erreur lors du polling du statut de réservation:', err);
    }
  }, [stopPolling]);

  const startPolling = useCallback((reference) => {
    if (!reference) return;
    stopPolling();
    setStatus('polling');
    setError(null);
    checkStatus(reference);
    let count = 0;
    timerRef.current = setInterval(() => {
      count += 1;
      if (count >= maxAttempts) {
        setStatus('timeout');
        setError("Temps d'attente dépassé (15 min). Vérifiez vos SMS de confirmation ou contactez le support.");
        stopPolling();
        return;
      }
      checkStatus(reference);
    }, intervalMs);
  }, [checkStatus, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { status, error, reservationData, startPolling, stopPolling };
};
