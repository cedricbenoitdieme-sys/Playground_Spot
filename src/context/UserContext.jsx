import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/auth';
import { withRetry } from '../lib/errorHandler';
import * as amplitude from '@amplitude/unified';

/**
 * ═══════════════════════════════════════════════════════════
 * PlaygroundSpot — UserContext Sécurisé
 * Security Rules: 2.1, 2.3, 2.5
 * ═══════════════════════════════════════════════════════════
 * 
 * Règle 2.1 — Utilise getUser() (validation JWT serveur) au lieu de getSession()
 * Règle 2.3 — Vérifie le statut du profil (bloqué/suspendu → refuser)
 * Règle 2.5 — Refuse les requêtes sans authentification valide
 */

const UserContext = createContext();

// Timeout de sécurité : si l'auth met plus de 6s, on arrête le loading
const AUTH_TIMEOUT_MS = 6000;

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const profileLoadedRef = useRef(false);
  const initDoneRef = useRef(false);

  // Amplitude User Tracking
  useEffect(() => {
    if (currentUser) {
      amplitude.setUserId(currentUser.id);
    } else {
      amplitude.setUserId(undefined);
    }
  }, [currentUser]);

  // ── Helper pour construire l'objet user ──
  const buildUser = (userId, profile) => ({
    id: userId,
    nom: profile.nom,
    email: profile.email,
    role: profile.role,
    quartier: profile.quartier,
    tel: profile.tel,
    avatar: profile.avatar || getInitiales(profile.nom),
    statut: profile.statut,
  });

  // ── Fin du loading (sécurisée) ──
  const finishLoading = () => {
    initDoneRef.current = true;
    setLoading(false);
  };

  // ── Règle 2.3 — Vérifier le statut du profil ──
  const isProfileActive = (profile) => {
    return profile && profile.statut !== 'suspendu' && profile.statut !== 'inactif';
  };

  // ── Initialisation : vérifier la session Supabase active ──
  useEffect(() => {
    // Reset pour React StrictMode (double-mount)
    initDoneRef.current = false;
    profileLoadedRef.current = false;

    // Timeout de sécurité — empêche le blocage du loading
    const timeoutId = setTimeout(() => {
      if (import.meta.env.DEV) {
        console.warn('[Auth] Timeout atteint, arrêt du loading');
      }
      finishLoading();
    }, AUTH_TIMEOUT_MS);

    const initAuth = async () => {
      try {
        // ── Récupérer la session existante ──
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          if (import.meta.env.DEV) {
            console.error('[Auth] Erreur getSession:', sessionError.message);
          }
          if (!profileLoadedRef.current) {
            setCurrentUser(null);
          }
          finishLoading();
          return;
        }

        // Si aucune session n'existe, pas besoin de valider le JWT
        if (!session) {
          if (!profileLoadedRef.current) {
            setCurrentUser(null);
          }
          finishLoading();
          return;
        }

        // Enforce "Se souvenir de moi" : si remember est false et que session-active est absent,
        // on déconnecte l'utilisateur (le navigateur a été fermé).
        const remember = localStorage.getItem('playgroundspot-remember');
        const sessionActive = sessionStorage.getItem('playgroundspot-session-active');
        if (remember === 'false' && sessionActive !== 'true') {
          try { await supabase.auth.signOut(); } catch (_) {}
          if (!profileLoadedRef.current) {
            setCurrentUser(null);
          }
          finishLoading();
          return;
        }

        // ── Règle 2.1 — Utiliser getUser() pour valider le JWT côté serveur ──
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          if (import.meta.env.DEV) {
            console.error('[Auth] Erreur getUser:', error.message);
          }
          if (!profileLoadedRef.current) {
            setCurrentUser(null);
            try { await supabase.auth.signOut(); } catch (_) {}
          }
          finishLoading();
          return;
        }

        if (user && session) {
          try {
            // Utilisation de withRetry pour résoudre la race condition avec le trigger DB
            const profile = await withRetry(() => getProfile(user.id), { maxRetries: 2, baseDelay: 500, context: 'initAuth' });
            
            // ── Règle 2.3 — Vérifier que le compte est actif ──
            if (!isProfileActive(profile)) {
              if (import.meta.env.DEV) {
                console.warn('[Auth] Compte suspendu/inactif, déconnexion');
              }
              if (!profileLoadedRef.current) {
                setCurrentUser(null);
                try { await supabase.auth.signOut(); } catch (_) {}
              }
              finishLoading();
              return;
            }
            
            // Si l'utilisateur n'a pas été écrasé par un login plus rapide
            if (!profileLoadedRef.current) {
              profileLoadedRef.current = true;
              setCurrentUser(buildUser(user.id, profile));
            }
          } catch (profileErr) {
            if (import.meta.env.DEV) {
              console.error('[Auth] Erreur chargement profil:', profileErr.message);
            }
            if (!profileLoadedRef.current) {
              setCurrentUser(null);
              try { await supabase.auth.signOut(); } catch (_) {}
            }
          }
        } else {
          if (!profileLoadedRef.current) {
            setCurrentUser(null);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Auth] Erreur initialisation:', err.message);
        }
        if (!profileLoadedRef.current) {
          setCurrentUser(null);
        }
      } finally {
        finishLoading();
      }
    };

    initAuth();

    // ── Écouter les changements d'état d'auth (login, logout, token refresh) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Éviter de traiter les événements pendant la phase d'initialisation (gérée par initAuth)
        if (!initDoneRef.current) return;

        if (event === 'SIGNED_IN' && session?.user) {
          // Si le profil a déjà été chargé (par Login.jsx), on skip
          if (profileLoadedRef.current) return;
          try {
            // Utilisation de withRetry pour attendre que le trigger DB ait fini
            const profile = await withRetry(() => getProfile(session.user.id), { maxRetries: 2, baseDelay: 500, context: 'onAuthStateChange' });
            
            // ── Règle 2.3 — Vérifier statut ──
            if (!isProfileActive(profile)) {
              setCurrentUser(null);
              try { await supabase.auth.signOut(); } catch (_) {}
              return;
            }
            
            profileLoadedRef.current = true;
            setCurrentUser(buildUser(session.user.id, profile));
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error('[Auth] Erreur profil (onAuthStateChange):', err.message);
            }
            
            setCurrentUser(null);
            try { await supabase.auth.signOut(); } catch (_) {}
          }
        } else if (event === 'SIGNED_OUT') {
          profileLoadedRef.current = false;
          setCurrentUser(null);
        }
        // TOKEN_REFRESHED → rien à faire
      }
    );

    return () => {
      clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, []);

  // ── Setter qui met aussi à jour le ref ──
  const handleSetCurrentUser = (user) => {
    if (user) {
      profileLoadedRef.current = true;
    } else {
      profileLoadedRef.current = false;
    }
    setCurrentUser(user);
  };

  const [displayPlan, setDisplayPlan] = useState(null);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser: handleSetCurrentUser, loading, profileLoadedRef, displayPlan, setDisplayPlan }}>
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
