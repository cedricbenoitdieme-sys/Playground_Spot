import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconLoader2, IconCircleCheckFilled, IconX, IconPhone } from '@tabler/icons-react';
import { validatePhone, validateAmount } from '../lib/validators';
import waveLogo from '../assets/wave.png';
import omLogo from '../assets/orange_money.png';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Modal Paiement Sécurisé
 * Security Rules: 1.1, 1.2, 1.5
 * ═══════════════════════════════════════════════════════════
 */

export const PaymentModal = ({ method, amount, isOpen, onClose, onConfirm }) => {
  const [status, setStatus] = useState('idle'); // 'idle', 'processing', 'success'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setPhoneNumber('');
      setPhoneError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMobilePayment = method === 'Wave' || method === 'Orange Money';

  // ── Règle 1.2 — Validation du numéro de téléphone ──
  const handlePhoneChange = (e) => {
    setPhoneNumber(e.target.value);
    setPhoneError(null);
  };

  const handleSimulate = () => {
    // ── Règle 1.1 — Validation du montant ──
    const amountCheck = validateAmount(amount);
    if (!amountCheck.valid) {
      setPhoneError(amountCheck.error);
      return;
    }

    // ── Règle 1.2 — Validation téléphone pour paiement mobile ──
    if (isMobilePayment) {
      const phoneCheck = validatePhone(phoneNumber);
      if (!phoneCheck.valid) {
        setPhoneError(phoneCheck.error);
        return;
      }
    }

    setPhoneError(null);
    setStatus('processing');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => {
        onConfirm(isMobilePayment ? phoneNumber : null);
      }, 1500);
    }, 2500);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999]" style={{ isolation: 'isolate' }}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" style={{ zIndex: -1 }} onClick={onClose}></div>
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-modal shadow-2xl p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300 no-scrollbar">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors">
          <IconX size={24} />
        </button>
 
        <div className="text-center">
          <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 overflow-hidden ${
            method === 'Wave' ? 'bg-[#1DB954]/10' :
            method === 'Orange Money' ? 'bg-[#FF6600]/10' :
            'bg-[#6366F1]/10 text-[#6366F1]'
          }`}>
            {method === 'Wave' ? (
              <img src={waveLogo} alt="Wave" className="w-full h-full object-cover" />
            ) : method === 'Orange Money' ? (
              <img src={omLogo} alt="Orange Money" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-black">{method[0]}</span>
            )}
          </div>
 
          <h3 className="text-2xl font-bold text-primary-dark mb-2">Paiement {method}</h3>
          <p className="text-gray-500 mb-6">
            {method === 'Orange Money' ? (
              <>Pour confirmer, veuillez composer le <span className="font-bold text-primary-dark">#144#</span> sur votre téléphone.</>
            ) : method === 'Wave' ? (
              <>Validez la transaction directement depuis la notification reçue dans votre application Wave.</>
            ) : (
              <>Validez le paiement en toute sécurité via le portail Pay Unitech.</>
            )}
          </p>

          {/* ── Règle 1.2 — Champ numéro de téléphone (paiement mobile) ── */}
          {isMobilePayment && status === 'idle' && (
            <div className="mb-6 text-left">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 pl-1">
                Numéro {method}
              </label>
              <div className={`flex items-center gap-3 bg-gray-50 border rounded-xl px-4 py-3 transition-all ${
                phoneError ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20'
              }`}>
                <IconPhone size={16} className="text-gray-400 shrink-0" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="+221 77 123 45 67"
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm text-primary-dark placeholder:text-gray-400"
                  maxLength={20}
                />
              </div>
              {phoneError && (
                <p className="text-red-500 text-xs font-semibold mt-1.5 pl-1 animate-in slide-in-from-top-1 duration-200">
                  {phoneError}
                </p>
              )}
              <p className="text-[10px] text-gray-400 mt-1 pl-1">
                Format : +221 7X XXX XX XX ou 7X XXX XX XX
              </p>
            </div>
          )}

          <div className="bg-background rounded-2xl p-6 mb-8 border border-black/5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Montant à payer</p>
            <p className="text-3xl font-display font-bold text-primary-dark">{amount.toLocaleString('fr-FR')} FCFA</p>
          </div>

          {status === 'idle' && (
            <>
              <button 
                onClick={handleSimulate}
                disabled={isMobilePayment && !phoneNumber.trim()}
                className="w-full btn-primary h-14 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed mb-4 flex items-center justify-center gap-2"
              >
                {isMobilePayment ? 'Envoyer la demande de paiement' : 'Simuler paiement reçu'}
              </button>
              <div className="flex flex-col items-center justify-center gap-1 text-[10px] text-gray-400 font-semibold select-none bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="flex items-center gap-1 text-primary-dark font-bold">
                  🔒 Paiement sécurisé par Unitech Pay
                </span>
                <span className="italic">Supporte Wave & Orange Money.</span>
                <p className="text-center text-[9px] text-gray-400 mt-1 leading-normal">
                  La plateforme de paiement Unitech Pay qui nous permet d'accéder à Wave et Orange Money applique une commission de 1,5% sur chaque transaction. Ces frais sont supportés par le gérant (qui doit les inclure dans son prix pour ne pas impacter son gain net).
                </p>
              </div>
            </>
          )}

          {status === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <button disabled className="w-full btn-primary h-14 shadow-lg shadow-primary/20 opacity-70 cursor-not-allowed flex items-center justify-center gap-2">
                <IconLoader2 className="animate-spin" size={22} />
                <span>Traitement en cours...</span>
              </button>
              <p className="font-bold text-xs text-primary animate-pulse">En attente de confirmation de votre opérateur...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <IconCircleCheckFilled className="text-primary" size={60} />
              <p className="font-bold text-primary text-lg">Paiement reçu !</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Utiliser un portal pour rendre la modale au niveau de la racine (body)
  return createPortal(modalContent, document.body);
};
