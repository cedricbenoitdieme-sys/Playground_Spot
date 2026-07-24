import React from 'react';
import { usePayment } from '../hooks/usePayment';

/**
 * Composant bouton de paiement premium avec gestion d'état loading et feedback d'erreur.
 */
export const PayButton = ({ reservation_id, user_id, amount, customer, label = 'Payer la réservation' }) => {
  const { initiatePayment, loading, error } = usePayment();

  const handlePayment = async () => {
    await initiatePayment({
      reservation_id,
      user_id,
      amount,
      customer
    });
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <button
        onClick={handlePayment}
        disabled={loading}
        className={`w-full bg-[#1A7A4A] text-white py-3 px-6 rounded-2xl font-display font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#1A7A4A]/50 ${
          loading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-[#0F2318]'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Redirection en cours...</span>
          </div>
        ) : (
          label
        )}
      </button>

      {error && (
        <p className="text-red-500 text-sm font-semibold text-center mt-1 animate-pulse">
          {error}
        </p>
      )}
    </div>
  );
};
