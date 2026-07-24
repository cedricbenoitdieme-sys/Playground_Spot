import React from 'react';
import { createPortal } from 'react-dom';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Composant Modal Universel
 * ═══════════════════════════════════════════════════════════
 * 
 * Composant unique de backdrop/overlay utilisé par TOUTES les modales du SaaS.
 * Rendu via createPortal(document.body) pour garantir que l'overlay
 * couvre 100% du viewport, y compris le header sticky et la navbar.
 * 
 * Props :
 *  - isOpen        : boolean — affiche/masque la modale
 *  - onClose       : function — callback au clic sur le backdrop
 *  - children      : ReactNode — contenu de la modale
 *  - className     : string — classes additionnelles sur le wrapper
 *  - overlayClassName : string — classes additionnelles sur le backdrop
 *  - zIndex        : number — z-index du wrapper (défaut: 9999)
 *  - center        : boolean — centrer le contenu (défaut: true)
 */
export const Modal = ({
  isOpen,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  zIndex = 9999,
  center = true
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${center ? 'flex items-center justify-center p-4' : ''} ${className}`}
      style={{ zIndex, isolation: 'isolate' }}
    >
      {/* Backdrop flouté — couvre 100% du viewport via fixed inset-0 + createPortal(body) */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-200 ${overlayClassName}`}
        style={{ zIndex: -1 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Contenu de la modale */}
      {children}
    </div>,
    document.body
  );
};

/**
 * Composant ModalSheet — variante "Bottom Sheet" (tiroir du bas) 
 * pour les modales de détail/édition (GerantStats, GerantDashboard, etc.)
 */
export const ModalSheet = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  zIndex = 9999
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex, isolation: 'isolate' }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-200"
        style={{ zIndex: -1 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Card */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 z-10 ${className}`}>
        {title && (
          <div className="flex items-start justify-between p-6 border-b border-gray-50 gap-4">
            <h3 className="font-display font-bold text-lg text-primary-dark flex-1 min-w-0 truncate whitespace-normal break-words leading-tight mt-0.5">{title}</h3>
            <button onClick={onClose} className="p-2 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer text-gray-400 hover:text-primary-dark shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        <div className="p-6 max-h-[70vh] overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </div>,
    document.body
  );
};
