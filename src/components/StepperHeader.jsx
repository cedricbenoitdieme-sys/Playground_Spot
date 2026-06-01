import React from 'react';

export const StepperHeader = ({ currentStep }) => {
  const steps = [
    { id: 1, label: 'Créneau' },
    { id: 2, label: 'Résumé' },
    { id: 3, label: 'Paiement' },
    { id: 4, label: 'Confirmation' },
  ];

  return (
    <div className="flex items-center justify-between mb-10 px-4 max-w-xl mx-auto">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 border-2 ${
              currentStep >= step.id 
                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' 
                : 'bg-white border-gray-200 text-gray-400'
            }`}>
              {step.id}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
              currentStep >= step.id ? 'text-primary' : 'text-gray-300'
            }`}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-4 -mt-6 rounded-full transition-colors duration-500 ${
              currentStep > step.id ? 'bg-primary' : 'bg-gray-100'
            }`}></div>
          )}
        </div>
      ))}
    </div>
  );
};
