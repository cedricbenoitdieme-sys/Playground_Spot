import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { getProfile, signIn, signInWithGoogle, sendPasswordResetEmail, updateUserPassword } from '../services/auth';
import { supabase } from '../lib/supabase';
import { withRetry, withTimeout } from '../lib/errorHandler';
import { 
  IconBallFootball, 
  IconMail, 
  IconLock, 
  IconArrowRight, 
  IconArrowLeft, 
  IconEye,
  IconEyeOff,
  IconX,
  IconCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import { Modal } from '../components/Modal';

// Détecte une erreur renvoyée par Supabase après un retour de redirection OAuth
// (ex: email déjà utilisé par un autre provider — blocage explicite, pas de
// fusion automatique de comptes). Lu une seule fois à l'initialisation du state
// pour éviter un setState synchrone dans un effet (cascading renders).
const readOAuthError = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  const errorDescription = hashParams.get('error_description') || searchParams.get('error_description');
  const errorCode = hashParams.get('error') || searchParams.get('error');

  if (errorCode === 'session_expired') {
    return 'Votre session a expiré. Veuillez vous reconnecter pour continuer.';
  }

  if (!errorDescription && !errorCode) return null;
  if (/already|exist|registered/i.test(errorDescription || '')) {
    return 'Un compte existe déjà avec cet email. Connectez-vous avec votre mot de passe.';
  }
  return 'Connexion Google impossible. Veuillez réessayer ou utiliser votre mot de passe.';
};

export const Login = ({ setView }) => {
  const { currentUser, setCurrentUser, profileLoadedRef } = useUser();
  const [email, setEmail] = useState(() => localStorage.getItem('playgroundspot-saved-email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(readOAuthError);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState(null);

  // Update password modal state (after email link click)
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState(null);

  // Detect password reset token or hash event from Supabase
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const isReset = searchParams.get('reset') === 'true' || hashParams.get('type') === 'recovery';

    if (isReset) {
      setShowResetModal(true);
    }
  }, []);

  // Nettoyage de l'URL (error/error_description) pour ne pas re-déclencher au refresh
  useEffect(() => {
    if (!window.location.hash.includes('error') && !window.location.search.includes('error')) return;
    const cleanSearch = window.location.search.replace(/[?&](error|error_description|error_code)=[^&]*/g, '');
    window.history.replaceState(null, '', window.location.pathname + cleanSearch);
  }, []);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.userMessage || err.message || 'Connexion Google impossible. Veuillez réessayer.');
      setGoogleLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError(null);
    setForgotSuccess(false);

    try {
      await sendPasswordResetEmail(forgotEmail);
      setForgotSuccess(true);
    } catch (err) {
      setForgotError(err.message || "Impossible d'envoyer l'email de réinitialisation.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setResetError('Les mots de passe ne correspondent pas.');
      return;
    }

    setResetLoading(true);
    setResetError(null);

    try {
      await updateUserPassword(newPassword);
      setResetSuccess(true);
      setTimeout(() => {
        setShowResetModal(false);
        setResetSuccess(false);
        setNewPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err) {
      setResetError(err.message || 'Échec de la mise à jour du mot de passe.');
    } finally {
      setResetLoading(false);
    }
  };

  // Si déjà connecté, rediriger
  if (currentUser && !showResetModal) {
    const dest = ['admin', 'super_admin'].includes(currentUser.role) ? 'dashboard' : currentUser.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home';
    setTimeout(() => setView(dest), 0);
    return null;
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Éviter la race condition avec le listener onAuthStateChange de UserContext en bloquant le chargement double
    if (profileLoadedRef) {
      profileLoadedRef.current = true;
    }

    try {
      // Connexion sécurisée avec rate limiter et logs de sécurité
      // withTimeout évite un spinner infini si la requête réseau ne répond jamais
      const data = await withTimeout(signIn({
        email: email.trim(),
        password,
        rememberMe
      }), 20000);

      if (data?.user) {
        // Gérer le "Se souvenir de moi"
        if (rememberMe) {
          localStorage.setItem('playgroundspot-remember', 'true');
          localStorage.setItem('playgroundspot-saved-email', email.trim());
        } else {
          localStorage.setItem('playgroundspot-remember', 'false');
          localStorage.removeItem('playgroundspot-saved-email');
          sessionStorage.setItem('playgroundspot-session-active', 'true');
        }

        // Chargement du profil avec retry pour attendre la fin du trigger DB
        // withTimeout évite un spinner infini si cette requête reste bloquée (ex: réseau IPv6 défaillant)
        // Fenêtre large car withRetry peut prendre plusieurs secondes (2 tentatives + backoff)
        const profile = await withTimeout(
          withRetry(() => getProfile(data.user.id), { maxRetries: 3, baseDelay: 500, context: 'Login' }),
          20000
        );

        if (!profile || profile.statut === 'suspendu' || profile.statut === 'inactif') {
          await supabase.auth.signOut();
          setError('Votre compte est suspendu ou inactif. Contactez l\'administrateur.');
          return;
        }

        const userObj = {
          id: data.user.id,
          nom: profile.nom,
          email: profile.email,
          role: profile.role,
          quartier: profile.quartier,
          tel: profile.tel,
          avatar: profile.avatar || profile.nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
          statut: profile.statut,
        };

        setCurrentUser(userObj);
        const dest = ['admin', 'super_admin'].includes(profile.role) ? 'dashboard' : profile.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home';
        setView(dest);
      }
    } catch (err) {
      if (profileLoadedRef) {
        profileLoadedRef.current = false;
      }
      if (err?.message === 'Failed to fetch' || err?.code === 'NETWORK_ERROR') {
        setError('Impossible de joindre le serveur. Vérifiez votre connexion internet.')
      } else if (
        err.message?.toLowerCase().includes('invalid') ||
        err.message?.toLowerCase().includes('credentials') ||
        err.userMessage?.toLowerCase().includes('incorrect') ||
        err.message?.toLowerCase().includes('incorrect')
      ) {
        setError('Email ou mot de passe incorrect.')
      } else if (err.message?.toLowerCase().includes('email not confirmed')) {
        setError('Veuillez confirmer votre email avant de vous connecter.')
      } else {
        setError(err.userMessage || err.message || 'Erreur de connexion. Veuillez réessayer.')
      }
    } finally {
      setLoading(false)
    }
  };


  return (
    <div className="min-h-[100dvh] bg-[#0F2318] text-white flex flex-col justify-center items-center px-4 relative overflow-hidden font-sans">
      
      {/* Decorative Floating Glowing Background Circles */}
      <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-primary/20 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] rounded-full bg-primary/30 blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[40%] right-[10%] w-[250px] h-[250px] rounded-full bg-[#E8DCC8]/10 blur-[80px] pointer-events-none"></div>

      {/* Back button */}
      <button 
        onClick={() => setView('landing')}
        className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md transition-all active:scale-95 cursor-pointer"
      >
        <IconArrowLeft size={16} /> Retour à l'accueil
      </button>

      {/* Main Container */}
      <div className="w-full max-w-[420px] z-10 space-y-6">
        
        {/* App Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-glow animate-pulse">
            <IconBallFootball size={32} className="text-white" />
          </div>
          <div>
            <h2 className="font-display font-bold text-2xl tracking-tight text-white">Connexion PlaygroundSpot</h2>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Plateforme de réservation de terrains</p>
          </div>
        </div>

        {/* Login Card (Glassmorphism) */}
        <div className="bg-[#122A1D]/80 border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl backdrop-blur-xl space-y-6">
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-semibold leading-relaxed animate-in slide-in-from-top-2 duration-300">
                {error}
              </div>
            )}

            {/* Email Input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Adresse Email</label>
              <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <IconMail size={16} className="text-gray-400" />
                <input 
                  type="email" 
                  required
                  autoComplete="username email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@playgroundspot.com" 
                  className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Mot de passe</label>
              <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <IconLock size={16} className="text-gray-400" />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus:outline-none transition-transform duration-300 active:scale-90 hover:scale-110 cursor-pointer"
                >
                  <div className={`transition-all duration-300 transform ${showPassword ? 'rotate-180 scale-100 opacity-90' : 'rotate-0 scale-100 opacity-70'}`}>
                    {showPassword ? (
                      <IconEyeOff size={16} className="text-primary" />
                    ) : (
                      <IconEye size={16} className="text-gray-400" />
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 font-semibold px-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-white/10 bg-transparent text-primary focus:ring-0 cursor-pointer" 
                />
                Se souvenir
              </label>
              <button 
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotSuccess(false);
                  setForgotError(null);
                  setShowForgotModal(true);
                }}
                className="hover:text-primary transition-colors cursor-pointer"
              >
                Mot de passe oublié ?
              </button>
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-glow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  Connexion...
                </>
              ) : (
                <>
                  Se Connecter <IconArrowRight size={18} />
                </>
              )}
            </button>

          </form>

          {/* Séparateur */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          {/* Connexion Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full bg-white text-gray-800 font-bold py-3.5 rounded-xl hover:bg-gray-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
          >
            {googleLoading ? (
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin"></div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            Continuer avec Google
          </button>

          {/* Inscription */}
          <div className="border-t border-white/5 pt-5 text-center">
            <p className="text-[11px] text-gray-500 font-semibold">
              Pas encore de compte ?{' '}
              <span 
                onClick={() => setView('register')} 
                className="text-primary hover:underline cursor-pointer font-bold"
              >
                Créer un compte
              </span>
            </p>
          </div>

        </div>

        {/* Footer info */}
        <div className="text-center">
          <p className="text-[10px] text-gray-600 font-semibold tracking-wide">&copy; 2026 PlaygroundSpot · Dakar, Sénégal</p>
        </div>

      </div>

      {/* Modal Réinitialisation (Demande d'e-mail) */}
      <Modal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        overlayClassName="bg-black/80"
      >
        <div className="bg-[#122A1D] border border-white/10 w-full max-w-md rounded-[2rem] p-6 sm:p-8 space-y-6 shadow-2xl relative text-white">
            <button 
              onClick={() => setShowForgotModal(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <IconX size={20} />
            </button>

            <div className="space-y-2">
              <h3 className="text-xl font-bold font-display">Mot de passe oublié</h3>
              <p className="text-xs text-gray-400">
                Saisissez votre e-mail. Nous vous enverrons un lien sécurisé pour choisir un nouveau mot de passe.
              </p>
            </div>

            {forgotSuccess ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <IconCheck size={24} />
                </div>
                <p className="text-xs text-emerald-300 font-semibold">
                  E-mail envoyé ! Vérifiez votre boîte de réception (et vos spams) et cliquez sur le lien.
                </p>
                <button
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 bg-emerald-500 text-black font-bold text-xs rounded-xl hover:bg-emerald-400 transition-all"
                >
                  Fermer
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                {forgotError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
                    <IconAlertCircle size={16} />
                    <span>{forgotError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Adresse Email</label>
                  <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <IconMail size={16} className="text-gray-400" />
                    <input 
                      type="email" 
                      required
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="votre.email@exemple.com" 
                      className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-all shadow-glow flex items-center justify-center gap-2 text-sm disabled:opacity-70 cursor-pointer"
                >
                  {forgotLoading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  ) : (
                    <span>Envoyer le lien de réinitialisation</span>
                  )}
                </button>
              </form>
            )}
          </div>
      </Modal>

      {/* Modal Nouveau Mot de Passe (Après clic sur l'e-mail) */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        overlayClassName="bg-black/85"
      >
        <div className="bg-[#122A1D] border border-white/10 w-full max-w-md rounded-[2rem] p-6 sm:p-8 space-y-6 shadow-2xl relative text-white">
            <button 
              onClick={() => setShowResetModal(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <IconX size={20} />
            </button>

            <div className="space-y-2">
              <h3 className="text-xl font-bold font-display text-emerald-400">Nouveau mot de passe</h3>
              <p className="text-xs text-gray-300">
                Saisissez votre nouveau mot de passe sécurisé pour finaliser la réinitialisation.
              </p>
            </div>

            {resetSuccess ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <IconCheck size={24} />
                </div>
                <p className="text-xs text-emerald-300 font-bold">
                  Mot de passe mis à jour avec succès ! Vous êtes connecté.
                </p>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                {resetError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
                    <IconAlertCircle size={16} />
                    <span>{resetError}</span>
                  </div>
                )}

                {/* Nouveau Mot de passe */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Nouveau mot de passe</label>
                  <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <IconLock size={16} className="text-gray-400" />
                    <input 
                      type={showNewPassword ? 'text' : 'password'} 
                      required
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe (min. 6 car.)" 
                      className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="focus:outline-none transition-transform duration-300 active:scale-90 hover:scale-110 cursor-pointer"
                    >
                      {showNewPassword ? (
                        <IconEyeOff size={16} className="text-primary" />
                      ) : (
                        <IconEye size={16} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirmation Mot de passe */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Confirmer le mot de passe</label>
                  <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <IconLock size={16} className="text-gray-400" />
                    <input 
                      type={showConfirmPassword ? 'text' : 'password'} 
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirmez le nouveau mot de passe" 
                      className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="focus:outline-none transition-transform duration-300 active:scale-90 hover:scale-110 cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <IconEyeOff size={16} className="text-primary" />
                      ) : (
                        <IconEye size={16} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-3.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-all shadow-glow flex items-center justify-center gap-2 text-sm disabled:opacity-70 cursor-pointer"
                >
                  {resetLoading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  ) : (
                    <span>Valider mon nouveau mot de passe</span>
                  )}
                </button>
              </form>
            )}
          </div>
      </Modal>

    </div>
  );
};
