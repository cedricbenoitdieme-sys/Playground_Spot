import React from 'react';
import { IconCheck, IconSparkles, IconArrowRight, IconLayoutDashboard } from '@tabler/icons-react';

export const PaymentSuccess = ({ setView }) => {
  const handleRedirect = () => {
    if (setView) {
      setView('gerant-dashboard');
    } else {
      window.location.href = '/?view=gerant-dashboard';
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#0F2318] border border-emerald-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl shadow-emerald-500/10 text-white animate-fadeIn">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
          <IconCheck size={44} />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
            <IconSparkles size={14} />
            <span>Paiement Confirmé</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-extrabold text-white">
            Abonnement Activé avec Succès !
          </h1>
          <p className="text-sm text-white/70">
            Votre compte gérant a été mis à jour avec vos nouvelles fonctionnalités et quotas débloqués.
          </p>
        </div>

        <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-left space-y-2 text-xs">
          <div className="flex justify-between text-white/60">
            <span>Statut du paiement :</span>
            <span className="text-emerald-400 font-bold">Réussi</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Activation :</span>
            <span className="text-white font-semibold">Immédiate</span>
          </div>
        </div>

        <button
          onClick={handleRedirect}
          className="w-full py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-base cursor-pointer"
        >
          <IconLayoutDashboard size={20} />
          <span>Accéder à mon Tableau de bord</span>
        </button>
      </div>
    </div>
  );
};
