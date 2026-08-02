import React from 'react';
import { IconAlertTriangle, IconRefresh, IconHome, IconArrowLeft } from '@tabler/icons-react';

/**
 * Page PaiementAnnule
 * Route: /paiement/annule
 * Message neutre, sans culpabilisation, avec possibilité de reprendre.
 */
export const PaiementAnnule = () => {
  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <div className="bg-white rounded-card p-8 shadow-subtle border border-black/5 text-center space-y-6">
        <div className="w-16 h-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto">
          <IconAlertTriangle size={32} />
        </div>

        <div>
          <h1 className="text-2xl font-bold font-display text-primary-dark">Paiement non finalisé</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Vous avez interrompu la procédure de paiement. Aucune somme n'a été débitée de votre compte mobile.
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <button
            onClick={() => window.history.back()}
            className="w-full py-3.5 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm hover:bg-primary-dark transition-colors"
          >
            <IconRefresh size={18} /> Reprendre la réservation
          </button>
          
          <button
            onClick={() => window.location.href = '/joueur-home'}
            className="w-full py-3 bg-gray-50 text-gray-600 font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
          >
            <IconHome size={18} /> Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
};
