import React, { useState } from 'react';
import { signUp, signInWithGoogle } from '../services/auth';
import { withTimeout } from '../lib/errorHandler';
import {
  IconBallFootball,
  IconMail,
  IconLock,
  IconUser,
  IconPhone,
  IconMapPin,
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconEye,
  IconEyeOff
} from '@tabler/icons-react';
import { CustomSelect } from '../components/CustomSelect';

const IconCaptainArmband = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <rect x="3" y="6" width="18" height="12" rx="2" fill="currentColor" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="#E8DCC8" strokeWidth="1.5" />
    <line x1="3" y1="15" x2="21" y2="15" stroke="#E8DCC8" strokeWidth="1.5" />
    <path 
      d="M14 10.5C13.5 10 12.8 9.7 12 9.7C10.5 9.7 9.5 10.7 9.5 12C9.5 13.3 10.5 14.3 12 14.3C12.8 14.3 13.5 14 14 13.5" 
      stroke="white" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
  </svg>
);

const QUARTIERS = [
  'Almadies', 'Plateau', 'Médina', 'Parcelles Assainies',
  'Ouakam', 'Yoff', 'Mermoz', 'Guédiawaye', 'Pikine', 'Rufisque', 'Autre'
];

export const Register = ({ setView }) => {
  const [step, setStep] = useState(1); // step 1: rôle, step 2: infos
  const [role, setRole] = useState('joueur');
  const [form, setForm] = useState({ nom: '', email: '', password: '', confirmPassword: '', tel: '', quartier: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  // Compte Google = toujours joueur par défaut (les comptes gérant sont créés
  // par un admin, cf. flow existant Gerants.jsx / POST /api/create-gerant).
  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.userMessage || err.message || 'Connexion Google impossible. Veuillez réessayer.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      return setError('Les mots de passe ne correspondent pas.');
    }
    if (form.password.length < 6) {
      return setError('Le mot de passe doit contenir au moins 6 caractères.');
    }

    setLoading(true);
    setError(null);
    try {
      const result = await withTimeout(signUp({
        email: form.email.trim(),
        password: form.password,
        nom: form.nom.trim(),
        role,
        quartier: form.quartier,
        tel: form.tel.trim(),
      }), 10000);

      // Si e-mail de confirmation requis (session est absente/nulle)
      if (!result?.session) {
        setSuccess(true);
      } else {
        // Connexion immédiate
        const dest = role === 'gerant' ? 'gerant-dashboard' : 'joueur-home';
        setView(dest);
      }
    } catch (err) {
      if (err.message?.includes('already registered')) {
        setError('Cet email est déjà utilisé. Connectez-vous plutôt.');
      } else {
        setError(err.message || 'Erreur lors de l\'inscription.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0F2318] text-white flex flex-col justify-center items-center px-4 relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-primary/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] rounded-full bg-primary/30 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-[420px] z-10 text-center space-y-6">
          <div className="relative inline-block mx-auto">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center border-2 border-primary animate-pulse">
              <IconCaptainArmband size={48} className="text-primary" />
            </div>
            <div className="absolute -top-1 right-0 bg-secondary text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-md">
              Prêt à mener
            </div>
          </div>
          <div>
            <h2 className="font-display font-bold text-2xl text-white">Bienvenue au club, Capitaine ! ⚽</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              Votre profil a été créé avec succès ! <br />
              Préparez-vous à rassembler vos troupes et réserver vos premiers créneaux.
            </p>
          </div>
          <button
            onClick={() => setView('login')}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all flex items-center justify-center gap-2 cursor-pointer shadow-glow"
          >
            Se connecter et mener l'équipe <IconArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F2318] text-white flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">

      {/* Background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-primary/20 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] rounded-full bg-primary/30 blur-[120px] pointer-events-none" />

      {/* Back button */}
      <button
        onClick={() => step === 2 ? setStep(1) : setView('login')}
        className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md transition-all active:scale-95 cursor-pointer"
      >
        <IconArrowLeft size={16} /> {step === 2 ? 'Retour' : 'Connexion'}
      </button>

      <div className="w-full max-w-[460px] z-10 space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-glow">
            <IconBallFootball size={32} className="text-white" />
          </div>
          <div>
            <h2 className="font-display font-bold text-2xl tracking-tight text-white">Créer un compte</h2>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-1">PlaygroundSpot · Dakar</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          <div className={`h-1.5 w-16 rounded-full transition-all ${step >= 1 ? 'bg-primary' : 'bg-white/10'}`} />
          <div className={`h-1.5 w-16 rounded-full transition-all ${step >= 2 ? 'bg-primary' : 'bg-white/10'}`} />
        </div>

        {/* Card */}
        <div className="bg-[#122A1D]/80 border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl backdrop-blur-xl">

          {/* ─── STEP 1 : Choix du rôle ─── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-display font-bold text-lg text-white">Je suis...</h3>
                <p className="text-xs text-gray-400 mt-1">Choisissez votre profil pour personnaliser votre expérience</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Joueur */}
                <button
                  type="button"
                  onClick={() => setRole('joueur')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    role === 'joueur'
                      ? 'border-primary bg-primary/15 shadow-glow'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-2xl mb-2">⚽</div>
                  <div className="font-display font-bold text-sm text-white">Joueur</div>
                  <div className="text-[11px] text-gray-400 mt-1">Réservez et jouez</div>
                  {role === 'joueur' && (
                    <div className="mt-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <IconCheck size={10} className="text-white" />
                    </div>
                  )}
                </button>

                {/* Gérant */}
                <button
                  type="button"
                  onClick={() => setRole('gerant')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    role === 'gerant'
                      ? 'border-primary bg-primary/15 shadow-glow'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="text-2xl mb-2">🏟️</div>
                  <div className="font-display font-bold text-sm text-white">Gérant</div>
                  <div className="text-[11px] text-gray-400 mt-1">Gérez vos terrains</div>
                  {role === 'gerant' && (
                    <div className="mt-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <IconCheck size={10} className="text-white" />
                    </div>
                  )}
                </button>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-glow flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                Continuer <IconArrowRight size={18} />
              </button>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-semibold leading-relaxed">
                  {error}
                </div>
              )}

              {/* Séparateur */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10"></div>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ou</span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>

              {/* Inscription Google (toujours en tant que joueur) */}
              <button
                type="button"
                onClick={handleGoogleSignup}
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
              <p className="text-[10px] text-gray-500 text-center -mt-1">Crée un compte Joueur. Les comptes Gérant sont ouverts par un administrateur.</p>
            </div>
          )}

          {/* ─── STEP 2 : Informations ─── */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h3 className="font-display font-bold text-lg text-white">Vos informations</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Compte <span className="text-primary font-bold capitalize">{role}</span>
                </p>
              </div>

              {role === 'gerant' && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-xs text-gray-300 space-y-1.5 mb-2 leading-relaxed">
                  <span className="font-bold text-amber-400 flex items-center gap-1">📢 Important - Frais de Transaction :</span>
                  La plateforme de paiement sécurisé <span className="font-bold text-white">Unitech Pay</span> (permettant les paiements par <span className="font-bold text-white">Wave</span> et <span className="font-bold text-white">Orange Money</span>) prend <span className="font-bold text-white">1,5% de commission</span> par transaction.
                  <br />
                  <span className="font-bold text-amber-300">Ces frais de 1,5% sont à votre charge</span>. Pensez à adapter votre tarif horaire lors de l'ajout de votre terrain afin de ne pas perdre de marge sur vos réservations.
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs font-semibold leading-relaxed">
                  {error}
                </div>
              )}

              {/* Nom complet */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Nom complet</label>
                <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <IconUser size={16} className="text-gray-400 shrink-0" />
                  <input
                    type="text" name="nom" required
                    value={form.nom} onChange={handleChange}
                    placeholder="Prénom Nom"
                    className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Adresse Email</label>
                <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <IconMail size={16} className="text-gray-400 shrink-0" />
                  <input
                    type="email" name="email" required
                    value={form.email} onChange={handleChange}
                    placeholder="email@exemple.com"
                    className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* Tel + Quartier en ligne */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Téléphone</label>
                  <div className="flex items-center gap-2 bg-[#0A1810]/60 border border-white/5 rounded-xl px-3 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <IconPhone size={14} className="text-gray-400 shrink-0" />
                    <input
                      type="tel" name="tel"
                      value={form.tel} onChange={handleChange}
                      placeholder="+221 77..."
                      className="flex-1 bg-transparent border-none text-white focus:outline-none text-xs placeholder:text-gray-600 w-full"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Quartier</label>
                  <div className="flex items-center gap-2 bg-[#0A1810]/60 border border-white/5 rounded-xl px-3 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                    <IconMapPin size={14} className="text-gray-400 shrink-0" />
                    <CustomSelect
                      value={form.quartier}
                      onChange={(val) => setForm(f => ({ ...f, quartier: val }))}
                      options={QUARTIERS.map(q => ({ label: q, value: q }))}
                      placeholder="Choisir"
                      theme="dark"
                    />
                  </div>
                </div>
              </div>

              {/* Mot de passe */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Mot de passe</label>
                <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <IconLock size={16} className="text-gray-400 shrink-0" />
                  <input
                    type={showPwd ? 'text' : 'password'} name="password" required minLength={6}
                    value={form.password} onChange={handleChange}
                    placeholder="Min. 6 caractères"
                    className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPwd(!showPwd)}
                    className="focus:outline-none transition-transform duration-300 active:scale-90 hover:scale-110 cursor-pointer"
                  >
                    <div className={`transition-all duration-300 transform ${showPwd ? 'rotate-180 scale-100 opacity-90' : 'rotate-0 scale-100 opacity-70'}`}>
                      {showPwd ? (
                        <IconEyeOff size={16} className="text-primary" />
                      ) : (
                        <IconEye size={16} className="text-gray-400" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Confirmation */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Confirmer le mot de passe</label>
                <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <IconLock size={16} className="text-gray-400 shrink-0" />
                  <input
                    type={showConfirmPwd ? 'text' : 'password'} name="confirmPassword" required
                    value={form.confirmPassword} onChange={handleChange}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    className="focus:outline-none transition-transform duration-300 active:scale-90 hover:scale-110 cursor-pointer"
                  >
                    <div className={`transition-all duration-300 transform ${showConfirmPwd ? 'rotate-180 scale-100 opacity-90' : 'rotate-0 scale-100 opacity-70'}`}>
                      {showConfirmPwd ? (
                        <IconEyeOff size={16} className="text-primary" />
                      ) : (
                        <IconEye size={16} className="text-gray-400" />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-glow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-5.5 h-5.5 rounded-full border-2 border-white/30 border-t-white animate-spin mr-2" />
                    Création du compte...
                  </>
                ) : (
                  <>Créer mon compte <IconArrowRight size={18} /></>
                )}
              </button>
            </form>
          )}

          {/* Séparateur */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          {/* Bouton Google */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={googleLoading}
            className="w-full bg-white text-gray-800 font-bold py-3.5 rounded-xl hover:bg-gray-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
          >
            {googleLoading ? (
              <div className="w-5.5 h-5.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
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
        </div>

        {/* Lien connexion */}
        <div className="text-center">
          <p className="text-[11px] text-gray-500 font-semibold">
            Déjà un compte ?{' '}
            <span onClick={() => setView('login')} className="text-primary hover:underline cursor-pointer font-bold">
              Se connecter
            </span>
          </p>
        </div>

        <div className="text-center">
          <p className="text-[10px] text-gray-600 font-semibold tracking-wide">© 2026 PlaygroundSpot · Dakar, Sénégal</p>
        </div>
      </div>
    </div>
  );
};
