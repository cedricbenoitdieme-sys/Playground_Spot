import React from 'react';
import { IconX, IconRefresh, IconArrowLeft } from '@tabler/icons-react';

export const PaymentCancel = ({ setView }) => {
  const handleReturn = () => {
    if (setView) {
      setView('gerant-tarifs');
    } else {
      window.location.href = '/?view=gerant-tarifs';
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#0F2318] border border-white/10 rounded-3xl p-8 text-center space-y-6 shadow-2xl text-white animate-fadeIn">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
          <IconX size={44} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-display font-extrabold text-white">
            Paiement non finalisé
          </h1>
          <p className="text-sm text-white/70">
            La transaction a été annulée ou interrompue. Aucun montant n'a été prélevé sur votre compte.
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <button
            onClick={handleReturn}
            className="w-full py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-base cursor-pointer"
          >
            <IconRefresh size={20} />
            <span>Réessayer ou Choisir un autre plan</span>
          </button>
          <button
            onClick={() => setView ? setView('gerant-dashboard') : window.location.href = '/'}
            className="w-full py-3 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <IconArrowLeft size={16} />
            <span>Retour au tableau de bord</span>
          </button>
        </div>
      </div>
    </div>
  );
};
