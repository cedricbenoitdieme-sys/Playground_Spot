import React, { useState, useEffect, useRef } from 'react';
import { 
  IconX, 
  IconAlertTriangle, 
  IconLoader2, 
  IconAlertCircle, 
  IconBrandWhatsapp, 
  IconShieldCheck,
  IconSparkles
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { validatePhone } from '../lib/validators';
import { initiateSubscriptionPayment, fetchSubscriptionStatus } from '../services/subscriptions';
import { IS_PAIEMENT_ABONNEMENT_ACTIF } from '../config/paymentConfig';
import waveLogo from '../assets/wave.png';
import omLogo from '../assets/orange_money.png';

export const SubscriptionCheckoutModal = ({ 
  isOpen, 
  onClose, 
  plan, 
  cycle = 'mensuel',
  onSuccess 
}) => {
  const { currentUser } = useUser();
  const [selectedCycle, setSelectedCycle] = useState(cycle || 'mensuel');
  const [methode, setMethode] = useState('wave');
  const [telephone, setTelephone] = useState(currentUser?.tel || '');
  const [phoneError, setPhoneError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentLocked, setPaymentLocked] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isGatewayError, setIsGatewayError] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(null);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    if (cycle) setSelectedCycle(cycle);
  }, [cycle]);

  useEffect(() => {
    if (currentUser?.tel && !telephone) {
      setTelephone(currentUser.tel);
    }
  }, [currentUser]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  if (!IS_PAIEMENT_ABONNEMENT_ACTIF) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-[#0F2318] border border-white/10 text-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl space-y-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/50 hover:text-white rounded-full bg-white/5 transition-colors cursor-pointer"
          >
            <IconX size={20} />
          </button>

          <div className="flex flex-col items-center text-center space-y-3 pt-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <IconAlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold font-display">Paiement en ligne indisponible</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Les souscriptions aux offres payantes ({plan?.nom || 'Pro/Starter'}) par Wave et Orange Money sont temporairement suspendues.
            </p>
          </div>

          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-xs text-white/80 space-y-2">
            <p className="font-semibold text-primary">Comment souscrire ?</p>
            <p>
              Pour activer cet abonnement dès aujourd'hui, veuillez contacter l'équipe PlaygroundSpot par WhatsApp.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <a
              href="https://wa.me/221770000000?text=Bonjour,%20je%20souhaite%20souscrire%20au%20plan%20g%C3%A9rant"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl text-center text-sm transition-all shadow-lg cursor-pointer"
            >
              Contacter l'équipe sur WhatsApp
            </a>
            <button
              onClick={onClose}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl text-xs transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasAnnualOption = Boolean(plan?.prix_annuel && plan.prix_annuel > 0);
  const currentPrice = selectedCycle === 'annuel' && hasAnnualOption ? plan.prix_annuel : (plan?.prix_mensuel || 0);

  const handlePhoneChange = (e) => {
    setTelephone(e.target.value);
    setPhoneError(null);
    setApiError(null);
  };

  const startStatusPolling = (subId) => {
    setPollingStatus('polling');
    let attempts = 0;
    const maxAttempts = 150;

    pollTimerRef.current = setInterval(async () => {
      attempts += 1;
      const statusData = await fetchSubscriptionStatus(subId);
      if (statusData?.status === 'active') {
        clearInterval(pollTimerRef.current);
        setPollingStatus('success');
        setLoading(false);
        if (onSuccess) onSuccess(statusData);
      } else if (statusData?.status === 'failed' || statusData?.status === 'cancelled') {
        clearInterval(pollTimerRef.current);
        setPollingStatus('failed');
        setLoading(false);
        setPaymentLocked(false);
        setApiError('Le paiement de la souscription n\'a pas pu être validé.');
      } else if (attempts >= maxAttempts) {
        clearInterval(pollTimerRef.current);
        setPollingStatus('failed');
        setLoading(false);
        setPaymentLocked(false);
        setApiError('Délai d\'attente dépassé pour la confirmation du paiement.');
      }
    }, 4000);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const phoneCheck = validatePhone(telephone);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error);
      return;
    }

    setPhoneError(null);
    setApiError(null);
    setIsGatewayError(false);
    setLoading(true);
    setPaymentLocked(true);

    try {
      const response = await initiateSubscriptionPayment({
        plan_id: plan?.plan_id || plan?.id || 'starter',
        cycle: selectedCycle,
        phone_number: phoneCheck.sanitized || telephone,
        mode: methode
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.payment_url) {
        window.location.href = response.payment_url;
      } else if (response?.subscription_id) {
        startStatusPolling(response.subscription_id);
      } else {
        setLoading(false);
        if (onSuccess) onSuccess(response);
        onClose();
      }
    } catch (err) {
      setLoading(false);
      setPaymentLocked(false);

      const msg = err?.error || err?.message || 'Une erreur est survenue lors du paiement.';
      if (msg.includes('502') || msg.toLowerCase().includes('passerelle') || msg.toLowerCase().includes('gateway')) {
        setIsGatewayError(true);
        setApiError('La passerelle de paiement rencontre un souci technique (502). Vous pouvez souscrire directement via WhatsApp.');
      } else {
        setApiError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0F2318] border border-white/10 text-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl space-y-5 overflow-y-auto max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <IconSparkles size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold font-display leading-snug">Souscription Plan {plan?.nom || 'Gérant'}</h3>
              <p className="text-[11px] text-white/50">Paiement sécurisé mobile via UnitechPay</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-white/50 hover:text-white rounded-full bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Polling / Processing state */}
        {pollingStatus === 'polling' ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mx-auto animate-pulse">
              <IconLoader2 size={32} className="animate-spin" />
            </div>
            <div>
              <h4 className="font-bold text-lg text-white">Validation du paiement en cours...</h4>
              <p className="text-xs text-white/60 mt-1 max-w-xs mx-auto">
                Veuillez valider la transaction sur votre téléphone ({telephone}). Nous vérifions le statut en direct.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Choix du Cycle si option annuelle disponible */}
            {hasAnnualOption && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Période de facturation</label>
                <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setSelectedCycle('mensuel')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedCycle === 'mensuel' ? 'bg-primary text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                  >
                    Mensuel ({plan.prix_mensuel?.toLocaleString('fr-FR')} F)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCycle('annuel')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${selectedCycle === 'annuel' ? 'bg-primary text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                  >
                    Annuel ({plan.prix_annuel?.toLocaleString('fr-FR')} F)
                  </button>
                </div>
              </div>
            )}

            {/* Récapitulatif du Tarif */}
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Total à régler</p>
                <p className="text-lg font-bold text-primary">
                  {currentPrice > 0 ? `${currentPrice.toLocaleString('fr-FR')} FCFA` : 'Gratuit'}
                </p>
              </div>
              <span className="text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 px-2.5 py-1 rounded-full uppercase">
                {selectedCycle === 'annuel' ? 'Par an' : 'Par mois'}
              </span>
            </div>

            {/* Choix Méthode de paiement */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Moyen de paiement</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMethode('wave')}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${methode === 'wave' ? 'border-primary bg-primary/10 shadow-md' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <img src={waveLogo} alt="Wave" className="w-8 h-8 object-contain rounded-lg" />
                  <span className={`text-xs font-bold ${methode === 'wave' ? 'text-primary' : 'text-white/70'}`}>Wave</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethode('orange_money')}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${methode === 'orange_money' ? 'border-primary bg-primary/10 shadow-md' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <img src={omLogo} alt="Orange Money" className="w-8 h-8 object-contain rounded-lg" />
                  <span className={`text-xs font-bold ${methode === 'orange_money' ? 'text-primary' : 'text-white/70'}`}>Orange Money</span>
                </button>
              </div>
            </div>

            {/* Numéro Sénégalais */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Numéro de téléphone ({methode === 'wave' ? 'Wave' : 'Orange Money'})</label>
              <div className="relative">
                <input
                  type="tel"
                  value={telephone}
                  onChange={handlePhoneChange}
                  placeholder="77 000 00 00"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-all"
                />
              </div>
              {phoneError && (
                <p className="text-xs text-red-400 font-medium flex items-center gap-1">
                  <IconAlertCircle size={14} /> {phoneError}
                </p>
              )}
            </div>

            {/* Messages d'erreur API & Fallback Passerelle 502 */}
            {apiError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300 space-y-2">
                <p className="flex items-center gap-1.5 font-semibold">
                  <IconAlertCircle size={15} className="shrink-0 text-red-400" /> {apiError}
                </p>
                {isGatewayError && (
                  <a
                    href={`https://wa.me/221770000000?text=Bonjour,%20je%20souhaite%20souscrire%20au%20plan%20${encodeURIComponent(plan?.nom || '')}%20(Erreur%20502)`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    <IconBrandWhatsapp size={14} /> Contacter sur WhatsApp
                  </a>
                )}
              </div>
            )}

            {/* Bouton de Soumission */}
            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={loading || paymentLocked || !telephone}
                className="w-full py-4 bg-primary hover:bg-primary-hover disabled:bg-gray-600/40 text-white font-bold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <IconLoader2 size={18} className="animate-spin" />
                    Initialisation du paiement...
                  </>
                ) : (
                  <>
                    <IconShieldCheck size={18} />
                    Payer {currentPrice.toLocaleString('fr-FR')} FCFA avec {methode === 'wave' ? 'Wave' : 'Orange Money'}
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-white/40">
                Paiement crypté et sécurisé par la passerelle UnitechPay.
              </p>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};
