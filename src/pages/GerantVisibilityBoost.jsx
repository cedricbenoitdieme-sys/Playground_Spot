import React, { useState, useEffect } from 'react';
import { 
  IconRocket, 
  IconEye, 
  IconLock, 
  IconSparkles, 
  IconTrendingUp,
  IconAlertCircle, 
  IconCheck, 
  IconLoader2,
  IconFlame
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { TerrainImage } from '../components/TerrainImage';
import { useGerantTerrains } from '../hooks/useGerantTerrains';
import { BoostCheckoutModal } from '../components/BoostCheckoutModal';
import {
  fetchUserPlanAndLimits,
  fetchGerantBoosts
} from '../services/subscriptions';
import { VISIBILITY_BOOST_CONFIG } from '../config/plansConfig';

export const GerantVisibilityBoost = ({ setView }) => {
  const { currentUser } = useUser();
  const { terrains, loading: terrainsLoading } = useGerantTerrains(currentUser?.id);
  const [userPlan, setUserPlan] = useState(null);
  const [boosts, setBoosts] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const loading = loadingInitial || terrainsLoading;

  // Form State using VISIBILITY_BOOST_CONFIG constants
  const [selectedTerrainId, setSelectedTerrainId] = useState('');
  const [budget, setBudget] = useState(VISIBILITY_BOOST_CONFIG.DEFAULT_BUDGET); // 5000 FCFA
  const [duration, setDuration] = useState(VISIBILITY_BOOST_CONFIG.DEFAULT_DURATION); // 7 Jours
  const [showCheckout, setShowCheckout] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Social Proof Dynamic Count
  const socialProofCount = 14;

  useEffect(() => {
    if (terrains.length > 0 && !selectedTerrainId) {
      setSelectedTerrainId(terrains[0].id);
    }
  }, [terrains, selectedTerrainId]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (!currentUser?.id) return;
      setLoadingInitial(true);
      try {
        const [planData, boostsList] = await Promise.all([
          fetchUserPlanAndLimits(currentUser.id),
          fetchGerantBoosts(currentUser.id),
        ]);

        setUserPlan(planData);
        setBoosts(boostsList);
      } catch (err) {
        console.error('Erreur chargement données visibilité:', err);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadInitialData();
  }, [currentUser]);

  const isFreePlan = !userPlan || userPlan.plan_id === 'free';

  // Projection d'estimation des vues (Formule indicative budget / 10 * durée/7)
  const estimatedViews = Math.round((budget / 10) * (duration / 7));

  const isBoostCurrentlyActive = (b) =>
    b.statut === 'actif' && b.date_fin && new Date(b.date_fin) >= new Date(new Date().toDateString());

  const handleCreateBoost = (e) => {
    e.preventDefault();
    if (isFreePlan) {
      setErrorMsg('Ce module nécessite un abonnement Starter ou supérieur.');
      return;
    }
    if (!selectedTerrainId) {
      setErrorMsg('Veuillez sélectionner un terrain à booster.');
      return;
    }

    // Valide que le budget est bien un multiple de 500
    if (budget % VISIBILITY_BOOST_CONFIG.BUDGET_STEP !== 0) {
      setErrorMsg('Le budget doit avancer par paliers de 500 FCFA.');
      return;
    }

    // Valide la durée (3, 7, 14, 30 uniquement)
    if (!VISIBILITY_BOOST_CONFIG.ALLOWED_DURATIONS.includes(duration)) {
      setErrorMsg('La durée de la campagne doit être de 3, 7, 14 ou 30 jours.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setShowCheckout(true);
  };

  const handleGoToPricing = () => {
    if (setView) setView('gerant-tarifs');
    else window.location.href = '/?view=gerant-tarifs';
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* Hero Banner Card */}
      <div className="bg-gradient-to-br from-[#0F2318] via-[#143322] to-[#1A7A4A] p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-emerald-900/30 text-white relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Glow de fond */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-1 shadow-sm">
            <IconRocket size={14} />
            <span>Budget Visibilité & Sponsorisation</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-display font-bold text-white tracking-tight">
            Boostez la visibilité de vos terrains
          </h1>
          <p className="text-emerald-100/80 text-sm font-medium leading-relaxed">
            Mettez votre terrain en tête des résultats de recherche sur Dakar et multipliez vos réservations.
          </p>
        </div>

        {/* Social Proof & Urgency Badge */}
        <div className="relative z-10 flex items-center gap-3.5 p-4 bg-black/30 backdrop-blur-md border border-amber-500/40 rounded-2xl shadow-lg shrink-0">
          <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0 border border-amber-500/30">
            <IconFlame size={24} className="animate-flame-pulse text-amber-400" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-amber-300 flex items-center gap-1 text-xs">
              <IconFlame size={14} className="text-amber-400 shrink-0" />
              <span>{socialProofCount} gérants à Dakar</span>
            </span>
            <p className="text-amber-100/90 text-xs font-medium">boostent leurs terrains cette semaine</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/50">
          <IconLoader2 size={40} className="animate-spin text-primary" />
          <p className="text-sm font-medium">Chargement du module de visibilité...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main Form Column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Free Plan Dedicated Lock Banner (HTTP 403 prevention UX) */}
            {isFreePlan ? (
              <div className="p-6 bg-gradient-to-r from-amber-950/80 to-amber-900/60 border-2 border-amber-500/50 rounded-3xl space-y-4 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                    <IconLock size={28} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-amber-200">
                      Ce module nécessite un abonnement Starter ou supérieur
                    </h3>
                    <p className="text-xs text-amber-100/80 leading-relaxed">
                      Le budget visibilité sponsorisé est réservé aux comptes avec un plan <strong>Starter, Pro ou Entreprise</strong>. 
                      Passez au plan supérieur pour débloquer l'algorithme de mise en avant prioritaire sur Dakar.
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={handleGoToPricing}
                    className="w-full sm:w-auto px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
                  >
                    <IconSparkles size={16} />
                    <span>Découvrir les offres et passer à Starter / Pro</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Boost Form Card */}
            <div className={`bg-[#0F2318] border border-white/10 rounded-3xl p-6 space-y-6 ${isFreePlan ? 'opacity-60 pointer-events-none' : ''}`}>
              <h2 className="text-lg font-bold font-display flex items-center gap-2">
                <IconRocket className="text-primary" size={20} />
                <span>Programmer une campagne de visibilité</span>
              </h2>

              <form onSubmit={handleCreateBoost} className="space-y-6">
                {/* Terrain Selector */}
                <div>
                  <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                    1. Sélectionner le terrain
                  </label>
                  {terrains.length === 0 ? (
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-400">Aucun terrain enregistré ou approuvé</p>
                        <p className="text-[11px] text-white/50">Créez votre fiche terrain pour pouvoir activer un boost de visibilité.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setView ? setView('gerant-terrain') : window.location.href = '/?view=gerant-terrain'}
                        className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0 cursor-pointer"
                      >
                        Créer un terrain ⚽
                      </button>
                    </div>
                  ) : terrains.length === 1 ? (
                    <div className="p-3.5 bg-primary/20 border border-primary text-white rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-primary/10">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden shrink-0">
                          <TerrainImage terrainId={terrains[0].id} fallbackUrl={terrains[0].image || terrains[0].image_url} alt={terrains[0].nom || terrains[0].name} iconSize={20} className="w-full h-full" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-bold text-xs truncate">{terrains[0].nom || terrains[0].name}</p>
                          <p className="text-[10px] text-emerald-300 font-medium truncate">{terrains[0].quartier || terrains[0].adresse || 'Dakar'}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-primary text-[10px] font-bold uppercase rounded-lg text-white shrink-0">
                        Sélectionné
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {terrains.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedTerrainId(t.id);
                            setErrorMsg(null);
                          }}
                          className={`p-3.5 rounded-2xl border flex items-center gap-3 cursor-pointer transition-all ${
                            selectedTerrainId === t.id
                              ? 'bg-primary/20 border-primary text-white shadow-lg shadow-primary/10'
                              : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden shrink-0">
                            <TerrainImage terrainId={t.id} fallbackUrl={t.image || t.image_url} alt={t.nom || t.name} iconSize={20} className="w-full h-full" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-semibold text-xs truncate">{t.nom || t.name}</p>
                            <p className="text-[10px] text-white/50 truncate">{t.quartier || t.adresse || 'Dakar'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Budget Slider (Strict step of 500 FCFA between 2 000 and 50 000) */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider">
                      2. Budget alloué (FCFA)
                    </label>
                    <span className="text-lg font-bold font-display text-primary">
                      {budget.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                  <input
                    type="range"
                    min={VISIBILITY_BOOST_CONFIG.MIN_BUDGET}
                    max={VISIBILITY_BOOST_CONFIG.MAX_BUDGET}
                    step={VISIBILITY_BOOST_CONFIG.BUDGET_STEP}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-1 font-mono">
                    <span>2 000 FCFA</span>
                    <span>25 000 FCFA</span>
                    <span>50 000 FCFA</span>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">Paliers stricts de 500 FCFA</p>
                </div>

                {/* Duration Picker (Strictly 3, 7, 14, 30 days) */}
                <div>
                  <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-2">
                    3. Durée de la campagne
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {VISIBILITY_BOOST_CONFIG.ALLOWED_DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={`py-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                          duration === d
                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {d} Jours
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Views Projection (Explicitly marked as an indicative estimate) */}
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <IconEye size={22} />
                    </div>
                    <div>
                      <span className="text-xs text-white/60">Estimation des vues bonus (projection indicative)</span>
                      <p className="text-xl font-bold font-display text-emerald-400">
                        ~{estimatedViews.toLocaleString('fr-FR')} vues estimées
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-white/40 max-w-[130px] text-right">
                    Projection indicative selon l'exposition sur la plateforme
                  </span>
                </div>

                {/* Messages */}
                {errorMsg && (
                  <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
                    <IconAlertCircle size={16} />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                    <IconCheck size={16} />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isFreePlan}
                  className="w-full py-4 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-base cursor-pointer"
                >
                  <IconRocket size={20} />
                  <span>Continuer vers le paiement ({budget.toLocaleString('fr-FR')} FCFA)</span>
                </button>
              </form>
            </div>
          </div>

          {/* Active Boosts & Performance Side Column (1/3) */}
          <div className="space-y-6">
            <div className="bg-[#0F2318] border border-white/10 rounded-3xl p-6 space-y-4">
              <h3 className="font-bold text-base font-display flex items-center gap-2">
                <IconTrendingUp className="text-primary" size={18} />
                <span>Vos Campagnes Actives</span>
              </h3>

              {boosts.length === 0 ? (
                <div className="py-8 text-center text-white/40 text-xs space-y-2">
                  <IconEye size={32} className="mx-auto text-white/20" />
                  <p>Aucun boost actif actuellement.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {boosts.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">
                          {b.terrains?.nom || 'Terrain'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          isBoostCurrentlyActive(b)
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : b.statut === 'en_attente'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-white/10 text-white/50'
                        }`}>
                          {b.statut === 'en_attente' ? 'En attente de paiement' : isBoostCurrentlyActive(b) ? 'Actif' : 'Terminé'}
                        </span>
                      </div>

                      {/* Realtime generated views counter */}
                      <div className="p-3 bg-black/30 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-white/60">Vues générées :</span>
                        <span className="text-lg font-bold font-display text-primary flex items-center gap-1">
                          <IconEye size={16} />
                          {b.vues_generees || 0}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-white/50">
                        <span>Budget : {b.budget_alloue?.toLocaleString('fr-FR')} FCFA</span>
                        <span>{b.date_fin ? `Jusqu'au ${b.date_fin}` : `${b.duree_jours || 7} jours`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      <BoostCheckoutModal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        terrainId={selectedTerrainId}
        budgetFcfa={budget}
        dureeJours={duration}
        onOpenPricing={handleGoToPricing}
        onSuccess={async () => {
          setShowCheckout(false);
          setSuccessMsg('Boost de visibilité activé avec succès ! Votre terrain est désormais mis en avant.');
          const updatedBoosts = await fetchGerantBoosts(currentUser.id);
          setBoosts(updatedBoosts);
        }}
      />
    </div>
  );
};
