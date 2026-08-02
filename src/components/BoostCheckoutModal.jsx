import React from 'react';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';

export const BoostCheckoutModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0F2318] border border-white/10 text-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-white/50 hover:text-white rounded-full bg-white/5 transition-colors cursor-pointer"
        >
          <IconX size={20} />
        </button>

        <div className="flex flex-col items-center text-center space-y-3 pt-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <IconAlertTriangle size={32} />
          </div>
          <h3 className="text-xl font-bold font-display">Paiement en ligne indisponible</h3>
          <p className="text-sm text-white/70 leading-relaxed">
            L'achat de boosts de visibilité par paiement mobile (Wave / Orange Money) est temporairement suspendu.
          </p>
        </div>

        <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-xs text-white/80 space-y-2">
          <p className="font-semibold text-primary">Activer un boost manuellement ?</p>
          <p>
            Contactez notre équipe support pour paramétrer et activer la mise en avant de votre terrain.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <a
            href="https://wa.me/221770000000?text=Bonjour,%20je%20souhaite%20booster%20la%20visibilit%C3%A9%20de%20mon%20terrain"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl text-center text-sm transition-all shadow-lg cursor-pointer"
          >
            Contacter l'équipe sur WhatsApp
          </a>
          <button
            onClick={onClose}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl text-xs transition-all cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
