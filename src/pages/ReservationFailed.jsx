import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { IconAlertTriangle, IconRefresh, IconHome } from '@tabler/icons-react';

export default function ReservationFailed() {
  const [animate, setAnimate] = useState(false);
  const [motif, setMotif] = useState(null);

  useEffect(() => {
    setAnimate(true);
    const queryParams = new URLSearchParams(window.location.search);
    const resaId = queryParams.get('resa') || sessionStorage.getItem('pending_reservation_id');

    if (resaId) {
      supabase
        .from('reservations')
        .select('motif_annulation')
        .eq('id', resaId)
        .single()
        .then(({ data }) => {
          if (data?.motif_annulation) {
            setMotif(data.motif_annulation);
          }
        });
    }
  }, []);

  return (
    <div className={`min-h-[80vh] flex items-center justify-center p-4 transition-opacity duration-300 ${animate ? 'opacity-100' : 'opacity-0'}`}>
      <div className="bg-white rounded-card border border-black/5 p-8 max-w-md w-full text-center shadow-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <IconAlertTriangle size={36} />
        </div>
        <h1 className="text-2xl font-display font-bold text-primary-dark mb-2">Paiement non abouti</h1>
        <p className="text-gray-500 font-medium text-sm mb-4">
          Le paiement a été refusé ou a expiré. Aucun montant n'a été débité.
        </p>

        {motif && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-6 w-full text-xs font-bold text-red-700">
            Motif : {motif}
          </div>
        )}

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => { window.history.back(); }}
            className="w-full bg-primary text-white py-3.5 px-6 rounded-2xl font-semibold hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
          >
            <IconRefresh size={18} />
            <span>Réessayer</span>
          </button>
          <button
            onClick={() => { window.location.href = '/joueur-home'; }}
            className="w-full bg-gray-100 text-gray-700 py-3.5 px-6 rounded-2xl font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
          >
            <IconHome size={18} />
            <span>Retour à l'accueil</span>
          </button>
        </div>
      </div>
    </div>
  );
}

