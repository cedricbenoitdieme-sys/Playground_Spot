import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchSubscriptionStatus } from '../services/subscriptions';

/**
 * Hook de sondage (polling) du statut d'un paiement / d'un abonnement.
 * - Sonde toutes les 4 secondes
 * - 15 minutes max (225 tentatives)
 */
export const usePaymentPolling = () => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'polling' | 'success' | 'failed' | 'timeout'
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [error, setError] = useState(null);
  const [attempts, setAttempts] = useState(0);

  const timerRef = useRef(null);
  const subscriptionIdRef = useRef(null);
  const maxAttempts = 225; // 225 * 4s = 900s = 15 minutes
  const intervalMs = 4000;

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async (subId) => {
    try {
      const data = await fetchSubscriptionStatus(subId);
      if (!data) return;

      setSubscriptionData(data);

      if (data.status === 'active') {
        setStatus('success');
        stopPolling();
      } else if (data.status === 'revoked' || data.status === 'expired') {
        setStatus('failed');
        setError('Le paiement ou la souscription a été refusé(e) ou annulé(e).');
        stopPolling();
      }
    } catch (err) {
      console.error('Erreur lors du polling d\'abonnement:', err);
    }
  }, [stopPolling]);

  const startPolling = useCallback((subId) => {
    if (!subId) return;

    stopPolling();
    subscriptionIdRef.current = subId;
    setStatus('polling');
    setError(null);
    setAttempts(0);

    // Premier check immédiat
    checkStatus(subId);

    let count = 0;
    timerRef.current = setInterval(() => {
      count += 1;
      setAttempts(count);

      if (count >= maxAttempts) {
        setStatus('timeout');
        setError('Temps d\'attente dépassé (15 min). Veuillez vérifier vos SMS ou contacter le support.');
        stopPolling();
        return;
      }

      checkStatus(subId);
    }, intervalMs);
  }, [checkStatus, stopPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    subscriptionData,
    error,
    attempts,
    maxAttempts,
    startPolling,
    stopPolling,
  };
};
