// ⚠️ Déclarer cette route dans le routeur principal (ex: App.jsx ou routes du projet) :
// import VerifyTicket from './pages/VerifyTicket'
// <Route path="/verify" element={<VerifyTicket />} />

import React, { useEffect, useState } from 'react';

export function VerifyTicket({ token: propToken }) {
  const urlParams = new URLSearchParams(window.location.search);
  const token = propToken || urlParams.get('token');

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Animation fade-in simple au montage
    setAnimate(true);

    if (!token) {
      setLoading(false);
      setResult({ valid: false });
      return;
    }

    const verifyToken = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/reservations/verify?token=${token}`);
        const data = await response.json();
        setResult(data);
      } catch (err) {
        console.error('Erreur lors de la vérification:', err);
        setResult({ valid: false });
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F2318] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-white">
          <svg className="animate-spin h-10 w-10 text-[#E8DCC8]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-display font-medium text-lg text-[#E8DCC8]">Vérification du ticket...</span>
        </div>
      </div>
    );
  }

  const isValid = result?.valid === true;

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-4 transition-opacity duration-300 ${
        animate ? 'opacity-100' : 'opacity-0'
      } ${isValid ? 'bg-[#1A7A4A]' : 'bg-[#4A1A1A]'}`}
    >
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center text-white">
        {isValid ? (
          <>
            {/* Icône ✅ grande */}
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-white mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            
            <h1 className="text-3xl font-display font-bold mb-6">Ticket Valide</h1>
            
            {/* Détails du ticket */}
            <div className="w-full text-left bg-black/15 rounded-2xl p-5 space-y-4 font-sans border border-white/5 mb-8">
              <div>
                <p className="text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest mb-0.5">Terrain</p>
                <p className="text-lg font-bold">{result.terrain}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest mb-0.5">Date</p>
                  <p className="text-base font-bold">{new Date(result.date).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest mb-0.5">Heure</p>
                  <p className="text-base font-bold">{result.heure}</p>
                </div>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest mb-0.5">Joueur</p>
                <p className="text-base font-bold">{result.joueur}</p>
                <p className="text-sm text-white/80">{result.phone}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Icône ❌ */}
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-white mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            
            <h1 className="text-3xl font-display font-bold mb-2">Ticket Invalide</h1>
            <p className="text-[#E8DCC8]/80 font-medium mb-8">Ce QR code n'est pas reconnu.</p>
          </>
        )}

        {/* Bouton de retour */}
        <button
          onClick={() => { window.location.href = '/'; }}
          className="w-full bg-white text-[#0F2318] py-3.5 px-6 rounded-2xl font-display font-semibold hover:bg-[#E8DCC8] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
