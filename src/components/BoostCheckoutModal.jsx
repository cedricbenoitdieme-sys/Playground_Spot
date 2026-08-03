import React, { useState, useEffect, useRef } from 'react';
import { 
  IconX, 
  IconAlertTriangle, 
  IconRocket, 
  IconLoader2, 
  IconAlertCircle, 
  IconBrandWhatsapp, 
  IconShieldCheck,
  IconFlame,
  IconExternalLink,
  IconQrcode,
  IconCheck
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { validatePhone } from '../lib/validators';
import { initiateBoostPayment, getPaymentStatus } from '../services/subscriptions';
import { useGerantTerrains } from '../hooks/useGerantTerrains';
import { IS_PAIEMENT_ABONNEMENT_ACTIF } from '../config/paymentConfig';
import { VISIBILITY_BOOST_CONFIG } from '../config/plansConfig';
import waveLogo from '../assets/wave.png';
import omLogo from '../assets/orange_money.png';

export const BoostCheckoutModal = ({ 
  isOpen, 
  onClose, 
  terrainId, 
  budgetFcfa = VISIBILITY_BOOST_CONFIG.DEFAULT_BUDGET, 
  dureeJours = VISIBILITY_BOOST_CONFIG.DEFAULT_DURATION, 
  onSuccess,
  onOpenPricing
}) => {
  const { currentUser } = useUser();
  const { terrains } = useGerantTerrains(currentUser?.id);

  const [selectedTerrainId, setSelectedTerrainId] = useState(terrainId || '');
  const [budget, setBudget] = useState(budgetFcfa || VISIBILITY_BOOST_CONFIG.DEFAULT_BUDGET);
  const [duration, setDuration] = useState(dureeJours || VISIBILITY_BOOST_CONFIG.DEFAULT_DURATION);
  const [methode, setMethode] = useState('wave'); // 'wave' | 'orange_money'
  const [telephone, setTelephone] = useState(currentUser?.tel || '');
  const [phoneError, setPhoneError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isForbiddenPlanError, setIsForbiddenPlanError] = useState(false);
  const [isGatewayError, setIsGatewayError] = useState(false);

  // States for Payment Response & Polling
  const [paymentData, setPaymentData] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null); // null | 'polling' | 'completed' | 'timeout' | 'failed'
  const pollTimerRef = useRef(null);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    if (terrainId) setSelectedTerrainId(terrainId);
    if (budgetFcfa) setBudget(budgetFcfa);
    if (dureeJours) setDuration(dureeJours);
  }, [terrainId, budgetFcfa, dureeJours]);

  useEffect(() => {
    if (!selectedTerrainId && terrains && terrains.length > 0) {
      setSelectedTerrainId(terrains[0].id);
    }
  }, [terrains, selectedTerrainId]);

  useEffect(() => {
    if (currentUser?.tel && !telephone) {
      setTelephone(currentUser.tel);
    }
  }, [currentUser]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Validation dynamique du téléphone
  useEffect(() => {
    if (!isOpen) return;
    const isRequired = methode === 'orange_money';
    const isOM = methode === 'orange_money';

    if (!isRequired && (!telephone || !telephone.trim())) {
      setPhoneError(null);
      return;
    }

    const check = validatePhone(telephone, isRequired, isOM);
    setPhoneError(check.valid ? null : check.error);
  }, [methode, telephone, isOpen]);

  if (!isOpen) return null;

  if (!IS_PAIEMENT_ABONNEMENT_ACTIF) {
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
  }

  const handlePhoneChange = (e) => {
    setTelephone(e.target.value);
    setApiError(null);
    setIsForbiddenPlanError(false);
  };

  const handleMethodChange = (newMethod) => {
    setMethode(newMethod);
    setApiError(null);
    setIsForbiddenPlanError(false);
  };

  const startStatusPolling = (paymentId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setPollingStatus('polling');
    pollAttemptsRef.current = 0;
    const maxAttempts = 100; // 100 * 3s = 300s (5 minutes)

    pollTimerRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;
      const statusData = await getPaymentStatus(paymentId);
      const currentStatus = statusData?.status || statusData?.statut;

      if (currentStatus === 'completed') {
        clearInterval(pollTimerRef.current);
        setPollingStatus('completed');
        setLoading(false);
        if (onSuccess) onSuccess({ ...paymentData, status: 'completed' });
      } else if (currentStatus === 'failed' || currentStatus === 'cancelled') {
        clearInterval(pollTimerRef.current);
        setPollingStatus('failed');
        setLoading(false);
        setApiError('Le paiement du boost de visibilité a été annulé ou a échoué.');
      } else if (pollAttemptsRef.current >= maxAttempts) {
        clearInterval(pollTimerRef.current);
        setPollingStatus('timeout');
        setLoading(false);
      }
    }, 3000);
  };

  const isOrangeMoney = methode === 'orange_money';
  const isSubmitDisabled = loading || !selectedTerrainId || (isOrangeMoney ? (!telephone || !telephone.trim() || Boolean(phoneError)) : (Boolean(telephone && telephone.trim() && phoneError)));

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!selectedTerrainId) {
      setApiError('Veuillez sélectionner un terrain à booster.');
      return;
    }

    const isRequired = methode === 'orange_money';
    const isOM = methode === 'orange_money';

    const phoneCheck = validatePhone(telephone, isRequired, isOM);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error);
      return;
    }

    setPhoneError(null);
    setApiError(null);
    setIsForbiddenPlanError(false);
    setIsGatewayError(false);
    setLoading(true);

    try {
      const response = await initiateBoostPayment({
        terrain_id: selectedTerrainId,
        budget: Number(budget),
        duration_days: Number(duration),
        phone_number: phoneCheck.sanitized || telephone.trim() || '',
        mode: methode
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      setPaymentData(response);

      const redirectUrl = response?.deep_links?.MAXIT || response?.deep_links?.OM || response?.payment_url;

      if (redirectUrl && !response?.qr_code) {
        window.location.href = redirectUrl;
      }

      const paymentId = response?.payment_id || response?.id || response?.paymentId;
      if (paymentId) {
        startStatusPolling(paymentId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      const msg = err?.error || err?.message || 'Une erreur est survenue lors du paiement du boost.';

      if (err?.isForbiddenPlan || msg.includes('403') || msg.includes('Starter') || msg.includes('plan')) {
        setIsForbiddenPlanError(true);
        setApiError('Ce module nécessite un abonnement Starter ou supérieur.');
      } else if (msg.includes('502') || msg.toLowerCase().includes('passerelle') || msg.toLowerCase().includes('gateway')) {
        setIsGatewayError(true);
        setApiError('La passerelle de paiement rencontre un souci technique (502). Vous pouvez activer votre boost via WhatsApp.');
      } else {
        setApiError(msg);
      }
    }
  };

  const selectedTerrainObj = terrains?.find(t => t.id === selectedTerrainId);
  const redirectUrl = paymentData?.deep_links?.MAXIT || paymentData?.deep_links?.OM || paymentData?.payment_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0F2318] border border-white/10 text-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl space-y-5 overflow-y-auto max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <IconRocket size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold font-display leading-snug">Boost de visibilité</h3>
              <p className="text-[11px] text-white/50">Mettez votre terrain en avant sur Dakar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-white/50 hover:text-white rounded-full bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Polling / Processing state */}
        {pollingStatus === 'polling' ? (
          <div className="py-6 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto animate-pulse">
              <IconLoader2 size={36} className="animate-spin" />
            </div>
            
            <div className="space-y-1">
              <h4 className="font-bold text-lg text-white">Attente de confirmation du boost</h4>
              <p className="text-xs text-white/70 max-w-xs mx-auto leading-relaxed">
                Veuillez valider la transaction sur votre application {methode === 'wave' ? 'Wave' : 'Orange Money / Max It'}{telephone ? ` sur le ${telephone}` : ''}.
              </p>
            </div>

            {/* Display Orange Money QR Code safely if present */}
            {paymentData?.qr_code && (
              <div className="p-4 bg-white rounded-2xl border border-white/20 text-black max-w-[220px] mx-auto space-y-2 shadow-lg">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-orange-600">
                  <IconQrcode size={18} />
                  <span>Scannez le QR Code Orange Money</span>
                </div>
                <img src={paymentData.qr_code} alt="QR Code Orange Money" className="w-full h-auto rounded-lg border border-gray-200" />
                <p className="text-[10px] text-gray-600 text-center">
                  Ouvrez Orange Money / Maxit et scannez ce code pour valider le règlement.
                </p>
              </div>
            )}

            {/* Always provide fallback link to payment_url */}
            {redirectUrl && (
              <div className="pt-2 space-y-2">
                <a
                  href={redirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl text-xs font-bold transition-all shadow-md w-full"
                >
                  <IconExternalLink size={16} />
                  <span>Ouvrir l'application {methode === 'wave' ? 'Wave' : 'Orange Money / Maxit'}</span>
                </a>
                <p className="text-[11px] text-white/40">
                  Vous avez fermé l'app par erreur ? Cliquez ci-dessus pour y retourner.
                </p>
              </div>
            )}
          </div>
        ) : pollingStatus === 'completed' ? (
          <div className="py-8 text-center space-y-4 animate-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <IconCheck size={36} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-xl text-emerald-400">Boost activé avec succès !</h4>
              <p className="text-xs text-white/70">
                Votre terrain est désormais propulsé en tête des résultats de recherche.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl text-sm transition-all shadow-lg"
            >
              Fermer
            </button>
          </div>
        ) : pollingStatus === 'timeout' ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <IconAlertTriangle size={32} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base text-amber-300">Paiement non confirmé — contactez le support</h4>
              <p className="text-xs text-white/60 max-w-xs mx-auto leading-relaxed">
                Le délai de confirmation de 5 minutes a expiré. Si vous avez bien été débité, votre boost sera activé sous peu.
              </p>
            </div>

            {redirectUrl && (
              <a
                href={redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition-all w-full"
              >
                <IconExternalLink size={16} />
                <span>Réessayer sur l'application opérateur</span>
              </a>
            )}

            <a
              href="https://wa.me/221770000000?text=Bonjour,%20mon%20paiement%20de%20boost%20est%20en%20attente%20de%20confirmation"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <IconBrandWhatsapp size={16} />
              <span>Contacter le support WhatsApp</span>
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Sélection Terrain si plusieurs */}
            {terrains && terrains.length > 1 && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Terrain à booster</label>
                <select
                  value={selectedTerrainId}
                  onChange={(e) => setSelectedTerrainId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-all"
                >
                  {terrains.map(t => (
                    <option key={t.id} value={t.id} className="bg-[#0F2318] text-white">
                      {t.name || t.nom} ({t.quartier || 'Dakar'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Récapitulatif du Boost */}
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">
                  {selectedTerrainObj?.name || selectedTerrainObj?.nom || 'Terrain'} · {duration} jours
                </p>
                <p className="text-lg font-bold text-amber-400">
                  {Number(budget).toLocaleString('fr-FR')} FCFA
                </p>
              </div>
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full uppercase flex items-center gap-1">
                <IconFlame size={12} /> Visibilité Max
              </span>
            </div>

            {/* Choix Méthode de paiement */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Moyen de paiement</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleMethodChange('wave')}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${methode === 'wave' ? 'border-primary bg-primary/10 shadow-md' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <img src={waveLogo} alt="Wave" className="w-8 h-8 object-contain rounded-lg" />
                  <span className={`text-xs font-bold ${methode === 'wave' ? 'text-primary' : 'text-white/70'}`}>Wave</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleMethodChange('orange_money')}
                  className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${methode === 'orange_money' ? 'border-primary bg-primary/10 shadow-md' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <img src={omLogo} alt="Orange Money" className="w-8 h-8 object-contain rounded-lg" />
                  <span className={`text-xs font-bold ${methode === 'orange_money' ? 'text-primary' : 'text-white/70'}`}>Orange Money</span>
                </button>
              </div>
            </div>

            {/* Numéro Sénégalais (Requis pour Orange Money, optionnel pour Wave) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider">
                  Numéro de téléphone ({methode === 'wave' ? 'Wave' : 'Orange Money'})
                </label>
                {isOrangeMoney ? (
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                    * Obligatoire
                  </span>
                ) : (
                  <span className="text-[10px] text-white/40 font-normal">
                    (Optionnel)
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="tel"
                  value={telephone}
                  onChange={handlePhoneChange}
                  placeholder={isOrangeMoney ? "77 000 00 00 (ex: 77 123 45 67)" : "77 000 00 00 (Optionnel pour Wave)"}
                  className={`w-full bg-white/5 border rounded-2xl px-4 py-3 text-sm text-white focus:outline-none transition-all ${
                    phoneError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-primary'
                  }`}
                />
              </div>

              {phoneError && (
                <p className="text-xs text-red-400 font-medium flex items-center gap-1">
                  <IconAlertCircle size={14} className="shrink-0 text-red-400" />
                  <span>{phoneError}</span>
                </p>
              )}
            </div>

            {/* Messages d'erreur API, Forbidden 403 & Fallback Passerelle 502 */}
            {apiError && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300 space-y-3">
                <p className="flex items-center gap-1.5 font-semibold">
                  <IconAlertCircle size={16} className="shrink-0 text-red-400" /> {apiError}
                </p>

                {isForbiddenPlanError && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onOpenPricing) onOpenPricing();
                        else window.location.href = '/?view=gerant-tarifs';
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                    >
                      Voir les offres Starter / Pro
                    </button>
                  </div>
                )}

                {isGatewayError && (
                  <a
                    href={`https://wa.me/221770000000?text=Bonjour,%20je%20souhaite%20booster%20mon%20terrain%20(Erreur%20502)`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    <IconBrandWhatsapp size={14} /> Contacter sur WhatsApp
                  </a>
                )}
              </div>
            )}

            {/* Bouton de Soumission */}
            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-600/40 text-black font-bold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <IconLoader2 size={18} className="animate-spin" />
                    Initialisation du boost...
                  </>
                ) : (
                  <>
                    <IconShieldCheck size={18} />
                    Activer le Boost ({Number(budget).toLocaleString('fr-FR')} FCFA)
                  </>
                )}
              </button>

              <p className="text-[10px] text-center text-white/40">
                Paiement crypté et sécurisé par la passerelle UnitechPay.
              </p>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};
