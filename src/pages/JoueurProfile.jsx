import React, { useState, useEffect } from 'react';
import { 
  IconUser, 
  IconTrendingUp, 
  IconClock, 
  IconCheck, 
  IconBallFootball, 
  IconShieldCheck,
  IconTrophy,
  IconPhone,
  IconMail,
  IconMapPin,
  IconLoader2
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { formatAmountAbbreviated } from '../services/stats';
import { getLoyaltyBadge } from '../lib/loyalty';

export const JoueurProfile = () => {
  const { currentUser, setCurrentUser } = useUser();

  const [stats, setStats] = useState({
    matchs_joues: 0,
    heures_cumulees: 0,
    montant_depense: 0,
    reservations_total: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  const [profile, setProfile] = useState({
    nom: currentUser?.nom || '',
    email: currentUser?.email || '',
    tel: currentUser?.tel || '',
    quartier: currentUser?.quartier || '',
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfile({
        nom: currentUser.nom || '',
        email: currentUser.email || '',
        tel: currentUser.tel || '',
        quartier: currentUser.quartier || '',
      });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const loadStats = async () => {
      try {
        setLoadingStats(true);
        const { data, error } = await supabase.rpc('get_joueur_profile_stats');
        if (!error && data) {
          setStats(data);
        } else {
          // Fallback en cas de RPC non déployée
          const { data: resData } = await supabase
            .from('reservations')
            .select('montant, duree_heures, statut')
            .eq('joueur_id', currentUser.id);

          if (resData) {
            const validRes = resData.filter(r => r.statut === 'confirmee' || r.statut === 'terminee');
            setStats({
              matchs_joues: validRes.length,
              heures_cumulees: validRes.reduce((sum, r) => sum + (r.duree_heures || 1), 0),
              montant_depense: validRes.reduce((sum, r) => sum + (r.montant || 0), 0),
              reservations_total: resData.length,
            });
          }
        }
      } catch (err) {
        console.error('Erreur get_joueur_profile_stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };
    loadStats();
  }, [currentUser?.id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          nom: profile.nom.trim(),
          tel: profile.tel.trim(),
          quartier: profile.quartier.trim(),
        })
        .eq('id', currentUser.id)
        .select()
        .single();

      if (error) throw error;

      if (data && setCurrentUser) {
        setCurrentUser(prev => ({
          ...prev,
          nom: data.nom,
          tel: data.tel,
          quartier: data.quartier,
          initiales: data.nom ? data.nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : prev?.initiales,
        }));
      }

      setEditing(false);
      showToast("Profil mis à jour avec succès !");
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la sauvegarde du profil.");
    } finally {
      setSaving(false);
    }
  };

  const rank = getLoyaltyBadge(stats.matchs_joues);
  const formattedSpent = stats.montant_depense > 0 
    ? `${formatAmountAbbreviated(stats.montant_depense)} FCFA` 
    : '0 FCFA';

  const statCards = [
    { label: "Matchs joués", value: stats.matchs_joues, icon: IconBallFootball },
    { label: "Heures cumulées", value: `${stats.heures_cumulees}h`, icon: IconClock },
    { label: "Montant dépensé", value: formattedSpent, icon: IconTrendingUp },
  ];

  const hasAvatarUrl = currentUser?.avatar && (currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('/'));

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
      {/* Player identity card */}
      <div 
        className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-subtle border border-black/5 flex flex-col md:flex-row items-center justify-between gap-6"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
          {hasAvatarUrl && !imgError ? (
            <img 
              src={currentUser.avatar} 
              alt={currentUser.nom} 
              className="w-16 h-16 rounded-full object-cover border-4 border-primary/20 shadow-lg shadow-primary/10 flex-shrink-0"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary text-white font-black text-xl flex items-center justify-center border-4 border-primary/20 shadow-lg shadow-primary/10 flex-shrink-0">
              {currentUser?.initiales || (currentUser?.nom || '').substring(0, 2).toUpperCase() || '??'}
            </div>
          )}
          <div>
            <h2 className="text-xl font-display font-bold text-primary-dark">{currentUser?.nom || 'Joueur'}</h2>
            <p className="text-xs text-gray-500 font-semibold flex items-center gap-1 justify-center md:justify-start mt-0.5">
              <IconShieldCheck size={12} className="text-primary" /> Membre vérifié · {currentUser?.quartier || 'Dakar'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 border ${rank.color}`}>
            <IconTrophy size={16} />
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Rang Fidélité</p>
              <p className="text-xs font-black">{rank.label} {rank.emoji}</p>
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
              <h3 className="text-2xl font-bold text-primary-dark">
                {loadingStats ? (
                  <span className="inline-block w-16 h-6 bg-gray-100 animate-pulse rounded"></span>
                ) : (
                  c.value
                )}
              </h3>
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
            onClick={() => {
              setEditing(!editing);
              if (!editing) {
                setProfile({
                  nom: currentUser?.nom || '',
                  email: currentUser?.email || '',
                  tel: currentUser?.tel || '',
                  quartier: currentUser?.quartier || '',
                });
              }
            }}
            className="text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            {editing ? 'Annuler' : 'Modifier'}
          </button>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nom complet</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <IconUser size={16} className="text-gray-400 shrink-0" />
                <input 
                  type="text" 
                  disabled={!editing}
                  required
                  value={profile.nom}
                  onChange={(e) => setProfile({ ...profile, nom: e.target.value })}
                  className="w-full bg-transparent text-xs font-semibold text-gray-800 focus:outline-none disabled:text-gray-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Adresse e-mail (Lecture seule)</label>
              <div className="flex items-center gap-2 bg-gray-100/70 border border-gray-100 rounded-xl px-4 py-3 cursor-not-allowed">
                <IconMail size={16} className="text-gray-400 shrink-0" />
                <input 
                  type="email" 
                  disabled
                  value={profile.email}
                  className="w-full bg-transparent text-xs font-semibold text-gray-500 focus:outline-none cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Téléphone</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <IconPhone size={16} className="text-gray-400 shrink-0" />
                <input 
                  type="text" 
                  disabled={!editing}
                  placeholder="+221 77..."
                  value={profile.tel}
                  onChange={(e) => setProfile({ ...profile, tel: e.target.value })}
                  className="w-full bg-transparent text-xs font-semibold text-gray-800 focus:outline-none disabled:text-gray-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quartier</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <IconMapPin size={16} className="text-gray-400 shrink-0" />
                <input 
                  type="text" 
                  disabled={!editing}
                  placeholder="Ex: Yoff, Almadies..."
                  value={profile.quartier}
                  onChange={(e) => setProfile({ ...profile, quartier: e.target.value })}
                  className="w-full bg-transparent text-xs font-semibold text-gray-800 focus:outline-none disabled:text-gray-500"
                />
              </div>
            </div>
          </div>

          {editing && (
            <button 
              type="submit" 
              disabled={saving}
              className="btn-primary w-full md:w-auto px-6 h-12 cursor-pointer font-bold flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {saving ? (
                <>
                  <IconLoader2 size={18} className="animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer modifications'
              )}
            </button>
          )}
        </form>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};
