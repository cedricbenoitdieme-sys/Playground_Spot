import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { validatePhone } from '../lib/validators';
import { 
  createRedirectPlan, 
  executeRedirect, 
  RedirectPlan, 
  UnitechPaymentResponse 
} from '../lib/paymentRedirect';

export type PaymentFlowStatus = 
  | 'idle' 
  | 'creating' 
  | 'redirecting' 
  | 'waiting' 
  | 'completed' 
  | 'failed' 
  | 'timeout';

export interface PaymentParams {
  kind: 'subscription' | 'campaign' | 'reservation';
  plan?: string;                         // 'starter' | 'pro' | 'entreprise'
  billing_period?: 'monthly' | 'annual'; // 'monthly' | 'annual' (obligatoire backend pour abonnement)
  cycle?: 'mensuel' | 'annuel';
  terrain_id?: string;
  budget_fcfa?: number;                  // 2000-50000 par paliers de 500
  budget?: number;                       // alias
  duree_jours?: number;                  // 3 | 7 | 14 | 30
  duration_days?: number;                // alias
  creneau_id?: string;
  payment_method: 'wave' | 'orange_money';
  customer_number?: string;
}

export interface PaymentFlowSession {
  paymentId: string;
  kind: 'subscription' | 'campaign' | 'reservation';
  plan: RedirectPlan;
  timestamp: number;
}

const SESSION_STORAGE_KEY = 'playground_payment_flow_session';
const POLLING_INTERVAL_MS = 3000; // 3 secondes
const MAX_POLLING_DURATION_MS = 5 * 60 * 1000; // 5 minutes (300 000 ms)

export function usePaymentFlow() {
  const [status, setStatus] = useState<PaymentFlowStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RedirectPlan | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentKind, setPaymentKind] = useState<'subscription' | 'campaign' | 'reservation'>('subscription');

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const startTimeRef = useRef<number | null>(null);

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
  const checkDirectDbStatus = useCallback(async (targetId: string, kind: 'subscription' | 'campaign' | 'reservation') => {
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
  const startMonitoring = useCallback((targetId: string, kind: 'subscription' | 'campaign' | 'reservation', customPlan?: RedirectPlan) => {
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
        const saved: PaymentFlowSession = JSON.parse(savedRaw);
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
   * Lancement du flux de paiement (Contrats réels du backend create-payment/index.ts)
   */
  const start = async (params: PaymentParams) => {
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
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Vous devez être connecté pour initier une transaction.');
      }

      // ── CONTRATS EXACTS DU BACKEND DISPATCHER (create-payment/index.ts) ──
      let body: Record<string, any> = {};
      const customerNum = phoneCheck.sanitized || params.customer_number?.trim() || '';

      if (params.kind === 'subscription' || params.plan) {
        // Contrat Abonnement : { plan, billing_period, payment_method, customer_number }
        const period = params.billing_period || (params.cycle === 'annuel' ? 'annual' : 'monthly');
        body = {
          plan: params.plan,
          billing_period: period,
          payment_method: params.payment_method,
          customer_number: customerNum,
        };
      } else if (params.kind === 'campaign' || params.terrain_id) {
        // Contrat Boost : { payment_type: 'boost', terrain_id, budget_fcfa, duree_jours, payment_method, customer_number }
        body = {
          payment_type: 'boost', // Impératif pour le dispatcher
          terrain_id: params.terrain_id,
          budget_fcfa: Number(params.budget_fcfa || params.budget),
          duree_jours: Number(params.duree_jours || params.duration_days),
          payment_method: params.payment_method,
          customer_number: customerNum,
        };
      } else {
        // Contrat Réservation : { creneau_id, methode, telephone }
        body = {
          creneau_id: params.creneau_id,
          methode: params.payment_method,
          telephone: customerNum,
        };
      }

      const { data, error: invokeError } = await supabase.functions.invoke('create-payment', {
        body,
      });

      if (invokeError) {
        if (invokeError.status === 403 || invokeError.message?.includes('403')) {
          throw new Error('Ce module nécessite un abonnement Starter ou supérieur.');
        }
        throw new Error(invokeError.message || 'Impossible d\'initialiser le paiement.');
      }

      if (data?.error) {
        if (data.error.includes('403') || data.error.includes('Starter') || data.error.includes('plan')) {
          throw new Error('Ce module nécessite un abonnement Starter ou supérieur.');
        }
        throw new Error(data.error);
      }

      const response: UnitechPaymentResponse = data;
      const computedPlan = createRedirectPlan(response);
      
      // Extraction des clés réelles retournées par le backend
      const returnedPaymentId = 
        (data as any).subscription_id || 
        (data as any).boost_id || 
        (data as any).reservation_id || 
        response.payment_id || 
        response.id;

      if (!returnedPaymentId && !computedPlan.targetUrl && !computedPlan.stayOnPage) {
        throw new Error('Aucune URL de paiement disponible et aucun identifiant retourné par le serveur.');
      }

      setPlan(computedPlan);
      if (returnedPaymentId) {
        setPaymentId(returnedPaymentId);
        setPaymentKind(params.kind);
      }

      // Sauvegarde dans la session
      if (returnedPaymentId) {
        try {
          const sessionPayload: PaymentFlowSession = {
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

      // Cas Desktop avec QR Code : on reste sur la page sans redirection
      if (computedPlan.stayOnPage) {
        setStatus('waiting');
        if (returnedPaymentId) {
          startMonitoring(returnedPaymentId, params.kind, computedPlan);
        }
        return { success: true, plan: computedPlan };
      }

      // Cas Redirection (Mobile ou Web payment_url)
      if (computedPlan.targetUrl) {
        setStatus('redirecting');
        if (returnedPaymentId) {
          startMonitoring(returnedPaymentId, params.kind, computedPlan);
        }
        executeRedirect(computedPlan.targetUrl);
        return { success: true, plan: computedPlan };
      }

      // Repli si pas de redirection immédiate
      setStatus('waiting');
      if (returnedPaymentId) {
        startMonitoring(returnedPaymentId, params.kind, computedPlan);
      }

      return { success: true, plan: computedPlan };
    } catch (err: any) {
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
    startPolling: (id: string, kind: 'subscription' | 'campaign' | 'reservation' = 'subscription') => startMonitoring(id, kind),
  };
}
