import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { IconChevronLeft, IconScan, IconAlertTriangle } from '@tabler/icons-react';

export const ScanTicket = ({ onBack }) => {
  const [error, setError] = useState(null);

  const handleScan = (result) => {
    if (result && result.length > 0) {
      const scannedValue = result[0].rawValue;
      // Extract the token if the URL is https://playgroundspot.com/verify/TOKEN
      // Or if it's just the TOKEN
      let token = scannedValue;
      if (scannedValue.includes('/verify/')) {
        token = scannedValue.split('/verify/')[1];
      }
      
      if (token) {
        // Redirect to the verification page
        window.location.href = `/verify/${token}`;
      } else {
        setError('Code QR invalide ou non reconnu.');
      }
    }
  };

  const handleError = (error) => {
    console.error("Scanner error:", error);
    setError('Impossible d\'accéder à la caméra. Vérifiez vos permissions.');
  };

  return (
    <div className="flex-1 bg-background overflow-y-auto px-6 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-primary-dark font-bold hover:text-primary transition-colors">
            <IconChevronLeft size={20} />
            Retour
          </button>
          <span className="px-4 py-1.5 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/20 uppercase tracking-wider">
            Scanner
          </span>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-black/5 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
            <IconScan size={32} />
          </div>
          <h2 className="text-2xl font-display font-bold text-primary-dark mb-2">Scanner un Ticket</h2>
          <p className="text-gray-500 text-sm mb-8">Placez le QR Code du joueur au centre du cadre pour le valider.</p>

          <div className="rounded-2xl overflow-hidden border-4 border-dashed border-primary/20 relative aspect-square">
            <Scanner
              onScan={handleScan}
              onError={handleError}
              components={{ audio: false, finder: false }}
              styles={{ container: { width: '100%', height: '100%' } }}
            />
            {/* Visual overlay for scanning */}
            <div className="absolute inset-0 border-4 border-primary/40 rounded-xl m-8 pointer-events-none"></div>
          </div>

          {error && (
            <div className="mt-6 bg-red-50 text-red-600 p-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold">
              <IconAlertTriangle size={18} />
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
