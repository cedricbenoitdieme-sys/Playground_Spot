// ⚠️ Déclarer cette route dans le routeur principal (ex: App.jsx) :
// import ReservationSuccess from './pages/ReservationSuccess'
// <Route path="/reservation/success" element={<ReservationSuccess />} />

import React, { useEffect, useState } from 'react';

export default function ReservationSuccess() {
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Animation fade-in simple au montage
    setAnimate(true);

    if (!ref) {
      setLoading(false);
      setStatus('failed');
      return;
    }

    const checkStatus = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/payments/status?ref=${ref}`);
        if (!response.ok) throw new Error('Erreur de validation du paiement');
        const data = await response.json();
        setStatus(data.status);
      } catch (err) {
        console.error('Erreur vérification statut:', err);
        setStatus('failed');
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [ref]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F2318] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-white">
          <svg className="animate-spin h-10 w-10 text-[#1A7A4A]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-display font-medium text-lg">Vérification du paiement...</span>
        </div>
      </div>
    );
  }

  // Rendu de la carte d'échec / pending si le paiement n'est pas "success"
  if (status !== 'success') {
    return (
      <div className={`min-h-screen bg-[#0F2318] flex items-center justify-center p-4 transition-opacity duration-300 ${animate ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-6">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Paiement non abouti</h1>
          <p className="text-[#E8DCC8]/80 font-medium mb-8">Aucun montant n'a été débité.</p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => { window.history.back(); }}
              className="w-full bg-[#1A7A4A] text-white py-3.5 px-6 rounded-2xl font-display font-semibold hover:bg-[#0F2318] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Réessayer
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="w-full bg-white/10 text-white border border-white/20 py-3.5 px-6 rounded-2xl font-display font-semibold hover:bg-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Rendu de la carte de succès
  return (
    <div className={`min-h-screen bg-[#0F2318] flex items-center justify-center p-4 transition-opacity duration-300 ${animate ? 'opacity-100' : 'opacity-0'}`}>
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-[#1A7A4A]/20 rounded-full flex items-center justify-center text-[#1A7A4A] mb-6">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-3xl font-display font-bold text-white mb-2">Réservation confirmée !</h1>
        <p className="text-[#E8DCC8]/80 font-medium mb-8">Ton terrain t'attend.</p>
        <button
          onClick={() => { window.location.href = '/?view=joueur-reservations'; }}
          className="w-full bg-[#1A7A4A] text-white py-3.5 px-6 rounded-2xl font-display font-semibold hover:bg-[#0F2318] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Voir mes réservations
        </button>
      </div>
    </div>
  );
}
