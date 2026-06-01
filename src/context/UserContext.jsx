import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/auth';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Initialisation : vérifier la session Supabase active ──
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await getProfile(session.user.id);
          setCurrentUser({
            id: session.user.id,
            nom: profile.nom,
            email: profile.email,
            role: profile.role,
            quartier: profile.quartier,
            tel: profile.tel,
            avatar: profile.avatar || getInitiales(profile.nom),
            statut: profile.statut,
          });
        }
      } catch (err) {
        console.error('Erreur initialisation auth:', err.message);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // ── Écouter les changements d'état d'auth (login, logout, token refresh) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          try {
            const profile = await getProfile(session.user.id);
            setCurrentUser({
              id: session.user.id,
              nom: profile.nom,
              email: profile.email,
              role: profile.role,
              quartier: profile.quartier,
              tel: profile.tel,
              avatar: profile.avatar || getInitiales(profile.nom),
              statut: profile.statut,
            });
          } catch (err) {
            console.error('Erreur chargement profil:', err.message);
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  // ── Setter qui met aussi à jour le state ──
  const handleSetCurrentUser = (user) => {
    setCurrentUser(user);
  };

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: handleSetCurrentUser, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);

// ── Helper ──
const getInitiales = (nom) => {
  if (!nom) return '??';
  return nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};
