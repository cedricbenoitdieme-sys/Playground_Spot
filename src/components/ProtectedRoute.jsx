import React, { useEffect } from 'react';
import { useUser } from '../context/UserContext';

export const ProtectedRoute = ({ allowedRoles, onDenied, children }) => {
  const { currentUser } = useUser();
  const hasAccess = currentUser && allowedRoles.includes(currentUser.role);

  useEffect(() => {
    if (!hasAccess && onDenied) {
      onDenied();
    }
  }, [hasAccess, onDenied]);

  if (!hasAccess) {
    return null; // Render nothing while redirecting
  }

  return <>{children}</>;
};
