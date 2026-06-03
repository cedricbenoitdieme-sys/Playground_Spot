import React, { useState } from 'react';
import { useUser } from '../context/UserContext';
import { getProfile } from '../services/auth';
import { supabase } from '../lib/supabase';
import { 
  IconBallFootball, 
  IconMail, 
  IconLock, 
  IconArrowRight, 
  IconArrowLeft, 
} from '@tabler/icons-react';

export const Login = ({ setView }) => {
  const { currentUser, setCurrentUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Si déjà connecté, rediriger
  if (currentUser) {
    const dest = currentUser.role === 'admin' ? 'dashboard' : currentUser.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home';
    setTimeout(() => setView(dest), 0);
    return null;
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Connexion via Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password 
      });
      if (signInError) throw signInError;

      if (data?.user) {
        // Gérer le "Se souvenir de moi"
        // Logique : sessionStorage survit aux refreshs mais est vidé à la fermeture du navigateur.
        // On l'utilise comme sentinelle : si absent au démarrage ET remember=false → sign out.
        if (rememberMe) {
          localStorage.setItem('playgroundspot-remember', 'true');
        } else {
          localStorage.setItem('playgroundspot-remember', 'false');
          sessionStorage.setItem('playgroundspot-session-active', 'true');
        }

        // Chargement immédiat du profil pour éliminer tout temps d'attente
        const profile = await getProfile(data.user.id);
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
        const dest = profile.role === 'admin' ? 'dashboard' : profile.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home';
        setView(dest);
      }
    } catch (err) {
      if (err.message?.includes('Invalid login')) {
        setError('Email ou mot de passe incorrect.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Veuillez confirmer votre adresse email avant de vous connecter.');
      } else {
        setError(err.message || 'Erreur de connexion. Veuillez réessayer.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F2318] text-white flex flex-col justify-center items-center px-4 relative overflow-hidden font-sans select-none">
      
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
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                />
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
              <span className="hover:text-primary transition-colors cursor-pointer">Mot de passe oublié ?</span>
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

    </div>
  );
};
