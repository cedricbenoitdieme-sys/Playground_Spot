import React, { useState } from 'react';
import { signUp } from '../services/auth';
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
} from '@tabler/icons-react';

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

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

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
      const result = await signUp({
        email: form.email.trim(),
        password: form.password,
        nom: form.nom.trim(),
        role,
        quartier: form.quartier,
        tel: form.tel.trim(),
      });

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
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto shadow-glow animate-bounce">
            <IconCheck size={40} className="text-white" />
          </div>
          <div>
            <h2 className="font-display font-bold text-2xl text-white">Compte créé !</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              Votre compte a été créé avec succès !
              <br />Vous pouvez maintenant vous connecter.
            </p>
          </div>
          <button
            onClick={() => setView('login')}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all flex items-center justify-center gap-2 cursor-pointer shadow-glow"
          >
            Se connecter <IconArrowRight size={18} />
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
                    <select
                      name="quartier"
                      value={form.quartier} onChange={handleChange}
                      className="flex-1 bg-transparent border-none text-white focus:outline-none text-xs w-full cursor-pointer"
                      style={{ background: 'transparent' }}
                    >
                      <option value="" className="bg-[#0F2318]">Choisir</option>
                      {QUARTIERS.map(q => (
                        <option key={q} value={q} className="bg-[#0F2318]">{q}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Mot de passe */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Mot de passe</label>
                <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <IconLock size={16} className="text-gray-400 shrink-0" />
                  <input
                    type="password" name="password" required minLength={6}
                    value={form.password} onChange={handleChange}
                    placeholder="Min. 6 caractères"
                    className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* Confirmation */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#E8DCC8] uppercase tracking-widest pl-1">Confirmer le mot de passe</label>
                <div className="flex items-center gap-3 bg-[#0A1810]/60 border border-white/5 rounded-xl px-4 py-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <IconLock size={16} className="text-gray-400 shrink-0" />
                  <input
                    type="password" name="confirmPassword" required
                    value={form.confirmPassword} onChange={handleChange}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent border-none text-white focus:outline-none text-sm placeholder:text-gray-600"
                  />
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
