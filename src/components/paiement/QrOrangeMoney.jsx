import React, { useState } from 'react';
import { IconQrcode, IconExternalLink, IconAlertCircle, IconClock, IconRefresh, IconArrowLeft } from '@tabler/icons-react';
import orangeMoneyLogo from '../../assets/orange_money.png';

/**
 * Composant de paiement par QR Code Orange Money & Deep Links (Max It / OM)
 * Gère le cas où qr_code ET deep_links sont tous deux null.
 */
export const QrOrangeMoney = ({ paymentData, onRegenerate, onBack }) => {
  const { qr_code, deep_links, expire_dans = 300 } = paymentData || {};
  const [timeLeft, setTimeLeft] = useState(expire_dans);
  const [isExpired, setIsExpired] = useState(false);

  React.useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsExpired(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const hasQrOrLinks = Boolean(qr_code || (deep_links && (deep_links.MAXIT || deep_links.OM)));

  // Addendum #3: Si qr_code ET deep_links sont nulls
  if (!hasQrOrLinks) {
    return (
      <div className="bg-white rounded-card p-6 border border-orange-200 shadow-subtle text-center space-y-4">
        <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mx-auto">
          <IconAlertCircle size={28} />
        </div>
        <div>
          <h3 className="font-bold text-lg text-primary-dark">QR Code temporairement indisponible</h3>
          <p className="text-sm text-gray-500 mt-1">
            Le service Orange Money QR n'a pas pu générer l'image. Veuillez réessayer avec Wave ou Orange Money standard.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="w-full py-3 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2"
            >
              <IconArrowLeft size={18} /> Choisir un autre moyen
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card p-6 border border-orange-100 shadow-subtle text-center space-y-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <img src={orangeMoneyLogo} alt="Orange Money" className="w-8 h-8 object-contain" />
          <span className="font-bold text-primary-dark">Paiement Orange QR / App</span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${
          isExpired ? 'bg-red-100 text-red-700' : 'bg-orange-50 text-orange-600 border border-orange-200'
        }`}>
          <IconClock size={14} />
          {isExpired ? 'Expiré' : formatSeconds(timeLeft)}
        </div>
      </div>

      {isExpired ? (
        <div className="py-8 space-y-4">
          <p className="text-sm font-semibold text-red-600">Ce code QR a expiré.</p>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="px-6 py-3 bg-orange-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 mx-auto"
            >
              <IconRefresh size={18} /> Régénérer le code QR
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Version Deep Links (Mobile First) */}
          {deep_links && (deep_links.MAXIT || deep_links.OM) && (
            <div className="space-y-3 bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
              <p className="text-xs font-bold text-orange-950 uppercase tracking-wider">
                Ouvrir directement dans votre application mobile :
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {deep_links.MAXIT && (
                  <a
                    href={deep_links.MAXIT}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 bg-[#FF6600] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-[#e05500] transition-colors shadow-sm"
                  >
                    Ouvrir Max It <IconExternalLink size={16} />
                  </a>
                )}
                {deep_links.OM && (
                  <a
                    href={deep_links.OM}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 bg-primary-dark text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-sm"
                  >
                    Ouvrir Orange Money <IconExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Version QR Code (pour desktop / scan depuis un autre appareil) */}
          {qr_code && (
            <div className="space-y-2 pt-2">
              <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-orange-200 inline-block shadow-sm">
                <img
                  src={qr_code.startsWith('data:') ? qr_code : `data:image/png;base64,${qr_code}`}
                  alt="Code QR Orange Money"
                  className="w-48 h-48 object-contain mx-auto"
                />
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Scannez ce QR Code avec l'application Orange Money ou Max It.
              </p>
            </div>
          )}
        </>
      )}

      {onBack && (
        <button
          onClick={onBack}
          className="text-xs font-bold text-gray-500 hover:text-primary transition-colors underline pt-2"
        >
          Retour au choix des moyens de paiement
        </button>
      )}
    </div>
  );
};
