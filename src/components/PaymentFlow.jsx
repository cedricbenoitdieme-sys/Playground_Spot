import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconX, IconCheck, IconAlertCircle, IconLoader2,
  IconExternalLink, IconShieldCheck, IconPhoneCall,
  IconQrcode, IconDeviceMobile
} from '@tabler/icons-react';
import { fetchSenePayCountries, initiateSenePayPayment, pollSenePayStatus } from '../services/senepay';
import waveLogo from '../assets/wave.png';
import orangeMoneyLogo from '../assets/orange_money.png';

const SENEGAL_PHONE_REGEX = /^7[0-9]{8}$/;

/**
 * Composant PaymentFlow générique SenePay
 * Supporte : 'abonnement', 'boost', 'reservation'
 */
export const PaymentFlow = ({
  isOpen,
  onClose,
  type_flux = 'reservation',
  // Props selon type_flux
  plan = null,
  billing_period = 'monthly',
  terrain_id = null,
  budget_fcfa = 0,
  duree_jours = 0,
  reservation_id = null,
  amount = 0,
  title = 'Paiement sécurisé',
  onSuccess
}) => {
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('SN');
  const [selectedOperator, setSelectedOperator] = useState('wave');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // États du flux
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [step, setStep] = useState('FORM'); // 'FORM' | 'REDIRECT' | 'USSD_PUSH' | 'OTP_REQUIRED' | 'SUCCESS' | 'FAILED'
  
  // Données de session de paiement
  const [orderId, setOrderId] = useState(null);
  const [redirectUrl, setRedirectUrl] = useState(null);
  const [token, setToken] = useState(null);
  const [ussdCode, setUssdCode] = useState('#144#391#');
  
  // Timer & Polling
  const [timerSeconds, setTimerSeconds] = useState(90);
  const pollingRef = useRef(null);
  const timerRef = useRef(null);

  // Reset état à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setStep('FORM');
      setPhone('');
      setOtpCode('');
      setErrorMsg(null);
      setLoading(false);
      setOrderId(null);
      setRedirectUrl(null);
      setToken(null);
      setTimerSeconds(90);
      stopPollingAndTimer();

      // Charger les pays/opérateurs
      fetchSenePayCountries().then(data => {
        if (data && data.length > 0) {
          setCountries(data);
          const sn = data.find(c => c.code === 'SN') || data[0];
          setSelectedCountry(sn.code);
          if (sn.operators && sn.operators.length > 0) {
            setSelectedOperator(sn.operators[0].code);
          }
        }
      });
    } else {
      stopPollingAndTimer();
    }
  }, [isOpen]);

  const stopPollingAndTimer = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  if (!isOpen) return null;

  const rawPhone = phone.replace(/\s+/g, '');
  const isPhoneValid = SENEGAL_PHONE_REGEX.test(rawPhone);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    if (/^[0-9\s]*$/.test(val)) {
      setPhone(val);
    }
  };

  // Démarrer le polling & décompte UI (timeout 90s)
  const startUssdPolling = (ordId) => {
    setTimerSeconds(90);
    
    // Décompte chaque seconde
    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          stopPollingAndTimer();
          setStep('FAILED');
          setErrorMsg('Délai d\'attente dépassé (90s). Veuillez réessayer.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Polling API toutes les 4s
    pollingRef.current = setInterval(async () => {
      const data = await pollSenePayStatus(ordId);
      if (data) {
        if (data.status === 'completed' || data.status === 'success') {
          stopPollingAndTimer();
          setStep('SUCCESS');
          setTimeout(() => {
            onSuccess && onSuccess(data);
          }, 1500);
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          stopPollingAndTimer();
          setStep('FAILED');
          setErrorMsg(data.raw_response?.failedReason || 'Le paiement a échoué ou a été annulé.');
        }
      }
    }, 4000);
  };

  // Soumission initiale
  const handleInitiate = async (e) => {
    e && e.preventDefault();
    if (!isPhoneValid) {
      setErrorMsg('Veuillez saisir un numéro à 9 chiffres valide (ex: 77 123 45 67).');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await initiateSenePayPayment({
        type_flux,
        plan: plan?.plan_id || plan,
        billing_period,
        terrain_id,
        budget_fcfa,
        duree_jours,
        reservation_id,
        payment_method: selectedOperator === 'orange' ? 'orange_money' : selectedOperator,
        customer_number: rawPhone
      });

      if (!res?.success && !res?.next_action) {
        throw new Error(res?.error || 'Échec de l\'initialisation SenePay');
      }

      setOrderId(res.order_id);
      const action = res.next_action;

      if (action === 'REDIRECT_TO_PROVIDER_LINK') {
        setStep('REDIRECT');
        setRedirectUrl(res.redirect_url);
        if (res.redirect_url) {
          window.open(res.redirect_url, '_blank');
        }
      } else if (action === 'USSD_PUSH') {
        setStep('USSD_PUSH');
        setToken(res.token);
        startUssdPolling(res.order_id);
      } else if (action === 'OTP_REQUIRED') {
        setStep('OTP_REQUIRED');
        setToken(res.token);
        if (res.ussd_code) setUssdCode(res.ussd_code);
      } else {
        // NONE ou statut direct
        if (res.status === 'COMPLETED' || res.status === 'completed') {
          setStep('SUCCESS');
          onSuccess && onSuccess(res);
        } else {
          setStep('FAILED');
          setErrorMsg(res.failed_reason || 'Paiement non finalisé.');
        }
      }

    } catch (err) {
      console.error('[PaymentFlow] Exception initiate:', err);
      setErrorMsg(err.message || 'Une erreur est survenue lors de l\'initialisation.');
      setStep('FORM');
    } finally {
      setLoading(false);
    }
  };

  // Validation du code OTP pour Orange Money
  const handleSubmitOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 4) {
      setErrorMsg('Veuillez saisir un code OTP valide.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await initiateSenePayPayment({
        type_flux,
        order_id: orderId,
        otp_code: otpCode,
        payment_method: selectedOperator === 'orange' ? 'orange_money' : selectedOperator,
        customer_number: rawPhone
      });

      if (res?.status === 'COMPLETED' || res?.status === 'completed' || res?.success) {
        setStep('SUCCESS');
        onSuccess && onSuccess(res);
      } else if (res?.next_action === 'USSD_PUSH') {
        setStep('USSD_PUSH');
        startUssdPolling(orderId);
      } else {
        setStep('FAILED');
        setErrorMsg(res?.failed_reason || res?.error || 'Code OTP invalide ou expiré.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de la validation OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Liste des opérateurs selon pays choisi
  const currentCountryObj = countries.find(c => c.code === selectedCountry) || countries[0];
  const operatorsList = currentCountryObj?.operators || [
    { code: 'wave', name: 'Wave Mobile Money' },
    { code: 'orange', name: 'Orange Money' },
    { code: 'free', name: 'Free Money' },
    { code: 'emoney', name: 'E-Money' }
  ];

  const formattedAmount = new Intl.NumberFormat('fr-FR').format(amount);

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" style={{ zIndex: -1 }} onClick={onClose}></div>
      <div className="bg-[#0F2318] border border-white/10 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1A7A4A]/20 border border-[#1A7A4A]/40 flex items-center justify-center text-[#1A7A4A]">
              <IconShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{title}</h3>
              <p className="text-xs text-white/50">Paiement 100% sécurisé via SenePay</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition">
            <IconX className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Corps */}
        <div className="p-6 space-y-6">

          {/* Étape 1 : Formulaire de choix opérateur & téléphone */}
          {step === 'FORM' && (
            <form onSubmit={handleInitiate} className="space-y-5">
              {/* Résumé du montant */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center">
                <span className="text-sm text-white/70">Montant à régler :</span>
                <span className="text-xl font-bold text-[#E8DCC8]">{formattedAmount} FCFA</span>
              </div>

              {/* Sélection de l'opérateur */}
              <div>
                <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">
                  1. Choisissez votre mode de paiement
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {operatorsList.map(op => {
                    const isSelected = selectedOperator === op.code;
                    return (
                      <button
                        key={op.code}
                        type="button"
                        onClick={() => setSelectedOperator(op.code)}
                        className={`p-3.5 rounded-2xl border flex items-center gap-3 transition text-left ${
                          isSelected
                            ? 'bg-[#1A7A4A]/20 border-[#1A7A4A] text-white shadow-lg'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {op.code === 'wave' ? (
                          <img src={waveLogo} alt="Wave" className="w-7 h-7 rounded-lg object-contain" />
                        ) : op.code === 'orange' ? (
                          <img src={orangeMoneyLogo} alt="Orange Money" className="w-7 h-7 rounded-lg object-contain" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center font-bold text-xs">
                            {op.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-xs font-semibold">{op.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Saisie Numéro Téléphone */}
              <div>
                <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                  2. Numéro de compte mobile
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-white/50 text-sm">
                    <span>🇸🇳 +221</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="77 123 45 67"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-24 pr-4 text-white text-sm focus:outline-none focus:border-[#1A7A4A] transition"
                  />
                </div>
              </div>

              {/* Message d'erreur */}
              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <IconAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Bouton Valider */}
              <button
                type="submit"
                disabled={loading || !isPhoneValid}
                className="w-full py-4 rounded-2xl font-bold bg-[#1A7A4A] hover:bg-[#15633B] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-lg text-white"
              >
                {loading ? (
                  <>
                    <IconLoader2 className="w-5 h-5 animate-spin" />
                    <span>Initialisation...</span>
                  </>
                ) : (
                  <span>Payer {formattedAmount} FCFA</span>
                )}
              </button>
            </form>
          )}

          {/* Étape 2 : REDIRECT_TO_PROVIDER_LINK (Wave) */}
          {step === 'REDIRECT' && (
            <div className="text-center py-6 space-y-5">
              <div className="w-16 h-16 rounded-full bg-[#1A7A4A]/20 border border-[#1A7A4A] text-[#1A7A4A] flex items-center justify-center mx-auto">
                <IconExternalLink className="w-8 h-8 animate-bounce" />
              </div>
              <h4 className="text-lg font-bold">Redirection vers Wave</h4>
              <p className="text-xs text-white/70 max-w-xs mx-auto">
                Une fenêtre de paiement s'est ouverte. Cliquez ci-dessous si la redirection ne s'est pas lancée.
              </p>
              {redirectUrl && (
                <a
                  href={redirectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-[#1A7A4A] font-bold text-sm text-white hover:bg-[#15633B] transition"
                >
                  Ouvrir l'application Wave
                  <IconExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          )}

          {/* Étape 3 : USSD_PUSH (Confirmation téléphone + Polling) */}
          {step === 'USSD_PUSH' && (
            <div className="text-center py-6 space-y-6">
              <div className="w-20 h-20 rounded-full bg-[#1A7A4A]/20 border border-[#1A7A4A]/50 flex items-center justify-center mx-auto relative">
                <IconDeviceMobile className="w-10 h-10 text-[#1A7A4A]" />
                <div className="absolute inset-0 rounded-full border-2 border-[#1A7A4A] animate-ping opacity-25"></div>
              </div>

              <div>
                <h4 className="text-lg font-bold text-[#E8DCC8]">Confirmez sur votre téléphone</h4>
                <p className="text-xs text-white/70 mt-1 max-w-xs mx-auto">
                  Une demande de confirmation a été envoyée sur le <span className="font-semibold text-white">{phone}</span>. Tapez votre code secret.
                </p>
              </div>

              {/* Timer de compte à rebours UI */}
              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl inline-flex items-center gap-2 text-xs">
                <IconLoader2 className="w-4 h-4 animate-spin text-[#1A7A4A]" />
                <span>En attente de confirmation ({timerSeconds}s)</span>
              </div>
            </div>
          )}

          {/* Étape 4 : OTP_REQUIRED (Orange Money) */}
          {step === 'OTP_REQUIRED' && (
            <form onSubmit={handleSubmitOtp} className="space-y-5 py-2">
              <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/30 space-y-2">
                <div className="flex items-center gap-2 text-orange-400 font-semibold text-xs uppercase tracking-wider">
                  <IconPhoneCall className="w-4 h-4" />
                  Code d'autorisation Orange Money
                </div>
                <p className="text-xs text-white/80">
                  Composez <span className="font-mono font-bold text-[#E8DCC8] bg-black/40 px-2 py-0.5 rounded">{ussdCode}</span> sur votre téléphone pour générer votre code OTP.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                  Entrez le code OTP reçu :
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Ex: 123456"
                  maxLength={8}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-4 text-center font-mono text-lg font-bold tracking-widest text-white focus:outline-none focus:border-orange-500 transition"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !otpCode}
                className="w-full py-4 rounded-2xl font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-white"
              >
                {loading ? <IconLoader2 className="w-5 h-5 animate-spin" /> : <span>Valider l'OTP</span>}
              </button>
            </form>
          )}

          {/* Étape 5 : SUCCESS */}
          {step === 'SUCCESS' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500 text-green-400 flex items-center justify-center mx-auto">
                <IconCheck className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-green-400">Paiement confirmé !</h4>
              <p className="text-xs text-white/70">
                Votre transaction a été validée avec succès.
              </p>
            </div>
          )}

          {/* Étape 6 : FAILED */}
          {step === 'FAILED' && (
            <div className="text-center py-6 space-y-5">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500 text-red-400 flex items-center justify-center mx-auto">
                <IconAlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-red-400">Échec du paiement</h4>
              <p className="text-xs text-white/70 max-w-xs mx-auto">
                {errorMsg || 'La transaction n\'a pas pu être finalisée.'}
              </p>
              <button
                onClick={() => setStep('FORM')}
                className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition"
              >
                Réessayer
              </button>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
};
