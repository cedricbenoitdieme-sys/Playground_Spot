import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconSearch, IconPlus, IconX, IconPhone, IconMail,
  IconMapPin, IconBallFootball, IconStarFilled,
  IconCheck, IconBan, IconTrash, IconEdit, IconChevronRight,
  IconLoader2
} from '@tabler/icons-react';
import { supabase } from '../lib/supabase';
import { fetchGerants, updateProfileStatut } from '../services/profiles';
import { Avatar } from '../components/Avatar';

/* ── Helpers ── */
const fmt = (n) => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M FCFA';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K FCFA';
  return n.toLocaleString('fr-FR') + ' FCFA';
};

const StatusBadge = ({ statut }) => {
  const map = {
    'actif':      'bg-green-50 text-green-700 border-green-200',
    'suspendu':   'bg-red-50 text-red-600 border-red-200',
    'en attente': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'en_attente': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };
  const label = statut === 'en_attente' ? 'En attente' : statut;
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${map[statut] || 'bg-gray-100 text-gray-500'}`}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
};
/* ── Bottom Sheet ── */
const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 z-10">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-lg text-primary-dark">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <IconX size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  , document.body);
};

/* ── Gérant Card (mobile) ── */
const GerantCard = ({ g, onClick }) => (
  <button
    onClick={() => onClick(g)}
    className="w-full bg-white rounded-2xl border border-black/5 shadow-subtle p-4 flex items-center gap-4 text-left hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
    style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
  >
    <Avatar
      user={g}
      className="w-12 h-12 rounded-xl"
      textSize="text-sm"
      bgClass={
        g.statut === 'actif' ? 'bg-primary/10 text-primary' :
        g.statut === 'suspendu' ? 'bg-red-50 text-red-500' :
        'bg-yellow-50 text-yellow-600'
      }
    />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <p className="font-bold text-primary-dark truncate">{g.nom}</p>
        <StatusBadge statut={g.statut} />
      </div>
      <p className="text-[11px] text-gray-400 font-medium">{g.quartier || 'Dakar'} · {(g.terrains || []).length} terrain{(g.terrains || []).length > 1 ? 's' : ''}</p>
      <div className="flex items-center gap-3 mt-1.5">
        <span className="text-xs font-bold text-primary">{fmt(g.revenus)}</span>
        {g.note && (
          <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
            <IconStarFilled size={11} /> {g.note}
          </span>
        )}
      </div>
    </div>
    <IconChevronRight size={18} className="text-gray-300 flex-shrink-0" />
  </button>
);

/* ══════════════════════════ PAGE ══════════════════════════ */
const STATUTS = ['tous', 'actif', 'suspendu', 'en_attente'];

export const Gerants = () => {
  const [search, setSearch]       = useState('');
  const [filtreStatut, setFiltre] = useState('tous');
  const [selected, setSelected]   = useState(null);
  const [showAddForm, setAddForm] = useState(false);
  const [toast, setToast]         = useState(null);
  const [gerants, setGerants]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [newForm, setNewForm]     = useState({ nom: '', email: '', tel: '', quartier: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchGerants();
        setGerants(data);
      } catch (err) {
        console.error('Erreur chargement gérants:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleAddGerant = async (e) => {
    e.preventDefault();
    if (!newForm.nom.trim() || !newForm.email.trim()) return;
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session expirée. Veuillez vous reconnecter.');
      }

      const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
      const response = await fetch(`${baseUrl}/api/create-gerant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nom: newForm.nom.trim(),
          email: newForm.email.trim().toLowerCase(),
          tel: newForm.tel.trim() || null,
          quartier: newForm.quartier.trim() || null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erreur lors du traitement de la requête');
      }

      const data = await response.json();

      const profileData = data.user;
      const initiales = profileData.nom.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const nouveau = {
        ...profileData,
        initiales,
        terrains: [],
        revenus: 0,
        reservations: 0,
        note: null,
        dateInscription: new Date(profileData.created_at).toLocaleDateString('fr-FR'),
      };
      setGerants(prev => [nouveau, ...prev]);
      setNewForm({ nom: '', email: '', tel: '', quartier: '' });
      setAddForm(false);
      showToast(`${nouveau.nom} ajouté ✓ — mot de passe temporaire : ${data.tempPassword}`);
    } catch (err) {
      console.error(err);
      showToast("Erreur de création : " + (err.message || err.error_description || "Une erreur est survenue"));
    }
  };

  const filtered = gerants.filter(g => {
    const matchSearch = g.nom.toLowerCase().includes(search.toLowerCase()) ||
                        g.quartier.toLowerCase().includes(search.toLowerCase());
    const matchStatut = filtreStatut === 'tous' || g.statut === filtreStatut;
    return matchSearch && matchStatut;
  });

  const handleSuspend = async (g) => {
    try {
      const nextStatut = g.statut === 'suspendu' ? 'actif' : 'suspendu';
      await updateProfileStatut(g.id, nextStatut);
      setGerants(prev => prev.map(x => x.id === g.id ? { ...x, statut: nextStatut } : x));
      setSelected(null);
      showToast(g.statut === 'suspendu' ? `${g.nom} réactivé ✓` : `${g.nom} suspendu`);
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la suspension : " + err.message);
    }
  };

  const handleApprove = async (g) => {
    try {
      await updateProfileStatut(g.id, 'actif');
      setGerants(prev => prev.map(x => x.id === g.id ? { ...x, statut: 'actif' } : x));
      setSelected(null);
      showToast(`${g.nom} approuvé ✓`);
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'approbation : " + err.message);
    }
  };

  const handleDelete = async (g) => {
    try {
      await updateProfileStatut(g.id, 'inactif');
      setGerants(prev => prev.filter(x => x.id !== g.id));
      setSelected(null);
      showToast(`${g.nom} supprimé`);
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la suppression : " + err.message);
    }
  };

  const stats = {
    total: gerants.length,
    actifs: gerants.filter(g => g.statut === 'actif').length,
    suspendus: gerants.filter(g => g.statut === 'suspendu').length,
    enAttente: gerants.filter(g => g.statut === 'en attente').length,
  };

  return (
    <div className="flex-1 overflow-y-auto pb-28 lg:pb-12">

      {/* Header */}
      <div className="px-5 lg:px-8 pt-6 pb-4" style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-primary-dark tracking-tight">Gérants</h1>
            <p className="text-xs text-gray-400 font-medium mt-0.5">{stats.total} gérants inscrits</p>
          </div>
          <button
            onClick={() => setAddForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white font-bold text-sm rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dark active:scale-95 transition-all min-h-[44px]"
          >
            <IconPlus size={18} /> Ajouter
          </button>
        </div>
      </div>

      {/* Résumé KPIs */}
      <div className="px-5 lg:px-8 mb-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Actifs',     val: stats.actifs,    color: 'text-green-600', bg: 'bg-green-50',  filter: 'actif'      },
            { label: 'Suspendus',  val: stats.suspendus, color: 'text-red-500',   bg: 'bg-red-50',    filter: 'suspendu'   },
            { label: 'En attente', val: stats.enAttente, color: 'text-yellow-600',bg: 'bg-yellow-50', filter: 'en attente' },
          ].map((s, i) => (
            <button key={i} onClick={() => setFiltre(f => f === s.filter ? 'tous' : s.filter)}
              className={`${s.bg} rounded-2xl p-3 text-center transition-all active:scale-95 cursor-pointer min-h-[72px] ${
                filtreStatut === s.filter ? 'ring-2 ring-offset-1 ring-current shadow-md scale-[1.02]' : 'hover:opacity-80'
              }`}
              style={{ animation: `slideUp 0.4s ${i * 0.08}s cubic-bezier(.22,1,.36,1) both` }}>
              <p className={`text-2xl font-display font-black ${s.color}`}>{s.val}</p>
              <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recherche + filtres */}
      <div className="px-5 lg:px-8 mb-4 space-y-3">
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm focus-within:ring-2 ring-primary/20 transition-all">
          <IconSearch size={18} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Rechercher un gérant ou quartier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none focus:outline-none text-sm"
          />
          {search && <button onClick={() => setSearch('')}><IconX size={16} className="text-gray-400" /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {STATUTS.map(s => (
            <button key={s} onClick={() => setFiltre(s)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all min-h-[36px] ${
                filtreStatut === s ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/30'
              }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="px-5 lg:px-8 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <IconBallFootball size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Aucun gérant trouvé</p>
          </div>
        ) : (
          filtered.map((g, i) => (
            <div key={g.id} style={{ animationDelay: `${i * 0.06}s` }}>
              <GerantCard g={g} onClick={setSelected} />
            </div>
          ))
        )}
      </div>

      {/* Sheet: profil gérant */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.nom || ''}>
        {selected && (
          <div>
            {/* Profil header */}
            <div className="p-5 bg-gradient-to-br from-primary/5 to-transparent border-b border-gray-100">
              <div className="flex items-center gap-4">
                <Avatar
                  user={selected}
                  className="w-16 h-16 rounded-2xl"
                  textSize="text-xl"
                  bgClass={
                    selected.statut === 'actif' ? 'bg-primary/10 text-primary' :
                    selected.statut === 'suspendu' ? 'bg-red-50 text-red-500' : 'bg-yellow-50 text-yellow-600'
                  }
                />
                <div>
                  <p className="font-bold text-lg text-primary-dark">{selected.nom}</p>
                  <StatusBadge statut={selected.statut} />
                  <p className="text-xs text-gray-400 mt-1">Inscrit le {selected.dateInscription || (selected.created_at ? new Date(selected.created_at).toLocaleDateString('fr-FR') : '—')}</p>
                </div>
              </div>
            </div>

            {/* Infos */}
            <div className="p-5 space-y-3">
              {[
                { icon: IconMail,    val: selected.email || 'Non renseigné' },
                { icon: IconPhone,   val: selected.tel || selected.telephone || 'Non renseigné' },
                { icon: IconMapPin,  val: selected.quartier || 'Non renseigné' },
              ].map(({ icon: Icon, val }, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Icon size={18} className="text-primary flex-shrink-0" />
                  <span className="text-sm text-gray-700 font-medium">{val}</span>
                </div>
              ))}

              {/* Terrains */}
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Terrains gérés ({selected.terrainCount ?? selected.terrains?.length ?? 0})
                </p>
                <div className="space-y-1.5">
                  {(selected.terrains || []).length === 0 ? (
                    <p className="text-xs text-gray-400 font-medium">Aucun terrain enregistré</p>
                  ) : (
                    (selected.terrains || []).map((t, i) => {
                      const name = typeof t === 'string' ? t : (t.nom || t.name || 'Terrain');
                      const status = typeof t === 'object' ? (t.status || t.statut) : null;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm font-semibold text-gray-700">
                          <div className="flex items-center gap-2">
                            <IconBallFootball size={14} className="text-primary flex-shrink-0" />
                            <span>{name}</span>
                          </div>
                          {status && (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              status === 'approved' || status === 'actif' ? 'bg-green-100 text-green-700' :
                              status === 'pending' || status === 'en_attente' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {status === 'approved' || status === 'actif' ? 'Approuvé' : status === 'pending' || status === 'en_attente' ? 'En attente' : 'Rejeté'}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-primary/5 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-primary">{selected.reservations}</p>
                  <p className="text-[10px] text-gray-500 font-semibold">Réservations</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-amber-500">{selected.note ?? '—'}</p>
                  <p className="text-[10px] text-gray-500 font-semibold">Note moy.</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-black text-green-600">{selected.revenus > 0 ? (selected.revenus/1000).toFixed(0)+'k' : '—'}</p>
                  <p className="text-[10px] text-gray-500 font-semibold">Revenus</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 pt-0 space-y-2">
              {selected.statut === 'en attente' && (
                <button onClick={() => handleApprove(selected)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px]">
                  <IconCheck size={18} /> Approuver le compte
                </button>
              )}
              <button onClick={() => handleSuspend(selected)}
                className={`w-full flex items-center justify-center gap-2 py-3.5 font-bold rounded-xl min-h-[48px] transition-all ${
                  selected.statut === 'suspendu'
                    ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                    : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
                }`}>
                <IconBan size={18} />
                {selected.statut === 'suspendu' ? 'Réactiver le compte' : 'Suspendre le compte'}
              </button>
              <button onClick={() => handleDelete(selected)}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 text-red-600 font-bold border border-red-200 rounded-xl hover:bg-red-100 min-h-[48px]">
                <IconTrash size={18} /> Supprimer le gérant
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Sheet: Ajouter gérant */}
      <Sheet open={showAddForm} onClose={() => setAddForm(false)} title="Nouveau gérant">
        <form className="p-5 space-y-4" onSubmit={handleAddGerant}>
          {[
            { label: 'Nom complet', key: 'nom', type: 'text' },
            { label: 'Email',       key: 'email', type: 'email' },
            { label: 'Téléphone',   key: 'tel', type: 'tel' },
            { label: 'Quartier',    key: 'quartier', type: 'text' },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">{label}</label>
              <input
                required={key === 'nom' || key === 'email'}
                type={type}
                value={newForm[key]}
                onChange={e => setNewForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20 transition-all"
                placeholder={label + '…'}
              />
            </div>
          ))}
          <button type="submit" className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 min-h-[48px] hover:bg-primary-dark transition-colors">
            Créer le compte gérant
          </button>
        </form>
      </Sheet>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-medium z-[150] animate-in slide-in-from-bottom-5 duration-300 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
};
