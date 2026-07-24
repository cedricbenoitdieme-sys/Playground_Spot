import React from 'react';
import { createPortal } from 'react-dom';
import { IconCircleCheck, IconAlertCircle, IconCircleX, IconQuestionMark } from '@tabler/icons-react';

export const CustomAlertModal = ({ 
  isOpen, 
  title, 
  message, 
  type = 'info', // 'info', 'success', 'error', 'confirm'
  onConfirm, 
  onClose,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <IconCircleCheck size={40} className="text-primary animate-bounce" />;
      case 'error':
        return <IconCircleX size={40} className="text-red-500 animate-bounce" />;
      case 'confirm':
        return <IconQuestionMark size={40} className="text-secondary animate-pulse" />;
      default:
        return <IconAlertCircle size={40} className="text-blue-500 animate-pulse" />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity duration-300"
        onClick={type === 'confirm' ? undefined : onClose}
      ></div>
      {/* Modal Card */}
      <div className="absolute bg-white w-full max-w-[calc(100vw-32px)] md:max-w-sm mx-auto rounded-3xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200 border border-black/5 z-10">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-gray-50">
            {getIcon()}
          </div>
        </div>
        <h3 className="text-lg font-display font-bold text-primary-dark mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6 whitespace-pre-wrap">{message}</p>
        
        <div className="flex gap-3 justify-center">
          {type === 'confirm' ? (
            <>
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all text-sm cursor-pointer"
              >
                {cancelLabel}
              </button>
              <button 
                type="button"
                onClick={onConfirm}
                className="flex-1 py-3 btn-primary text-sm shadow-md cursor-pointer"
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button 
              type="button"
              onClick={onClose}
              className="w-full py-3 btn-primary text-sm shadow-md cursor-pointer"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
