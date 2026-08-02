import React, { useState, useEffect } from 'react';
import { useUser } from '../../context/UserContext';
import { validatePhone } from '../../lib/validators';
import { invokeCreatePayment, formatFCFA } from '../../services/payment';
import { IS_PAIEMENT_RESERVATION_ACTIF } from '../../config/paymentConfig';
import { QrOrangeMoney } from './QrOrangeMoney';
import { 
  IconCircleCheckFilled, 
  IconLoader2, 
  IconPhone, 
  IconAlertCircle,
  IconArrowRight,
  IconShieldCheck,
  IconBrandWhatsapp
} from '@tabler/icons-react';
import waveLogo from '../../assets/wave.png';
import omLogo from '../../assets/orange_money.png';

/**
 * Composant ChoixPaiement
 * 
 * Contrat & Sécurité :
 * - Montant affiché à titre indicatif uniquement. Le client N'ENVOIE JAMAIS de montant au serveur.
 * - Saisie téléphone sénégalais (77, 78, 76, 70).
 * - Anti double-clic : bouton désactivé pendant le chargement et verrouillé ensuite.
 * - Redirection automatique ou affichage QR.
 * - Feature Flag : VITE_PAIEMENT_RESERVATION_ACTIF
 * - Fallback WhatsApp en cas d'erreur 502 (passerelle indisponible).
 */
export const ChoixPaiement = ({ 
  creneau, 
  terrain, 
  onRefreshPlanning, 
  onPaymentInitiated 
}) => {
  const { currentUser } = useUser();
  const [methode, setMethode] = useState('wave'); // 'wave' | 'orange_money' | 'orange_maxit' | 'orange_qr'
  const [telephone, setTelephone] = useState(currentUser?.tel || '');
  const [phoneError, setPhoneError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentLocked, setPaymentLocked] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isGatewayError, setIsGatewayError] = useState(false);
  const [qrResponseData, setQrResponseData] = useState(null);

  // Pré-remplir depuis currentUser.tel s'il change
  useEffect(() => {
    if (currentUser?.tel && !telephone) {
      setTelephone(currentUser.tel);
    }
  }, [currentUser]);

  // Calcul indicatif du montant affiché
  const dureeHeures = creneau?.heure_debut && creneau?.heure_fin
    ? Math.round((new Date(`1970-01-01T${creneau.heure_fin}`) - new Date(`1970-01-01T${creneau.heure_debut}`)) / 3600000)
    : 1;
  const montantIndicatif = creneau?.prix_override ?? ((terrain?.price || 0) * dureeHeures);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setTelephone(val);
    setPhoneError(null);
    setApiError(null);
  };

  const isFormValid = Boolean(
    IS_PAIEMENT_RESERVATION_ACTIF && 
    telephone && 
    validatePhone(telephone).valid && 
    !paymentLocked && 
    !loading
  );

  const handleSubmitPaiement = async (e) => {
    if (e) e.preventDefault();

    if (!IS_PAIEMENT_RESERVATION_ACTIF) {
      setApiError("Le paiement en ligne des réservations est temporairement désactivé.");
      return;
    }

    const phoneCheck = validatePhone(telephone);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error);
      return;
    }

    setPhoneError(null);
    setApiError(null);
    setIsGatewayError(false);
    setLoading(true);
    setPaymentLocked(true); // Verrouiller immédiatement pour éviter double-clic

    try {
      const response = await invokeCreatePayment({
        creneauId: creneau?.id,
        methode,
        telephone: phoneCheck.sanitized || telephone,
      });

      // Persister l'identifiant dans sessionStorage avant redirection
      if (response.reservation_id) {
        sessionStorage.setItem('pending_reservation_id', response.reservation_id);
      }

      if (onPaymentInitiated) {
        onPaymentInitiated(response);
      }

      // Traitement du résultat
      if (methode === 'orange_qr' || response.qr_code) {
        setQrResponseData(response);
        setLoading(false);
      } else if (response.payment_url) {
        // Redirection navigateur vers le guichet de paiement
        window.location.href = response.payment_url;
      } else {
        // Si aucune URL ni QR mais reservation_id créé -> aller direct sur la page d'attente
        window.location.href = `/paiement/attente?resa=${response.reservation_id}`;
      }
    } catch (err) {
      setLoading(false);
      setPaymentLocked(false); // Débloquer en cas d'échec pour permettre de réessayer
      
      const code = err.code;
      const msg = err.error || 'Une erreur est survenue lors de l’initialisation du paiement.';
      
      // Détection erreur 502 / passerelle
      if (code === '502' || String(msg).includes('502') || String(msg).toLowerCase().includes('passerelle')) {
        setIsGatewayError(true);
        setApiError("La passerelle de paiement rencontre un souci technique (502). Vous pouvez réserver directement auprès de l'équipe sur WhatsApp.");
      } else if (code === 'creneau_deja_reserve') {
        setApiError("Ce créneau vient d'être pris. Choisis-en un autre.");
        if (onRefreshPlanning) onRefreshPlanning();
      } else if (code === 'creneau_indisponible') {
        setApiError("Ce créneau n'est plus disponible.");
        if (onRefreshPlanning) onRefreshPlanning();
      } else if (code === 'creneau_passe') {
        setApiError("Ce créneau est déjà passé.");
      } else if (code === 'terrain_inactif') {
        setApiError("Ce terrain n'accepte plus de réservations.");
      } else if (code === 'non_authentifie') {
        setApiError("Connecte-toi pour réserver.");
      } else if (code === 'creneau_introuvable') {
        setApiError("Ce créneau n'existe pas. Rafraîchis la page.");
        if (onRefreshPlanning) onRefreshPlanning();
      } else if (code === 'montant_invalide') {
        setApiError("Une erreur est survenue sur le tarif de ce créneau, contacte le support.");
      } else {
        setApiError(msg);
      }
    }
  };

  // Si le QR code a été reçu
  if (qrResponseData) {
    return (
      <QrOrangeMoney
        paymentData={qrResponseData}
        onBack={() => {
          setQrResponseData(null);
          setPaymentLocked(false);
        }}
        onRegenerate={() => {
          setQrResponseData(null);
          setPaymentLocked(false);
          handleSubmitPaiement();
        }}
      />
    );
  }

  return (
    <div className="bg-white rounded-card border border-black/5 shadow-subtle p-6 lg:p-8 space-y-6">
      {/* 1. Récapitulatif Indicatif */}
      <div className="bg-primary/5 rounded-2xl p-5 border border-primary/10 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-bold text-primary-dark text-lg">{terrain?.nom || 'Terrain de foot'}</h4>
            <p className="text-xs text-gray-500 font-medium">
              {creneau?.date ? new Date(creneau.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date choisie'}
            </p>
          </div>
          <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">
            {creneau?.heure_debut?.slice(0, 5)} - {creneau?.heure_fin?.slice(0, 5)}
          </span>
        </div>

        <div className="border-t border-primary/10 pt-3 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Montant total</span>
          <span className="text-xl font-black text-primary-dark font-display">
            {formatFCFA(montantIndicatif)}
          </span>
        </div>
      </div>

      {/* 2. Messages d'erreur API & Suspension / Fallback Passerelle 502 */}
      {!IS_PAIEMENT_RESERVATION_ACTIF && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 text-amber-800 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <IconAlertCircle size={20} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <p className="text-xs font-bold leading-relaxed">
              Le paiement mobile en ligne des réservations est actuellement en maintenance. Vous pouvez réserver votre créneau directement auprès de notre support.
            </p>
          </div>
          <a
            href="https://wa.me/221770000000?text=Bonjour,%20je%20souhaite%20r%C3%A9server%20un%20terrain"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <IconBrandWhatsapp size={18} />
            <span>Réserver via WhatsApp</span>
          </a>
        </div>
      )}

      {apiError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-3 text-red-700 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <IconAlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p className="text-xs font-bold leading-relaxed">{apiError}</p>
          </div>
          {isGatewayError && (
            <a
              href="https://wa.me/221770000000?text=Bonjour,%20la%20passerelle%20de%20paiement%20rencontre%20un%20souci%20(502),%20je%20souhaite%20valider%20ma%20r%C3%A9servation"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <IconBrandWhatsapp size={18} />
              <span>Contacter le support WhatsApp</span>
            </a>
          )}
        </div>
      )}

      {/* 3. Choix de la méthode */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
          Moyen de paiement mobile
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Wave */}
          <button
            type="button"
            disabled={paymentLocked}
            onClick={() => setMethode('wave')}
            className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
              methode === 'wave'
                ? 'border-[#1DB954] bg-[#1DB954]/5 shadow-sm'
                : 'border-gray-100 bg-white hover:border-gray-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1DB954]/10 p-1 flex items-center justify-center">
                <img src={waveLogo} alt="Wave" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm text-primary-dark">Wave</p>
                <p className="text-[10px] text-gray-400 font-medium">Paiement instantané</p>
              </div>
            </div>
            {methode === 'wave' && <IconCircleCheckFilled className="text-[#1DB954]" size={20} />}
          </button>

          {/* Orange Money */}
          <button
            type="button"
            disabled={paymentLocked}
            onClick={() => setMethode('orange_money')}
            className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
              methode === 'orange_money'
                ? 'border-[#FF6600] bg-[#FF6600]/5 shadow-sm'
                : 'border-gray-100 bg-white hover:border-gray-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#FF6600]/10 p-1 flex items-center justify-center">
                <img src={omLogo} alt="Orange Money" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm text-primary-dark">Orange Money</p>
                <p className="text-[10px] text-gray-400 font-medium">Via USSD #144# / App</p>
              </div>
            </div>
            {methode === 'orange_money' && <IconCircleCheckFilled className="text-[#FF6600]" size={20} />}
          </button>
        </div>

        {/* Variantes Orange (Max It / QR Code) */}
        <div className="pt-2 flex gap-4 text-xs font-bold text-gray-500">
          <span className="text-[10px] text-gray-400">Variantes disponibles :</span>
          <button
            type="button"
            onClick={() => setMethode('orange_maxit')}
            className={`hover:underline ${methode === 'orange_maxit' ? 'text-[#FF6600] font-black' : ''}`}
          >
            Orange Max It
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => setMethode('orange_qr')}
            className={`hover:underline ${methode === 'orange_qr' ? 'text-[#FF6600] font-black' : ''}`}
          >
            Orange QR Code
          </button>
        </div>
      </div>

      {/* 4. Champ Téléphone */}
      <form onSubmit={handleSubmitPaiement} className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
            Numéro de téléphone mobile (Sénégal)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
              <IconPhone size={18} />
            </div>
            <input
              type="tel"
              disabled={paymentLocked}
              value={telephone}
              onChange={handlePhoneChange}
              placeholder="77 123 45 67 ou +221 78..."
              className={`w-full pl-11 pr-4 py-3.5 bg-gray-50 rounded-2xl text-sm font-bold text-primary-dark border transition-all outline-none ${
                phoneError ? 'border-red-400 bg-red-50/20' : 'border-gray-200 focus:border-primary focus:bg-white'
              }`}
            />
          </div>
          {phoneError && (
            <p className="text-xs text-red-500 font-bold mt-1.5">{phoneError}</p>
          )}
        </div>

        {/* 5. Bouton de Paiement */}
        <button
          type="submit"
          disabled={!isFormValid}
          className={`w-full py-4 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all ${
            !isFormValid
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
              : 'bg-primary text-white hover:bg-primary-dark active:scale-[0.99]'
          }`}
        >
          {loading ? (
            <>
              <IconLoader2 className="animate-spin" size={20} />
              <span>Initialisation du paiement...</span>
            </>
          ) : (
            <>
              <span>Payer {formatFCFA(montantIndicatif)} via {methode === 'wave' ? 'Wave' : 'Orange'}</span>
              <IconArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 font-medium pt-2">
        <IconShieldCheck size={16} className="text-primary" />
        <span>Paiement sécurisé crypté par UnitechPay</span>
      </div>
    </div>
  );
};
