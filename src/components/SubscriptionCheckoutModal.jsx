import React from 'react';
import { PaymentFlow } from './PaymentFlow';

export const SubscriptionCheckoutModal = ({ isOpen, onClose, plan, cycle, onSuccess }) => {
  if (!isOpen || !plan) return null;

  const price = cycle === 'annuel' && plan.prix_annuel ? plan.prix_annuel : plan.prix_mensuel;

  return (
    <PaymentFlow
      isOpen={isOpen}
      onClose={onClose}
      type_flux="abonnement"
      plan={plan}
      billing_period={cycle === 'annuel' ? 'annual' : 'monthly'}
      amount={price}
      title={`Souscription Plan ${plan.nom || plan.plan_id}`}
      onSuccess={onSuccess}
    />
  );
};
