/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Configuration Centralisée des Abonnements & Tarifs
 * ═══════════════════════════════════════════════════════════
 * Source unique de vérité pour l'ensemble des composants front-end.
 */

export const PLANS_CONFIG = {
  free: {
    plan_id: 'free',
    nom: 'Free',
    prix_mensuel: 0,
    prix_annuel: null,
    commission_rate: 12.0,
    visibility_boost: false,
    max_terrains: 1,
    max_reservations_mois: 20,
    pdf_export: false,
    dashboard_avance: false,
    multi_sites: false,
    description: 'Pour démarrer et tester PlaygroundSpot à Dakar sans engagement',
  },
  starter: {
    plan_id: 'starter',
    nom: 'Starter',
    prix_mensuel: 4900,
    prix_annuel: null,
    commission_rate: 8.0,
    visibility_boost: true,
    max_terrains: 3,
    max_reservations_mois: null,
    pdf_export: true,
    dashboard_avance: false,
    multi_sites: false,
    description: 'Idéal pour les gérants de 1 à 3 terrains souhaitant développer leurs réservations',
  },
  pro: {
    plan_id: 'pro',
    nom: 'Pro',
    prix_mensuel: 9900,
    prix_annuel: 89100, // -25% environ (89 100 FCFA/an)
    commission_rate: 2.0,
    visibility_boost: true,
    max_terrains: null,
    max_reservations_mois: null,
    pdf_export: true,
    dashboard_avance: true,
    multi_sites: false,
    description: 'Le plan recommandations avec commission réduite et statistiques avancées',
  },
  entreprise: {
    plan_id: 'entreprise',
    nom: 'Entreprise',
    prix_mensuel: 24900,
    prix_annuel: 224100, // 224 100 FCFA/an
    commission_rate: 0.0,
    visibility_boost: true,
    max_terrains: null,
    max_reservations_mois: null,
    pdf_export: true,
    dashboard_avance: true,
    multi_sites: true,
    description: '0% de commission, gestion multi-complexes & support prioritaire dédié',
  },
};

export const PLANS_LIST = [
  PLANS_CONFIG.free,
  PLANS_CONFIG.starter,
  PLANS_CONFIG.pro,
  PLANS_CONFIG.entreprise,
];

// Configuration pour les campagnes de visibilité
export const VISIBILITY_BOOST_CONFIG = {
  MIN_BUDGET: 2000,
  MAX_BUDGET: 50000,
  BUDGET_STEP: 500, // Impératif : paliers de 500 FCFA
  DEFAULT_BUDGET: 5000,
  ALLOWED_DURATIONS: [3, 7, 14, 30], // Impératif : exactement 3, 7, 14, 30 jours
  DEFAULT_DURATION: 7,
};
