import React, { useState, useEffect } from 'react';
import { 
  IconCheck, 
  IconSparkles, 
  IconShieldCheck, 
  IconCrown, 
  IconArrowRight, 
  IconHelpCircle,
  IconLoader2,
  IconLogout
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { fetchUserPlanAndLimits, fetchAllPlanLimits } from '../services/subscriptions';
import { SubscriptionCheckoutModal } from '../components/SubscriptionCheckoutModal';
import { signOut } from '../services/auth';

export const Abonnement = ({ onSuccess, onLogout }) => {
  const { currentUser, setCurrentUser, setDisplayPlan } = useUser();
  const [billingCycle, setBillingCycle] = useState('mensuel'); // 'mensuel' | 'annuel'
  const [plans, setPlans] = useState([]);
  const [currentPlanInfo, setCurrentPlanInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Selected plan for checkout modal
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);

  useEffect(() => {
    const loadPlansData = async () => {
      setLoading(true);
      try {
        const [plansList, userPlan] = await Promise.all([
          fetchAllPlanLimits(),
          currentUser?.id ? fetchUserPlanAndLimits(currentUser.id) : Promise.resolve(null),
        ]);

        if (plansList && plansList.length > 0) {
          const order = ['free', 'starter', 'pro', 'entreprise'];
          const sorted = [...plansList].sort((a, b) => {
            return order.indexOf(a.plan_id) - order.indexOf(b.plan_id);
          });
          setPlans(sorted);
        }

        if (userPlan) {
          setCurrentPlanInfo(userPlan);
        }
      } catch (err) {
        console.error('Erreur chargement des tarifs:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPlansData();
  }, [currentUser]);

  const handleSelectPlan = (plan) => {
    if (plan.plan_id === 'free') return;
    setSelectedPlan(plan);
    setCheckoutModalOpen(true);
  };

  const handleCheckoutSuccess = (subData) => {
    setCheckoutModalOpen(false);
    if (subData?.plan_id && setDisplayPlan) {
      const planMap = { free: 'Free', starter: 'Starter', pro: 'Pro', entreprise: 'Entreprise' };
      const planName = planMap[subData.plan_id] || (subData.plan_id.charAt(0).toUpperCase() + subData.plan_id.slice(1));
      const cycleName = subData.cycle === 'annuel' ? 'Annuel' : subData.cycle === 'mensuel' ? 'Mensuel' : null;
      setDisplayPlan(cycleName ? `${planName} · ${cycleName}` : planName);
    }
    if (onSuccess) {
      onSuccess(subData);
    }
  };

  const handleLogoutAction = async () => {
    if (onLogout) {
      onLogout();
    } else {
      try {
        await signOut();
        setCurrentUser(null);
        window.location.href = '/';
      } catch (err) {
        console.error('Erreur deconnexion:', err);
      }
    }
  };

  const getRetentionPercentage = (commissionRate) => {
    const rate = parseFloat(commissionRate || 0);
    const retention = 100 - rate;
    return `${retention}%`;
  };

  const getSavingsFCFA = (plan) => {
    if (!plan.prix_annuel || !plan.prix_mensuel) return null;
    const fullYearMonthly = plan.prix_mensuel * 12;
    const savings = fullYearMonthly - plan.prix_annuel;
    return savings > 0 ? savings : null;
  };

  return (
    <div className="min-h-screen bg-[#0F2318] text-white flex flex-col justify-between p-4 md:p-8 animate-fadeIn">
      {/* Top Bar with Logout */}
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between pb-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center font-bold text-white shadow-lg shadow-primary/20">
            PS
          </div>
          <div>
            <h2 className="font-display font-bold text-lg leading-none">PlaygroundSpot Gérant</h2>
            <p className="text-xs text-white/50">Choix d'abonnement requis</p>
          </div>
        </div>

        <button
          onClick={handleLogoutAction}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          <IconLogout size={16} />
          <span>Se déconnecter</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="py-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* Header section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
            <IconSparkles size={14} />
            <span>Activez votre accès Gérant</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight">
            Souscrivez à un plan pour <span className="text-primary">gérer vos terrains</span>.
          </h1>
          <p className="text-white/60 text-base md:text-lg">
            Choisissez l'offre adaptée à votre activité sur Dakar. Débloquez vos réservations en toute sécurité.
          </p>

          {/* Toggle Mensuel / Annuel */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <span className={`text-sm font-semibold ${billingCycle === 'mensuel' ? 'text-white' : 'text-white/50'}`}>
              Mensuel
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'mensuel' ? 'annuel' : 'mensuel')}
              className="w-14 h-8 rounded-full bg-white/10 p-1 relative border border-white/20 transition-colors cursor-pointer"
            >
              <div
                className={`w-6 h-6 rounded-full bg-primary transition-transform shadow-md ${
                  billingCycle === 'annuel' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${billingCycle === 'annuel' ? 'text-white' : 'text-white/50'}`}>
                Annuel
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold animate-pulse">
                -25%
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/50">
            <IconLoader2 size={40} className="animate-spin text-primary" />
            <p className="text-sm font-medium">Chargement des abonnements en cours...</p>
          </div>
        ) : (
          /* Grid of cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 items-stretch">
            {plans.map((plan) => {
              const isCurrent = currentPlanInfo?.plan_id === plan.plan_id;
              const isPro = plan.plan_id === 'pro';
              const isEntreprise = plan.plan_id === 'entreprise';
              const isFree = plan.plan_id === 'free';

              // Prices
              const isYearlySelected = billingCycle === 'annuel' && (isPro || isEntreprise);
              const displayPrice = isYearlySelected && plan.prix_annuel
                ? Math.round(plan.prix_annuel / 12)
                : plan.prix_mensuel;
              const savingsFCFA = getSavingsFCFA(plan);

              return (
                <div
                  key={plan.plan_id}
                  className={`relative rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 ${
                    isPro
                      ? 'bg-[#143222] border-2 border-primary shadow-2xl shadow-primary/20 scale-105 z-10'
                      : isEntreprise
                      ? 'bg-gradient-to-b from-[#1C170E] to-[#0F0C07] border-2 border-amber-500/40 shadow-xl shadow-amber-500/10'
                      : 'bg-white/5 border border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Badges Header */}
                  <div className="space-y-4">
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                        <IconSparkles size={14} />
                        <span>Recommandé</span>
                      </div>
                    )}
                    {isEntreprise && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                        <IconCrown size={14} />
                        <span>Entreprise</span>
                      </div>
                    )}

                    {/* Title & Description */}
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xl font-bold font-display ${isEntreprise ? 'text-amber-300' : 'text-white'}`}>
                        {plan.nom}
                      </h3>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Actuel
                        </span>
                      )}
                    </div>

                    {/* Pricing Display */}
                    <div className="py-2 border-b border-white/10">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-3xl font-extrabold font-display ${isEntreprise ? 'text-amber-200' : 'text-white'}`}>
                          {displayPrice === 0 ? '0' : displayPrice.toLocaleString('fr-FR')}
                        </span>
                        <span className="text-sm text-white/60 font-medium">FCFA / mois</span>
                      </div>

                      {/* Cycle details */}
                      {isYearlySelected ? (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs text-white/60">
                            Facturé {plan.prix_annuel.toLocaleString('fr-FR')} FCFA / an
                          </p>
                          {savingsFCFA && (
                            <p className="text-xs font-bold text-amber-400">
                              Économisez {savingsFCFA.toLocaleString('fr-FR')} FCFA/an
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-white/40 mt-1">
                          {isFree ? 'Offre de base' : 'Facturation mensuelle sans engagement'}
                        </p>
                      )}
                    </div>

                    {/* Retention percentage */}
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white/70 font-medium">Rétention ventes :</span>
                        <span className="font-bold text-emerald-400">
                          Gardez {getRetentionPercentage(plan.commission_rate)} de vos ventes
                        </span>
                      </div>
                    </div>

                    {/* Feature Checklist */}
                    <ul className="space-y-3 pt-2 text-xs">
                      <li className="flex items-center gap-2.5">
                        <IconCheck size={16} className="text-primary shrink-0" />
                        <span>
                          <strong>
                            {plan.max_terrains ? `${plan.max_terrains} terrain${plan.max_terrains > 1 ? 's' : ''}` : 'Terrains illimités'}
                          </strong>
                        </span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <IconCheck size={16} className="text-primary shrink-0" />
                        <span>
                          {plan.max_reservations_mois
                            ? `${plan.max_reservations_mois} réservations / mois`
                            : 'Réservations mensuelles illimitées'}
                        </span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <IconCheck size={16} className={plan.pdf_export ? 'text-primary' : 'text-white/20'} />
                        <span className={plan.pdf_export ? 'text-white/90' : 'text-white/40 line-through'}>
                          Export PDF des factures
                        </span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <IconCheck size={16} className={plan.dashboard_avance ? 'text-primary' : 'text-white/20'} />
                        <span className={plan.dashboard_avance ? 'text-white/90' : 'text-white/40 line-through'}>
                          Tableau de bord avancé
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Call to action button */}
                  <div className="pt-6 space-y-2">
                    {isFree ? (
                      <button
                        disabled
                        className="w-full py-3.5 bg-white/5 border border-white/10 text-white/40 font-semibold rounded-2xl text-xs cursor-default"
                      >
                        Plan de départ
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                          isPro
                            ? 'bg-primary hover:bg-primary-hover text-white shadow-primary/30'
                            : isEntreprise
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black shadow-amber-500/20'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                      >
                        <span>S'abonner avec Wave / OM</span>
                        <IconArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Support Banner */}
      <div className="w-full max-w-7xl mx-auto pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/60">
        <div className="flex items-center gap-2">
          <IconShieldCheck size={18} className="text-primary" />
          <span>Paiement en ligne temporairement indisponible · Support commercial disponible</span>
        </div>
        <a
          href="https://wa.me/221770000000"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors"
        >
          Besoin d'assistance ? Contacter le support
        </a>
      </div>

      {/* Subscription Checkout Modal */}
      <SubscriptionCheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        plan={selectedPlan}
        cycle={billingCycle}
        onSuccess={handleCheckoutSuccess}
      />
    </div>
  );
};
