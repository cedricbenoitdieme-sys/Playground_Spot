import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconX, IconCheck, IconAlertCircle, IconLoader2, IconExternalLink, IconShieldCheck, IconPhoneCall } from '@tabler/icons-react';
import { initiateSubscriptionPayment } from '../services/subscriptions';
import { usePaymentPolling } from '../hooks/usePaymentPolling';
import waveLogo from '../assets/wave.png';
import orangeMoneyLogo from '../assets/orange_money.png';

const SENEGAL_PHONE_REGEX = /^7[0-9]{8}$/;

export const SubscriptionCheckoutModal = ({ isOpen, onClose, plan, cycle, onSuccess }) => {
  const [phone, setPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState('wave'); // 'wave' | 'orange_money'
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [currentSubId, setCurrentSubId] = useState(null);

  const { status, subscriptionData, error: pollingError, startPolling, stopPolling } = usePaymentPolling();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhone('');
      setPaymentMode('wave');
      setLoading(false);
      setInitError(null);
      setCheckoutUrl(null);
      setCurrentSubId(null);
      stopPolling();
    }
  }, [isOpen, stopPolling]);

  // Handle successful polling
  useEffect(() => {
    if (status === 'success') {
      setTimeout(() => {
        onSuccess && onSuccess(subscriptionData);
      }, 1500);
    }
  }, [status, subscriptionData, onSuccess]);

  if (!isOpen || !plan) return null;

  // Calcul du prix
  const price = cycle === 'annuel' && plan.prix_annuel ? plan.prix_annuel : plan.prix_mensuel;
  const rawPhone = phone.replace(/\s+/g, '');
  const isPhoneValid = SENEGAL_PHONE_REGEX.test(rawPhone);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    // Permet uniquement chiffres et espaces
    if (/^[0-9\s]*$/.test(val)) {
      setPhone(val);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!isPhoneValid) {
      setInitError('Veuillez saisir un numéro sénégalais valide à 9 chiffres (ex: 77 123 45 67).');
      return;
    }

    setLoading(true);
    setInitError(null);

    try {
      const res = await initiateSubscriptionPayment({
        plan_id: plan.plan_id,
        cycle,
        phone_number: rawPhone,
        mode: paymentMode,
      });

      if (res?.subscription_id) {
        setCurrentSubId(res.subscription_id);
        startPolling(res.subscription_id);
      }

      if (res?.checkout_url) {
        setCheckoutUrl(res.checkout_url);
        // Ouvrir automatiquement dans une nouvelle fenêtre si pas bloqué
        window.open(res.checkout_url, '_blank');
      }
    } catch (err) {
      console.error('Erreur checkout abonnement:', err);
      setInitError(err.message || 'Une erreur est survenue lors de l\'initialisation du paiement.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" style={{ zIndex: -1 }} onClick={onClose}></div>
      <div className="bg-[#0F2318] border border-white/10 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <IconShieldCheck size={24} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">Souscription {plan.nom}</h3>
              <p className="text-xs text-white/60">
                Facturation {cycle === 'annuel' ? 'Annuelle' : 'Mensuelle'} • {price.toLocaleString('fr-FR')} FCFA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* Polling / Processing UI */}
          {status === 'polling' || status === 'success' || status === 'failed' || status === 'timeout' ? (
            <div className="py-8 text-center space-y-6">
              {status === 'polling' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center mx-auto animate-pulse">
                    <IconLoader2 size={36} className="animate-spin" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xl mb-1">Validation de votre paiement</h4>
                    <p className="text-sm text-white/70 max-w-xs mx-auto">
                      Veuillez valider la transaction sur votre téléphone ({paymentMode === 'wave' ? 'Wave' : 'Orange Money'}).
                    </p>
                  </div>
                  {checkoutUrl && (
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/20 text-primary border border-primary/40 font-semibold text-sm hover:bg-primary/30 transition-all"
                    >
                      <span>Ouvrir la page de paiement</span>
                      <IconExternalLink size={16} />
                    </a>
                  )}
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white/50 inline-block">
                    Sondage automatique en cours... Ne fermez pas cette page.
                  </div>
                </>
              )}

              {status === 'success' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                    <IconCheck size={36} />
                  </div>
                  <div>
                    <h4 className="font-bold text-2xl text-emerald-400 mb-1">Abonnement Activé !</h4>
                    <p className="text-sm text-white/70">
                      Félicitations, votre plan <strong>{plan.nom}</strong> est désormais actif.
                    </p>
                  </div>
                </>
              )}

              {(status === 'failed' || status === 'timeout') && (
                <>
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                    <IconAlertCircle size={36} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xl text-red-400 mb-1">Échec ou Délai Épuisé</h4>
                    <p className="text-sm text-white/70 max-w-xs mx-auto">
                      {pollingError || 'Le paiement n\'a pas pu être confirmé.'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCheckoutUrl(null);
                      setCurrentSubId(null);
                      stopPolling();
                    }}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm transition-all"
                  >
                    Réessayer
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Main Form */
            <form onSubmit={handlePay} className="space-y-6">
              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-3">
                  1. Choisissez le moyen de paiement
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Wave */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('wave')}
                    className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer ${
                      paymentMode === 'wave'
                        ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-lg shadow-cyan-500/10 scale-[1.02]'
                        : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-white p-1.5 flex items-center justify-center overflow-hidden shadow-md shrink-0">
                      <img src={waveLogo} alt="Wave Logo" className="w-full h-full object-contain rounded-xl" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Wave Senegal</span>
                  </button>

                  {/* Orange Money */}
                  <button
                    type="button"
                    onClick={() => setPaymentMode('orange_money')}
                    className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer ${
                      paymentMode === 'orange_money'
                        ? 'bg-orange-500/15 border-orange-500 text-white shadow-lg shadow-orange-500/10 scale-[1.02]'
                        : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-white p-1.5 flex items-center justify-center overflow-hidden shadow-md shrink-0">
                      <img src={orangeMoneyLogo} alt="Orange Money Logo" className="w-full h-full object-contain rounded-xl" />
                    </div>
                    <span className="text-sm font-bold tracking-tight">Orange Money</span>
                  </button>
                </div>
              </div>

              {/* Phone Input with Regex Validation */}
              <div>
                <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                  2. Numéro de téléphone ({paymentMode === 'wave' ? 'Wave' : 'Orange Money'})
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 font-mono text-sm">
                    +221
                  </div>
                  <input
                    type="tel"
                    placeholder="77 123 45 67"
                    value={phone}
                    onChange={handlePhoneChange}
                    maxLength={11}
                    className={`w-full pl-16 pr-10 py-3.5 bg-black/30 border rounded-xl text-white font-mono text-sm focus:outline-none transition-all ${
                      phone.length > 0
                        ? isPhoneValid
                          ? 'border-emerald-500/60 focus:border-emerald-500'
                          : 'border-red-500/60 focus:border-red-500'
                        : 'border-white/10 focus:border-primary'
                    }`}
                  />
                  {phone.length > 0 && (
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                      {isPhoneValid ? (
                        <IconCheck size={18} className="text-emerald-400" />
                      ) : (
                        <IconAlertCircle size={18} className="text-red-400" />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mt-1.5 flex items-center gap-1">
                  <IconPhoneCall size={12} />
                  Doit commencer par 7 (ex: 77, 78, 76, 70, 75).
                </p>
              </div>

              {/* Errors */}
              {initError && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-start gap-2">
                  <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{initError}</span>
                </div>
              )}

              {/* Total Summary */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-white/60">Total à payer</span>
                  <p className="text-xl font-bold font-display text-primary">
                    {price.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <span className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20 font-medium">
                  {cycle === 'annuel' ? 'Abonnement Annuel' : 'Abonnement Mensuel'}
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !isPhoneValid}
                className="w-full py-4 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:hover:bg-primary text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-base cursor-pointer"
              >
                {loading ? (
                  <>
                    <IconLoader2 size={20} className="animate-spin" />
                    <span>Initialisation en cours...</span>
                  </>
                ) : (
                  <>
                    <span>Payer {price.toLocaleString('fr-FR')} FCFA</span>
                    <IconShieldCheck size={20} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
