import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { validatePhone } from '../lib/validators';
import { 
  createRedirectPlan, 
  executeRedirect 
} from '../lib/paymentRedirect';

const SESSION_STORAGE_KEY = 'playground_payment_flow_session';
const POLLING_INTERVAL_MS = 3000; // 3 secondes
const MAX_POLLING_DURATION_MS = 5 * 60 * 1000; // 5 minutes (300 000 ms)

export function usePaymentFlow() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  const [paymentKind, setPaymentKind] = useState('subscription');

  const pollTimerRef = useRef(null);
  const channelRef = useRef(null);
  const startTimeRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const clearSession = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem('pending_subscription_id');
      sessionStorage.removeItem('pending_boost_id');
    } catch (_) {}
  }, []);

  /**
   * Vérification directe en base de données (pas de RPC inexistante)
   */
  const checkDirectDbStatus = useCallback(async (targetId, kind) => {
    if (!targetId) return;

    try {
      if (kind === 'subscription') {
        const { data, error: dbErr } = await supabase
          .from('subscriptions')
          .select('id, status')
          .eq('id', targetId)
          .single();

        if (dbErr) return;
        if (data?.status === 'active') {
          stopPolling();
          clearSession();
          setStatus('completed');
          setError(null);
        } else if (data?.status === 'revoked') {
          stopPolling();
          clearSession();
          setStatus('failed');
          setError('Votre abonnement a été annulé.');
        }
      } else if (kind === 'campaign') {
        const { data, error: dbErr } = await supabase
          .from('visibility_boosts')
          .select('id, statut')
          .eq('id', targetId)
          .single();

        if (dbErr) return;
        if (data?.statut === 'actif') {
          stopPolling();
          clearSession();
          setStatus('completed');
          setError(null);
        } else if (data?.statut === 'annule') {
          stopPolling();
          clearSession();
          setStatus('failed');
          setError('Le boost de visibilité a été annulé.');
        }
      }
    } catch (err) {
      console.error('Erreur relecture directe DB:', err);
    }
  }, [stopPolling, clearSession]);

  /**
   * Démarre la vérification directe DB + abonnement Realtime
   */
  const startMonitoring = useCallback((targetId, kind = 'subscription', customPlan = null) => {
    if (!targetId) return;

    setPaymentId(targetId);
    setPaymentKind(kind);
    if (customPlan) setPlan(customPlan);

    stopPolling();
    startTimeRef.current = Date.now();

    // 1. Lecture directe DB initiale
    checkDirectDbStatus(targetId, kind);

    // 2. Abonnement Realtime Supabase
    const tableName = kind === 'subscription' ? 'subscriptions' : 'visibility_boosts';
    const channelName = `${kind}-${targetId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tableName,
          filter: `id=eq.${targetId}`,
        },
        ({ new: record }) => {
          if (!record) return;
          if (kind === 'subscription') {
            if (record.status === 'active') {
              stopPolling();
              clearSession();
              setStatus('completed');
              setError(null);
            } else if (record.status === 'revoked') {
              stopPolling();
              clearSession();
              setStatus('failed');
              setError('Votre abonnement a été annulé.');
            }
          } else if (kind === 'campaign') {
            if (record.statut === 'actif') {
              stopPolling();
              clearSession();
              setStatus('completed');
              setError(null);
            } else if (record.statut === 'annule') {
              stopPolling();
              clearSession();
              setStatus('failed');
              setError('Le boost de visibilité a été annulé.');
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // 3. Polling de sécurité toutes les 3s + Timeout 5 min
    pollTimerRef.current = setInterval(async () => {
      const elapsed = Date.now() - (startTimeRef.current || Date.now());

      if (elapsed >= MAX_POLLING_DURATION_MS) {
        stopPolling();
        clearSession();
        setStatus('timeout');
        setError('Paiement non confirmé après 5 minutes.');
        return;
      }

      await checkDirectDbStatus(targetId, kind);
    }, POLLING_INTERVAL_MS);
  }, [stopPolling, clearSession, checkDirectDbStatus]);

  /**
   * Restauration de session et écouteurs de reprise (visibilitychange, pageshow, focus)
   */
  useEffect(() => {
    try {
      const savedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        const elapsed = Date.now() - (saved.timestamp || 0);

        if (elapsed < MAX_POLLING_DURATION_MS && saved.paymentId) {
          setPaymentId(saved.paymentId);
          setPaymentKind(saved.kind);
          setPlan(saved.plan);
          setStatus('waiting');
          startMonitoring(saved.paymentId, saved.kind, saved.plan);
        } else {
          clearSession();
        }
      }
    } catch (_) {}

    const handleAppResume = () => {
      if (document.visibilityState === 'visible' && paymentId) {
        checkDirectDbStatus(paymentId, paymentKind);
      }
    };

    const handleFocus = () => {
      if (paymentId) {
        checkDirectDbStatus(paymentId, paymentKind);
      }
    };

    document.addEventListener('visibilitychange', handleAppResume);
    window.addEventListener('pageshow', handleAppResume);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleAppResume);
      window.removeEventListener('pageshow', handleAppResume);
      window.removeEventListener('focus', handleFocus);
      stopPolling();
    };
  }, [paymentId, paymentKind, checkDirectDbStatus, startMonitoring, clearSession, stopPolling]);

  /**
   * Lancement du flux de paiement (avec vérification et refresh préventif JWT)
   */
  const start = async (params) => {
    setError(null);
    setStatus('creating');

    const isOrangeMoney = params.payment_method === 'orange_money';

    // Validation préalable du numéro de téléphone
    const phoneCheck = validatePhone(params.customer_number || '', isOrangeMoney, isOrangeMoney);
    if (!phoneCheck.valid) {
      setStatus('failed');
      setError(phoneCheck.error || 'Numéro de téléphone invalide');
      return { success: false, error: phoneCheck.error };
    }

    try {
      // ── 1. Vérification et rafraîchissement préventif de la session JWT ──
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData?.session;

      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresAt = session?.expires_at || 0;
      const isExpiredOrExpiringSoon = !session || !session.access_token || (expiresAt - nowSeconds < 60);

      if (isExpiredOrExpiringSoon) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData?.session?.access_token) {
          throw new Error('Votre session a expiré, veuillez vous reconnecter.');
        }
        session = refreshData.session;
      }

      if (!session?.access_token) {
        throw new Error('Vous devez être connecté pour initier une transaction.');
      }

      // ── 2. Construction du body d'appel Edge Function ──
      let body = {};
      const customerNum = phoneCheck.sanitized || params.customer_number?.trim() || '';

      if (params.kind === 'subscription' || params.plan) {
        const period = params.billing_period || (params.cycle === 'annuel' ? 'annual' : 'monthly');
        body = {
          plan: params.plan,
          billing_period: period,
          payment_method: params.payment_method,
          customer_number: customerNum,
        };
      } else if (params.kind === 'campaign' || params.terrain_id) {
        body = {
          payment_type: 'boost',
          terrain_id: params.terrain_id,
          budget_fcfa: Number(params.budget_fcfa || params.budget),
          duree_jours: Number(params.duree_jours || params.duration_days),
          payment_method: params.payment_method,
          customer_number: customerNum,
        };
      } else {
        body = {
          creneau_id: params.creneau_id,
          methode: params.payment_method,
          telephone: customerNum,
        };
      }

      // ── 3. Invocation de l'Edge Function create-payment ──
      const { data, error: invokeError } = await supabase.functions.invoke('create-payment', {
        body,
      });

      if (invokeError) {
        const errMsg = String(invokeError.message || '').toLowerCase();
        const errContext = String(invokeError.context || '').toLowerCase();
        const status = invokeError.status;

        if (
          status === 401 ||
          errMsg.includes('jwt') ||
          errMsg.includes('unauthorized') ||
          errMsg.includes('expired') ||
          errContext.includes('jwt') ||
          errContext.includes('unauthorized')
        ) {
          throw new Error('Votre session a expiré, veuillez vous reconnecter.');
        }

        if (status === 403 || errMsg.includes('403')) {
          throw new Error('Ce module nécessite un abonnement Starter ou supérieur.');
        }
        throw new Error(invokeError.message || 'Impossible d\'initialiser le paiement.');
      }

      if (data?.error) {
        const errStr = String(data.error).toLowerCase();
        if (
          errStr.includes('jwt') ||
          errStr.includes('unauthorized') ||
          errStr.includes('expired') ||
          errStr.includes('session')
        ) {
          throw new Error('Votre session a expiré, veuillez vous reconnecter.');
        }

        if (errStr.includes('403') || errStr.includes('starter') || errStr.includes('plan')) {
          throw new Error('Ce module nécessite un abonnement Starter ou supérieur.');
        }
        throw new Error(data.error);
      }

      const computedPlan = createRedirectPlan(data);
      
      const returnedPaymentId = 
        data?.subscription_id || 
        data?.boost_id || 
        data?.reservation_id || 
        data?.payment_id || 
        data?.id;

      if (!returnedPaymentId && !computedPlan.targetUrl && !computedPlan.stayOnPage) {
        throw new Error('Aucune URL de paiement disponible et aucun identifiant retourné par le serveur.');
      }

      setPlan(computedPlan);
      if (returnedPaymentId) {
        setPaymentId(returnedPaymentId);
        setPaymentKind(params.kind);
      }

      if (returnedPaymentId) {
        try {
          const sessionPayload = {
            paymentId: returnedPaymentId,
            kind: params.kind,
            plan: computedPlan,
            timestamp: Date.now(),
          };
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionPayload));
          if (params.kind === 'subscription') {
            sessionStorage.setItem('pending_subscription_id', returnedPaymentId);
          } else if (params.kind === 'campaign') {
            sessionStorage.setItem('pending_boost_id', returnedPaymentId);
          }
        } catch (_) {}
      }

      if (computedPlan.stayOnPage) {
        setStatus('waiting');
        if (returnedPaymentId) {
          startMonitoring(returnedPaymentId, params.kind, computedPlan);
        }
        return { success: true, plan: computedPlan };
      }

      if (computedPlan.targetUrl) {
        setStatus('redirecting');
        if (returnedPaymentId) {
          startMonitoring(returnedPaymentId, params.kind, computedPlan);
        }
        executeRedirect(computedPlan.targetUrl);
        return { success: true, plan: computedPlan };
      }

      setStatus('waiting');
      if (returnedPaymentId) {
        startMonitoring(returnedPaymentId, params.kind, computedPlan);
      }

      return { success: true, plan: computedPlan };
    } catch (err) {
      stopPolling();
      clearSession();
      setStatus('failed');
      const msg = err?.message || 'Échec de l\'initialisation du paiement.';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  /**
   * Réinitialisation
   */
  const reset = useCallback(() => {
    stopPolling();
    clearSession();
    setStatus('idle');
    setError(null);
    setPlan(null);
    setPaymentId(null);
  }, [stopPolling, clearSession]);

  return {
    status,
    error,
    plan,
    paymentId,
    paymentKind,
    start,
    reset,
    startMonitoring,
    startPolling: (id, kind = 'subscription') => startMonitoring(id, kind),
  };
}
