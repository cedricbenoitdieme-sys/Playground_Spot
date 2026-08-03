import React from 'react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

const isChunkLoadError = (error) => {
  if (!error || !error.message) return false;
  const msg = String(error.message).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('failed to load module script')
  );
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Erreur interceptée :', error, errorInfo);

    // Détection des échecs de chargement de chunk JS (ex: après un nouveau déploiement Vercel)
    if (isChunkLoadError(error)) {
      try {
        const attempted = sessionStorage.getItem('chunk-reload-attempted');
        if (!attempted) {
          console.warn('[ErrorBoundary] Détection d\'un chunk obsolète post-déploiement. Rechargement automatique de la page...');
          sessionStorage.setItem('chunk-reload-attempted', 'true');
          window.location.reload();
          return;
        }
      } catch (e) {
        window.location.reload();
        return;
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-3xl m-4 space-y-4 text-red-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <IconAlertTriangle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-sm font-display">Erreur d'affichage du composant</h3>
              <p className="text-xs text-red-500 font-mono mt-0.5 break-all">
                {this.state.error?.message || 'Une erreur inattendue est survenue.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              try {
                sessionStorage.removeItem('chunk-reload-attempted');
              } catch (e) {}
              window.location.reload();
            }}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <IconRefresh size={16} /> Recharger la page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
