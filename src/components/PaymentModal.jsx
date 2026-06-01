import React, { useState, useEffect } from 'react';
import { IconLoader2, IconCircleCheckFilled, IconX } from '@tabler/icons-react';

export const PaymentModal = ({ method, amount, isOpen, onClose, onConfirm }) => {
  const [status, setStatus] = useState('idle'); // 'idle', 'processing', 'success'

  if (!isOpen) return null;

  const handleSimulate = () => {
    setStatus('processing');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => {
        onConfirm();
      }, 1500);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-modal shadow-2xl p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300 no-scrollbar">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors">
          <IconX size={24} />
        </button>

        <div className="text-center">
          <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 ${
            method === 'Wave' ? 'bg-[#1DB954]/10 text-[#1DB954]' : 'bg-[#FF6600]/10 text-[#FF6600]'
          }`}>
            <span className="text-xl font-black">{method[0]}</span>
          </div>

          <h3 className="text-2xl font-bold text-primary-dark mb-2">Paiement {method}</h3>
          <p className="text-gray-500 mb-8">
            Pour confirmer, veuillez composer le <span className="font-bold text-primary-dark">#144#</span> sur votre téléphone ou valider via l'application.
          </p>

          <div className="bg-background rounded-2xl p-6 mb-8 border border-black/5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Montant à payer</p>
            <p className="text-3xl font-display font-bold text-primary-dark">{amount.toLocaleString('fr-FR')} FCFA</p>
          </div>

          {status === 'idle' && (
            <button 
              onClick={handleSimulate}
              className="w-full btn-primary h-14 shadow-lg shadow-primary/20"
            >
              Simuler paiement reçu
            </button>
          )}

          {status === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <IconLoader2 className="text-primary animate-spin" size={40} />
              <p className="font-bold text-primary animate-pulse">En attente de confirmation...</p>
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
};
