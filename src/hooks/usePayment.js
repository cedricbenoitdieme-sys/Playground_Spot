import { useState } from 'react';

/**
 * Hook personnalisé pour initier un paiement UnitechPay
 */
export const usePayment = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initiatePayment = async ({ reservation_id, user_id, amount, customer }) => {
    setLoading(true);
    setError(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/payments/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservation_id,
          user_id,
          amount,
          customer,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();

      if (data.payment_url) {
        // Redirection vers le portail de paiement sécurisé
        window.location.href = data.payment_url;
      } else {
        throw new Error('Lien de paiement non reçu du serveur');
      }
    } catch (err) {
      console.error('Erreur initiation paiement:', err);
      setError(err.message || 'Une erreur de connexion est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return { initiatePayment, loading, error };
};
