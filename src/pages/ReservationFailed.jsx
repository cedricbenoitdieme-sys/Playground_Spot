// ⚠️ Déclarer cette route dans le routeur principal (ex: App.jsx) :
// import ReservationFailed from './pages/ReservationFailed'
// <Route path="/reservation/failed" element={<ReservationFailed />} />

import React, { useEffect, useState } from 'react';

export default function ReservationFailed() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Animation fade-in simple au montage
    setAnimate(true);
  }, []);

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
