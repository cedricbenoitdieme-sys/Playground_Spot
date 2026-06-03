import React, { useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { securityLog } from '../lib/securityLogger';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — Route Protégée Sécurisée
 * Security Rules: 2.2, 2.3, 2.5, 9.1
 * ═══════════════════════════════════════════════════════════
 */

export const ProtectedRoute = ({ allowedRoles, onDenied, children }) => {
  const { currentUser, loading } = useUser();
  
  // ── Règle 2.5 — Vérifier que l'utilisateur est authentifié ──
  const isAuthenticated = !!currentUser;
  
  // ── Règle 2.2 — Vérifier le rôle ──
  const hasRole = isAuthenticated && allowedRoles.includes(currentUser.role);
  
  // ── Règle 2.3 — Vérifier que le compte est actif ──
  const isActive = isAuthenticated && currentUser.statut !== 'suspendu' && currentUser.statut !== 'inactif';
  
  const hasAccess = isAuthenticated && hasRole && isActive;

  useEffect(() => {
    // Ne pas rediriger tant que le chargement de la session n'est pas terminé
    if (loading) return;
    
    if (!hasAccess && onDenied) {
      // ── Règle 9.1 — Logger les accès refusés ──
      if (currentUser && !hasRole) {
        securityLog.accessDenied(currentUser.id, `Rôle ${currentUser.role} refusé pour ${allowedRoles.join(', ')}`);
      }
      if (currentUser && !isActive) {
        securityLog.accessDenied(currentUser.id, `Compte ${currentUser.statut}`);
      }
      
      onDenied();
    }
  }, [hasAccess, onDenied, loading]);

  // Pendant le chargement, ne rien rendre (l'écran de loading global de App.jsx prend le relais)
  if (loading) return null;

  if (!hasAccess) {
    return null; // Render nothing while redirecting
  }

  return <>{children}</>;
};
