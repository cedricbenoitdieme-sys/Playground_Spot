import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { UserProvider } from './context/UserContext.jsx'
import * as amplitude from '@amplitude/unified';

// amplitude.initAll('76ae6217b9165b8d86d33ca292743f5c', {
//   "analytics": { "autocapture": true },
//   "sessionReplay": { "sampleRate": 1 }
// });

// Réinitialiser le flag de tentative de rechargement lors d'un chargement réussi de l'application
try {
  sessionStorage.removeItem('chunk-reload-attempted');
} catch (e) {
  // Ignorer les erreurs si sessionStorage est désactivé
}

// Écouteur officiel Vite pour intercepter les échecs de préchargement de modules (nouveau déploiement)
window.addEventListener('vite:preloadError', (event) => {
  try {
    const attempted = sessionStorage.getItem('chunk-reload-attempted');
    if (!attempted) {
      sessionStorage.setItem('chunk-reload-attempted', 'true');
      window.location.reload();
    }
  } catch (e) {
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserProvider>
      <App />
    </UserProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
