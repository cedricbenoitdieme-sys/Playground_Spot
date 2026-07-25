import React from 'react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

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
