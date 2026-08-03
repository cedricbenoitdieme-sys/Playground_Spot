import React, { useState, useEffect } from 'react';
import { 
  IconX, 
  IconAlertTriangle, 
  IconRocket, 
  IconLoader2, 
  IconAlertCircle, 
  IconMail, 
  IconShieldCheck,
  IconFlame,
  IconExternalLink,
  IconQrcode,
  IconCheck,
  IconRefresh
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { validatePhone } from '../lib/validators';
import { usePaymentFlow } from '../hooks/usePaymentFlow';
import { useGerantTerrains } from '../hooks/useGerantTerrains';
import { IS_PAIEMENT_ABONNEMENT_ACTIF } from '../config/paymentConfig';
import { VISIBILITY_BOOST_CONFIG } from '../config/plansConfig';
import waveLogo from '../assets/wave.png';
import omLogo from '../assets/orange_money.png';
import { Modal } from './Modal';

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
  const { status, error, plan: redirectPlan, start, reset } = usePaymentFlow();

  const [selectedTerrainId, setSelectedTerrainId] = useState(terrainId || '');
  const [budget, setBudget] = useState(budgetFcfa || VISIBILITY_BOOST_CONFIG.DEFAULT_BUDGET);
  const [duration, setDuration] = useState(dureeJours || VISIBILITY_BOOST_CONFIG.DEFAULT_DURATION);
  const [methode, setMethode] = useState('wave');
  const [telephone, setTelephone] = useState(currentUser?.tel || '');
  const [phoneError, setPhoneError] = useState(null);

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
    setPhoneError(check.valid ? null : (check.error || 'Format invalide'));
  }, [methode, telephone, isOpen]);

  // Réaction à l'état completed
  useEffect(() => {
    if (status === 'completed' && onSuccess) {
      onSuccess({ status: 'completed' });
    }
  }, [status, onSuccess]);

  if (!isOpen) return null;

  if (!IS_PAIEMENT_ABONNEMENT_ACTIF) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        center={false}
        className="flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4"
        overlayClassName="bg-black/80"
      >
        <div 
          className="bg-[#0F2318] border-t sm:border border-white/10 text-white rounded-t-[2.5rem] sm:rounded-3xl max-w-md w-full p-6 relative shadow-[0_-10px_40px_rgba(0,0,0,0.3)] space-y-6 animate-in slide-in-from-bottom-[100%] sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-400 ease-out transform-gpu"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Drag handle mobile */}
          <div className="sm:hidden w-12 h-1.5 bg-white/20 rounded-full mx-auto -mt-2 mb-2"></div>
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

          <div className="flex flex-col gap-3 pt-2">
            <a
              href="mailto:drixoftm@gmail.com?subject=Question%20boost%20de%20visibilit%C3%A9"
              rel="noopener noreferrer"
              className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-2xl text-center text-sm transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
            >
              <IconMail size={18} />
              <span>Contacter le support par email</span>
            </a>
            <button
              onClick={onClose}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl text-xs transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const isOrangeMoney = methode === 'orange_money';
  const isCreating = status === 'creating';
  const isSubmitDisabled = isCreating || !selectedTerrainId || (isOrangeMoney ? (!telephone || !telephone.trim() || Boolean(phoneError)) : (Boolean(telephone && telephone.trim() && phoneError)));

  const handlePhoneChange = (e) => {
    setTelephone(e.target.value);
  };

  const handleMethodChange = (newMethod) => {
    setMethode(newMethod);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedTerrainId) return;

    await start({
      kind: 'campaign',
      terrain_id: selectedTerrainId,
      budget: Number(budget),
      duration_days: Number(duration),
      payment_method: methode,
      customer_number: telephone.trim() || undefined,
    });
  };

  const handleCloseModal = () => {
    reset();
    onClose();
  };

  const selectedTerrainObj = terrains?.find(t => t.id === selectedTerrainId);
  const isForbiddenPlan = error?.includes('Starter') || error?.includes('403') || error?.includes('plan');

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseModal}
      center={false}
      className="flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4"
      overlayClassName="bg-black/80"
    >
      <div 
        className="bg-[#0F2318] border-t sm:border border-white/10 text-white rounded-t-[2.5rem] sm:rounded-3xl max-w-md w-full p-6 relative shadow-[0_-10px_40px_rgba(0,0,0,0.3)] space-y-5 overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom-[100%] sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-400 ease-out transform-gpu"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Drag handle mobile */}
        <div className="sm:hidden w-12 h-1.5 bg-white/20 rounded-full mx-auto -mt-2 mb-1 shrink-0"></div>
        
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
            onClick={handleCloseModal}
            className="p-2 text-white/50 hover:text-white rounded-full bg-white/5 transition-colors cursor-pointer"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* ── ÉTAT REDIRECTING ── */}
        {status === 'redirecting' ? (
          <div className="py-6 text-center space-y-5 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto animate-pulse">
              <IconLoader2 size={36} className="animate-spin" />
            </div>
            
            <div className="space-y-1">
              <h4 className="font-bold text-lg text-white">Ouverture de votre application de paiement…</h4>
              <p className="text-xs text-white/70 max-w-xs mx-auto leading-relaxed">
                Si l'application ne s'ouvre pas automatiquement, cliquez ci-dessous sur le lien de secours.
              </p>
            </div>

            {/* Lien de secours visible dès l'écran de redirection */}
            {redirectPlan?.fallbackUrl && (
              <div className="pt-2 space-y-2">
                <a
                  href={redirectPlan.fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-amber-500 hover:bg-amber-600 text-black rounded-2xl text-xs font-bold transition-all shadow-lg w-full"
                >
                  <IconExternalLink size={16} />
                  <span>Ouvrir l'application de paiement ({methode === 'wave' ? 'Wave' : 'Max It / OM'})</span>
                </a>
              </div>
            )}
          </div>
        ) : status === 'waiting' ? (
          /* ── ÉTAT WAITING / DESKTOP WITH QR CODE ── */
          <div className="py-6 text-center space-y-5 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto animate-pulse">
              <IconLoader2 size={36} className="animate-spin" />
            </div>
            
            <div className="space-y-1">
              <h4 className="font-bold text-lg text-white">Attente de confirmation du boost</h4>
              <p className="text-xs text-white/70 max-w-xs mx-auto leading-relaxed">
                {redirectPlan?.stayOnPage
                  ? `Scannez le code avec l'application ${methode === 'wave' ? 'Wave' : 'Orange Money'} depuis votre téléphone.`
                  : `Veuillez valider la transaction sur votre téléphone${telephone ? ` (${telephone})` : ''}.`}
              </p>
            </div>

            {/* Affichage du QR Code si disponible */}
            {redirectPlan?.qrCode && (
              <div className="p-4 bg-white rounded-2xl border border-white/20 text-black max-w-[220px] mx-auto space-y-2 shadow-lg">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-800">
                  <IconQrcode size={18} />
                  <span>Scanner avec votre téléphone</span>
                </div>
                <img src={redirectPlan.qrCode} alt="QR Code Paiement" className="w-full h-auto rounded-lg border border-gray-200" />
              </div>
            )}

            {/* Lien de secours permanent */}
            {redirectPlan?.fallbackUrl && (
              <div className="pt-2 space-y-2">
                <a
                  href={redirectPlan.fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl text-xs font-bold transition-all shadow-md w-full"
                >
                  <IconExternalLink size={16} />
                  <span>Ouvrir l'application de paiement</span>
                </a>
              </div>
            )}
          </div>
        ) : status === 'completed' ? (
          /* ── ÉTAT COMPLETED ── */
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
              onClick={handleCloseModal}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl text-sm transition-all shadow-lg"
            >
              Fermer
            </button>
          </div>
        ) : status === 'timeout' ? (
          /* ── ÉTAT TIMEOUT ── */
          <div className="py-6 text-center space-y-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <IconAlertTriangle size={32} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base text-amber-300">Paiement non confirmé après 5 minutes</h4>
              <p className="text-xs text-white/60 max-w-xs mx-auto leading-relaxed">
                Le délai de confirmation a expiré. Si vous avez bien été débité, votre boost sera activé sous peu.
              </p>
            </div>

            {redirectPlan?.fallbackUrl && (
              <a
                href={redirectPlan.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition-all w-full"
              >
                <IconExternalLink size={16} />
                <span>Ouvrir l'application de paiement</span>
              </a>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <a
                href="mailto:drixoftm@gmail.com?subject=Paiement%20boost%20en%20attente"
                rel="noopener noreferrer"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <IconMail size={16} />
                <span>Contacter le support par email</span>
              </a>
              <button
                onClick={reset}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <IconRefresh size={14} />
                <span>Réessayer la campagne</span>
              </button>
            </div>
          </div>
        ) : status === 'failed' ? (
          /* ── ÉTAT FAILED ── */
          <div className="py-6 text-center space-y-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <IconAlertCircle size={32} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base text-red-300">Échec de l'initialisation</h4>
              <p className="text-xs text-white/70 max-w-xs mx-auto leading-relaxed">
                {error || 'La transaction n\'a pas pu être initialisée.'}
              </p>
            </div>

            {isForbiddenPlan && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleCloseModal();
                    if (onOpenPricing) onOpenPricing();
                    else window.location.href = '/?view=gerant-tarifs';
                  }}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                >
                  Découvrir les offres Starter / Pro
                </button>
              </div>
            )}

            <button
              onClick={reset}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl text-sm transition-all shadow-lg cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        ) : (
          /* ── FORMULAIRE INITIAL ── */
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
                  autoComplete="tel"
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

            {/* Bouton de Soumission */}
            <div className="pt-2 space-y-3">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-600/40 text-black font-bold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? (
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
    </Modal>
  );
};
