import React, { useState, useEffect } from 'react';
import { 
  IconCheck, 
  IconSparkles, 
  IconShieldCheck, 
  IconCrown, 
  IconArrowRight, 
  IconBuildingStore, 
  IconCalendarEvent, 
  IconChartBar, 
  IconHelpCircle,
  IconClock,
  IconLoader2
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { fetchUserPlanAndLimits, fetchAllPlanLimits } from '../services/subscriptions';
import { SubscriptionCheckoutModal } from '../components/SubscriptionCheckoutModal';

export const GerantTarifs = ({ setView }) => {
  const { currentUser } = useUser();
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
          // Garanti l'ordre exact: free -> starter -> pro -> entreprise
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
    if (plan.plan_id === 'free') {
      return; // Déjà attribué par défaut
    }
    setSelectedPlan(plan);
    setCheckoutModalOpen(true);
  };

  const handleCheckoutSuccess = (subData) => {
    setCheckoutModalOpen(false);
    // Note: Redirection vers PaymentSuccess supprimée tant qu'aucune Edge Function de souscription n'est déployée.
  };

  // Rétention de chiffre d'affaires (Gain-framing pour la commission)
  const getRetentionPercentage = (commissionRate) => {
    const rate = parseFloat(commissionRate || 0);
    const retention = 100 - rate;
    return `${retention}%`;
  };

  // Calcul du montant économisé en FCFA pour l'abonnement annuel
  const getSavingsFCFA = (plan) => {
    if (!plan.prix_annuel || !plan.prix_mensuel) return null;
    const fullYearMonthly = plan.prix_mensuel * 12;
    const savings = fullYearMonthly - plan.prix_annuel;
    return savings > 0 ? savings : null;
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* Hero Banner Card */}
      <div className="bg-gradient-to-br from-[#0F2318] via-[#143322] to-[#1A7A4A] p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-emerald-900/30 text-white relative overflow-hidden text-center space-y-5 max-w-4xl mx-auto">
        {/* Glow de fond */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none -mt-20"></div>

        <div className="relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider shadow-sm">
          <IconSparkles size={14} />
          <span>Grille Tarifaire Gérants</span>
        </div>
        <h1 className="relative z-10 text-3xl md:text-5xl font-display font-extrabold tracking-tight text-white leading-tight">
          Maximisez vos réservations, <span className="text-emerald-400">gardez vos revenus</span>.
        </h1>
        <p className="relative z-10 text-emerald-100/80 text-base md:text-lg font-medium max-w-2xl mx-auto leading-relaxed">
          Choisissez le plan adapté à vos terrains. Changez ou annulez à tout moment sans aucun frais caché.
        </p>

        {/* Toggle Mensuel / Annuel */}
        <div className="relative z-10 pt-4 flex items-center justify-center gap-3">
          <span className={`text-sm font-bold ${billingCycle === 'mensuel' ? 'text-white' : 'text-emerald-200/50'}`}>
            Mensuel
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'mensuel' ? 'annuel' : 'mensuel')}
            className="w-14 h-8 rounded-full bg-white/15 p-1 relative border border-white/20 transition-colors cursor-pointer"
          >
            <div
              className={`w-6 h-6 rounded-full bg-primary transition-transform shadow-md ${
                billingCycle === 'annuel' ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${billingCycle === 'annuel' ? 'text-white' : 'text-emerald-200/50'}`}>
              Annuel
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-black animate-pulse shadow-sm">
              -25%
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/50">
          <IconLoader2 size={40} className="animate-spin text-primary" />
          <p className="text-sm font-medium">Chargement des tarifs en cours...</p>
        </div>
      ) : (
        /* Grid of 4 cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 items-stretch">
          {plans.map((plan) => {
            const isCurrent = currentPlanInfo?.plan_id === plan.plan_id;
            const isPro = plan.plan_id === 'pro';
            const isEntreprise = plan.plan_id === 'entreprise';
            const isFree = plan.plan_id === 'free';
            const isStarter = plan.plan_id === 'starter';

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
                    : 'bg-[#0F2318] border border-white/10 hover:border-white/20'
                }`}
              >
                {/* Badges Header */}
                <div className="space-y-4">
                  {isPro && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                      <IconSparkles size={14} />
                      <span>Le plus populaire</span>
                    </div>
                  )}
                  {isEntreprise && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5">
                      <IconCrown size={14} />
                      <span>Offre Premium</span>
                    </div>
                  )}

                  {/* Title & Description */}
                  <div className="flex items-center justify-between">
                    <h3 className={`text-xl font-bold font-display ${isEntreprise ? 'text-amber-300' : 'text-white'}`}>
                      {plan.nom}
                    </h3>
                    {isCurrent && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Plan Actuel
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

                    {/* Cycle details / savings */}
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
                        {isFree ? 'Gratuit pour toujours' : 'Facturation mensuelle sans engagement'}
                      </p>
                    )}
                  </div>

                  {/* Key Selling Argument (Gain framing on commission) */}
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 font-medium">Rétention ventes :</span>
                      <span className="font-bold text-emerald-400">
                        Gardez {getRetentionPercentage(plan.commission_rate)} de vos ventes
                      </span>
                    </div>
                    <p className="text-[11px] text-white/40">
                      (Frais de plateforme : seulement {plan.commission_rate}%)
                    </p>
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
                        Export PDF des factures & tickets
                      </span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <IconCheck size={16} className={plan.dashboard_avance ? 'text-primary' : 'text-white/20'} />
                      <span className={plan.dashboard_avance ? 'text-white/90' : 'text-white/40 line-through'}>
                        Tableau de bord statistique avancé
                      </span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <IconCheck size={16} className={plan.multi_sites ? 'text-amber-400' : 'text-white/20'} />
                      <span className={plan.multi_sites ? 'text-amber-300 font-bold' : 'text-white/40 line-through'}>
                        Multi-sites & accès API dédié
                      </span>
                    </li>
                    {!isFree && (
                      <li className="flex items-center gap-2.5 text-primary font-semibold">
                        <IconSparkles size={16} className="shrink-0" />
                        <span>Accès au Module Budget Visibilité</span>
                      </li>
                    )}
                  </ul>
                </div>

                {/* Call to action button */}
                <div className="pt-6 space-y-2">
                  {isFree ? (
                    <button
                      disabled
                      className="w-full py-3.5 bg-white/5 border border-white/10 text-white/40 font-semibold rounded-2xl text-xs cursor-default"
                    >
                      Offre de démarrage incluse
                    </button>
                  ) : (
                    <>
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
                        <span>Essayer 30 jours gratuitement</span>
                        <IconArrowRight size={16} />
                      </button>
                      <p className="text-[10px] text-center text-white/50">
                        Annulable sous 7 jours sans engagement
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAQ & Support banner */}
      <div className="p-6 bg-[#0F2318] border border-white/10 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-primary">
            <IconHelpCircle size={28} />
          </div>
          <div>
            <h4 className="font-bold text-base">Besoin d'un plan sur mesure pour votre complexe ?</h4>
            <p className="text-xs text-white/60">Notre équipe basée à Dakar vous accompagne pour la configuration multi-terrains.</p>
          </div>
        </div>
        <a
          href="https://wa.me/221770000000"
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all whitespace-nowrap"
        >
          Contacter un conseiller
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
