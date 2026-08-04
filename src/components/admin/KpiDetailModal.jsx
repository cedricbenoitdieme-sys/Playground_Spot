import React from 'react';
import { Modal } from '../Modal';
import { PeriodSelector } from '../PeriodSelector';

export const KpiDetailModal = ({
  isOpen,
  onClose,
  title,
  periode,
  onPeriodeChange,
  children
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white w-full max-w-2xl mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 space-y-4 shrink-0 bg-gray-50/50 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display font-bold text-lg text-primary-dark truncate">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white hover:bg-gray-100 transition-colors cursor-pointer text-gray-400 hover:text-primary-dark shrink-0 border border-gray-200/80 shadow-xs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Period Selector in Header */}
          <div className="pt-1 max-w-full overflow-hidden">
            <PeriodSelector value={periode} onChange={onPeriodeChange} />
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 no-scrollbar">
          {children}
        </div>
      </div>
    </Modal>
  );
};
