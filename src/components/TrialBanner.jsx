import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { IconInfoCircle, IconCheck, IconAlertTriangle } from '@tabler/icons-react';

export const TrialBanner = ({ trialStatus, onTrialExpired }) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  React.useEffect(() => {
    if (trialStatus?.is_expired) {
      onTrialExpired?.();
    }
  }, [trialStatus?.is_expired, onTrialExpired]);

  if (!trialStatus || trialStatus.is_expired) return null;

  const handleCancelTrial = async () => {
    setIsCancelling(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc('cancel_free_trial');
      if (error) throw error;
      
      setShowConfirmModal(false);
      onTrialExpired?.();
    } catch (err) {
      setErrorMsg(err.message || "Erreur lors de l'annulation de l'essai.");
    } finally {
      setIsCancelling(false);
    }
  };

  const { can_cancel, is_committed, days_left, cancel_days_left } = trialStatus;

  return (
    <div className="w-full px-4 pt-4 z-40 max-w-7xl mx-auto">
      {can_cancel && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row justify-between items-center gap-3 text-left">
          <div className="flex items-center gap-2.5">
            <IconInfoCircle className="text-amber-400 shrink-0" size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">
              Essai gratuit actif ({days_left} jour{days_left > 1 ? 's' : ''} restant{days_left > 1 ? 's' : ''}) • Annulable encore {cancel_days_left} jour{cancel_days_left > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => setShowConfirmModal(true)}
            className="h-8 px-3.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer border border-red-500/30 whitespace-nowrap"
          >
            Annuler l'essai
          </button>
        </div>
      )}

      {is_committed && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl p-3.5 flex items-center gap-2.5 text-left">
          <IconCheck className="text-emerald-400 shrink-0" size={20} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Essai engagé ({days_left} jour{days_left > 1 ? 's' : ''} restant{days_left > 1 ? 's' : ''})
          </span>
        </div>
      )}

      {/* Modal confirmation annulation */}
      {showConfirmModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" style={{ zIndex: -1 }} onClick={() => setShowConfirmModal(false)}></div>
          <div className="bg-[#0F2318] border border-white/10 rounded-3xl w-full max-w-sm p-6 text-white text-left shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <IconAlertTriangle size={24} />
              <h3 className="font-display font-bold text-sm uppercase tracking-wider">Annuler l'essai gratuit ?</h3>
            </div>
            <p className="text-xs text-white/70 leading-relaxed">
              En annulant votre essai gratuit, vous basculerez immédiatement vers le paywall de sélection d'un abonnement.
            </p>

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">{errorMsg}</p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-bold rounded-xl uppercase tracking-wider text-white transition-all cursor-pointer"
              >
                Retour
              </button>
              <button
                onClick={handleCancelTrial}
                disabled={isCancelling}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl uppercase tracking-wider transition-all cursor-pointer"
              >
                {isCancelling ? 'Annulation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
