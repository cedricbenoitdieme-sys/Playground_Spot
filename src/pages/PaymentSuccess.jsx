import React, { useEffect } from 'react';
import { 
  IconCheck, 
  IconSparkles, 
  IconLayoutDashboard, 
  IconLoader2, 
  IconAlertTriangle, 
  IconBrandWhatsapp, 
  IconRefresh 
} from '@tabler/icons-react';
import { usePaymentFlow } from '../hooks/usePaymentFlow';

export const PaymentSuccess = ({ setView }) => {
  const { status, error, plan, startPolling, reset } = usePaymentFlow();

  const searchParams = new URLSearchParams(window.location.search);
  const paymentId = 
    searchParams.get('p') || 
    searchParams.get('subscription_id') || 
    searchParams.get('boost_id') || 
    searchParams.get('payment_id') || 
    sessionStorage.getItem('pending_subscription_id') || 
    sessionStorage.getItem('pending_boost_id');

  const kind = sessionStorage.getItem('pending_boost_id') ? 'campaign' : 'subscription';

  useEffect(() => {
    if (paymentId) {
      startPolling(paymentId, kind);
    }
  }, [paymentId, kind, startPolling]);

  const handleGoDashboard = () => {
    if (setView) {
      setView('gerant-dashboard');
    } else {
      window.location.href = '/?view=gerant-dashboard';
    }
  };

  const isCompleted = status === 'completed';
  const isFailed = status === 'failed' || status === 'timeout';

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#0F2318] border border-emerald-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl shadow-emerald-500/10 text-white animate-fadeIn">
        
        {isCompleted ? (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 animate-in zoom-in duration-200">
              <IconCheck size={44} />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
                <IconSparkles size={14} />
                <span>Paiement Validé par l'Opérateur</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-display font-extrabold text-white">
                Paiement Confirmé !
              </h1>
              <p className="text-sm text-white/70">
                Votre transaction a été validée avec succès en base de données. Vos droits et accès ont été débloqués.
              </p>
            </div>

            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-left space-y-2 text-xs">
              <div className="flex justify-between text-white/60">
                <span>Statut du paiement :</span>
                <span className="text-emerald-400 font-bold">Vérifié (active / actif)</span>
              </div>
              {paymentId && (
                <div className="flex justify-between text-white/60">
                  <span>Référence :</span>
                  <span className="text-white font-mono text-[11px] truncate max-w-[180px]">{paymentId}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleGoDashboard}
              className="w-full py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-base cursor-pointer"
            >
              <IconLayoutDashboard size={20} />
              <span>Accéder à mon Tableau de bord</span>
            </button>
          </>
        ) : isFailed ? (
          <>
            <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/50 text-amber-400 flex items-center justify-center mx-auto shadow-lg">
              <IconAlertTriangle size={44} />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl md:text-2xl font-display font-bold text-white">
                {status === 'timeout' ? 'Délai de confirmation expiré (5 min)' : 'Paiement non confirmé'}
              </h1>
              <p className="text-xs text-white/70 leading-relaxed">
                {error || 'La transaction n\'a pas encore été confirmée par le serveur. Si vous avez été débité, contactez le support commercial.'}
              </p>
            </div>

            {plan?.fallbackUrl && (
              <a
                href={plan.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all border border-white/10"
              >
                Accéder au lien de secours opérateur
              </a>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <a
                href="https://wa.me/221770000000?text=Bonjour,%20mon%20paiement%20n'est%20pas%20confirm%C3%A9"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <IconBrandWhatsapp size={16} />
                <span>Contacter le Support WhatsApp</span>
              </a>
              <button
                onClick={reset}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <IconRefresh size={14} />
                <span>Réessayer la vérification</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mx-auto animate-pulse">
              <IconLoader2 size={40} className="animate-spin" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl md:text-2xl font-display font-bold text-white">
                Vérification du paiement en cours...
              </h1>
              <p className="text-xs text-white/70 max-w-xs mx-auto leading-relaxed">
                Vérification directe en base de données et écoute Realtime Supabase. Seul le statut `active` / `actif` débloque l'accès.
              </p>
            </div>

            {plan?.fallbackUrl && (
              <div className="pt-2">
                <a
                  href={plan.fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline font-medium hover:text-primary-hover"
                >
                  Vous avez fermé l'app opérateur ? Cliquez ici pour la rouvrir
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
