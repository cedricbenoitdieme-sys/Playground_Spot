import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchBoostStatus } from '../services/subscriptions';

export const useBoostPaymentPolling = () => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'polling' | 'success' | 'failed' | 'timeout'
  const [boostData, setBoostData] = useState(null);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const maxAttempts = 225; // 15 min à 4s d'intervalle, même cadence que les abonnements
  const intervalMs = 4000;

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async (boostId) => {
    const data = await fetchBoostStatus(boostId);
    if (!data) return;
    setBoostData(data);
    if (data.statut === 'actif') {
      setStatus('success');
      stopPolling();
    } else if (data.statut === 'annule') {
      setStatus('failed');
      setError('Le paiement a été refusé ou annulé.');
      stopPolling();
    }
  }, [stopPolling]);

  const startPolling = useCallback((boostId) => {
    stopPolling();
    setStatus('polling');
    setError(null);
    checkStatus(boostId);
    let count = 0;
    timerRef.current = setInterval(() => {
      count += 1;
      if (count >= maxAttempts) {
        setStatus('timeout');
        setError("Temps d'attente dépassé (15 min). Vérifiez vos SMS ou contactez le support.");
        stopPolling();
        return;
      }
      checkStatus(boostId);
    }, intervalMs);
  }, [checkStatus, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { status, boostData, error, startPolling, stopPolling };
};
