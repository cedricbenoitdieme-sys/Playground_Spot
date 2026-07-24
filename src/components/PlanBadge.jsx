import React from 'react';
import { IconCrown, IconSparkles, IconCode, IconShieldCheck, IconClock, IconUser } from '@tabler/icons-react';

export const PlanBadge = ({ displayPlan, className = '' }) => {
  if (!displayPlan) return null;

  const isJoueur = displayPlan === 'Joueur';
  const isAdminOrDev = displayPlan.includes('Admin') || displayPlan.includes('Dev');
  const isTrial = displayPlan.includes('Essai');

  let badgeStyle = '';
  let Icon = IconCrown;

  if (isJoueur) {
    // Discrete slate / gray-blue neutral badge for Player role
    badgeStyle = 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-300/50 font-medium';
    Icon = IconUser;
  } else if (isAdminOrDev) {
    // Purple / Violet badge for Admin / Dev test accounts in prod
    badgeStyle = 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-400/40 font-extrabold shadow-sm';
    Icon = displayPlan.includes('Dev') ? IconCode : IconShieldCheck;
  } else if (isTrial) {
    // Amber badge for Free Trial
    badgeStyle = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40 font-bold';
    Icon = IconClock;
  } else {
    // Emerald / Green badge for Paid active plans (Pro, Starter, etc.)
    badgeStyle = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40 font-bold';
    Icon = IconSparkles;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs tracking-wide border transition-all select-none ${badgeStyle} ${className}`}
      title={`Abonnement : ${displayPlan}`}
    >
      <Icon size={14} className="shrink-0" />
      <span>{displayPlan}</span>
    </span>
  );
};
