import React from 'react';
import { PaymentFlow } from './PaymentFlow';

export const BoostCheckoutModal = ({ isOpen, onClose, terrainId, budgetFcfa, dureeJours, onSuccess }) => {
  if (!isOpen || !budgetFcfa || !dureeJours) return null;

  return (
    <PaymentFlow
      isOpen={isOpen}
      onClose={onClose}
      type_flux="boost"
      terrain_id={terrainId}
      budget_fcfa={budgetFcfa}
      duree_jours={dureeJours}
      amount={budgetFcfa}
      title="Boost Visibilité SenePay"
      onSuccess={onSuccess}
    />
  );
};
