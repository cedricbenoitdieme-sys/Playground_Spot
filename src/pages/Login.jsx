import React, { useState } from 'react';
import { useUser, MOCK_USERS } from '../context/UserContext';
import { 
  IconBallFootball, 
  IconMail, 
  IconLock, 
  IconArrowRight, 
  IconArrowLeft, 
  IconCheck, 
  IconUser, 
  IconBuildingStore, 
  IconUserShield 
} from '@tabler/icons-react';

export const Login = ({ setView }) => {
  const { setCurrentUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Simulated network delay
    setTimeout(() => {
      // Find matching mock user by email
      const matchedRole = Object.keys(MOCK_USERS).find(
        (key) => MOCK_USERS[key].email.toLowerCase() === email.trim().toLowerCase()
      );

      if (matchedRole) {
        const user = MOCK_USERS[matchedRole];
        setCurrentUser(user);
        setLoading(false);
        // Redirect based on role
        setView(user.role === 'admin' ? 'dashboard' : user.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home');
      } else {
        setLoading(false);
        setError("Identifiants de démonstration incorrects. Utilisez la Connexion Rapide ci-dessous !");
      }
    }, 1000);
  };

  const handleQuickLogin = (roleKey) => {
    setLoading(true);
    setError(null);
    const user = MOCK_USERS[roleKey];
    setEmail(user.email);
    setPassword('••••••••'); // visual feedback

    setTimeout(() => {
      setCurrentUser(user);
      setLoading(false);
      setView(user.role === 'admin' ? 'dashboard' : user.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home');
    }, 800);
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
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">Espace SaaS d'administration</p>
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
                <input type="checkbox" defaultChecked className="rounded border-white/10 bg-transparent text-primary focus:ring-0 cursor-pointer" />
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

          {/* Quick Login Section (Connexion Rapide) */}
          <div className="space-y-3.5 border-t border-white/5 pt-5">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">🧪 Connexion Rapide Démo</span>
              <p className="text-[9px] text-gray-600 font-semibold mt-0.5">Cliquez sur un rôle pour vous connecter instantanément</p>
            </div>
            
            <div className="grid grid-cols-3 gap-2.5">
              {/* Admin Pill */}
              <button 
                onClick={() => handleQuickLogin('admin')}
                disabled={loading}
                className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col items-center gap-1.5 hover:bg-white/10 active:scale-95 transition-all text-center group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IconUserShield size={18} />
                </div>
                <span className="text-[10px] font-bold text-gray-300">Admin</span>
              </button>

              {/* Gérant Pill */}
              <button 
                onClick={() => handleQuickLogin('gerant')}
                disabled={loading}
                className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col items-center gap-1.5 hover:bg-white/10 active:scale-95 transition-all text-center group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IconBuildingStore size={18} />
                </div>
                <span className="text-[10px] font-bold text-gray-300">Gérant</span>
              </button>

              {/* Joueur Pill */}
              <button 
                onClick={() => handleQuickLogin('joueur')}
                disabled={loading}
                className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col items-center gap-1.5 hover:bg-white/10 active:scale-95 transition-all text-center group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary-light flex items-center justify-center group-hover:scale-105 transition-transform">
                  <IconUser size={18} />
                </div>
                <span className="text-[10px] font-bold text-gray-300">Joueur</span>
              </button>
            </div>
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
