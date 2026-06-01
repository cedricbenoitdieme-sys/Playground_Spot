import React, { useState } from 'react';
import { 
  IconUser, 
  IconTrendingUp, 
  IconClock, 
  IconCheck, 
  IconBallFootball, 
  IconShieldCheck,
  IconTrophy
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';

export const JoueurProfile = () => {
  const { currentUser } = useUser();
  const [profile, setProfile] = useState({
    nom: currentUser.nom,
    email: currentUser.email,
    phone: "+221 77 123 45 67",
    favPosition: "Milieu Offensif",
    matchs: 18,
    hours: 36,
    spent: "240K FCFA"
  });
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(false);

  const saveProfile = (e) => {
    e.preventDefault();
    setEditing(false);
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  };

  const statCards = [
    { label: "Matchs joués", value: profile.matchs, icon: IconBallFootball },
    { label: "Heures cumulées", value: `${profile.hours}h`, icon: IconClock },
    { label: "Montant dépensé", value: profile.spent, icon: IconTrendingUp },
  ];

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
      {/* Player identity card */}
      <div 
        className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-subtle border border-black/5 flex flex-col md:flex-row items-center justify-between gap-6"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
          <div className="w-16 h-16 rounded-full bg-primary text-white font-black text-xl flex items-center justify-center border-4 border-primary/20 shadow-lg shadow-primary/10">
            {currentUser.avatar}
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-primary-dark">{profile.nom}</h2>
            <p className="text-xs text-gray-500 font-semibold flex items-center gap-1 justify-center md:justify-start mt-0.5"><IconShieldCheck size={12} className="text-primary" /> Membre vérifié</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="bg-secondary/15 border border-secondary/25 text-secondary px-4 py-2 rounded-2xl flex items-center gap-2">
            <IconTrophy size={16} />
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Rang Fidélité</p>
              <p className="text-xs font-black">VIP Or 🥇</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats counter list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((c, index) => (
          <div 
            key={index} 
            className="bg-white p-5 rounded-card shadow-subtle border border-black/5 flex items-center justify-between group hover:border-primary/20 hover:shadow-md transition-all"
            style={{ 
              animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
              animationDelay: `${index * 0.08 + 0.05}s`
            }}
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{c.label}</p>
              <h3 className="text-2xl font-bold text-primary-dark">{c.value}</h3>
            </div>
            <div className="w-12 h-12 bg-primary/5 text-primary rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
              <c.icon size={22} />
            </div>
          </div>
        ))}
      </div>

      {/* Edit Profile Form & Settings */}
      <div 
        className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-6"
        style={{ animation: 'slideUp 0.4s 0.2s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Mes Informations de Profil</h3>
          <button 
            onClick={() => setEditing(!editing)}
            className="text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            {editing ? 'Annuler' : 'Modifier'}
          </button>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nom complet</label>
              <input 
                type="text" 
                disabled={!editing}
                value={profile.nom}
                onChange={(e) => setProfile({ ...profile, nom: e.target.value })}
                className="w-full bg-gray-50 disabled:bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Adresse e-mail</label>
              <input 
                type="email" 
                disabled={!editing}
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full bg-gray-50 disabled:bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Téléphone</label>
              <input 
                type="text" 
                disabled={!editing}
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full bg-gray-50 disabled:bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Poste Préféré</label>
              <input 
                type="text" 
                disabled={!editing}
                value={profile.favPosition}
                onChange={(e) => setProfile({ ...profile, favPosition: e.target.value })}
                className="w-full bg-gray-50 disabled:bg-gray-50/50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {editing && (
            <button type="submit" className="btn-primary w-full md:w-auto px-6 h-12 cursor-pointer font-bold">
              Enregistrer modifications
            </button>
          )}
        </form>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">Profil enregistré avec succès !</span>
        </div>
      )}
    </div>
  );
};
