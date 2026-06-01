import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconSearch, IconX, IconPhone, IconMail, IconMapPin,
  IconCalendarEvent, IconStarFilled, IconBan, IconTrash,
  IconChevronRight, IconTrendingUp, IconClock, IconUserOff,
} from '@tabler/icons-react';
import { UTILISATEURS } from '../data/mockData';

/* ── Helpers ── */
const fmt = (n) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M FCFA';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K FCFA';
  return n > 0 ? n.toLocaleString('fr-FR') + ' FCFA' : '—';
};
const niveau = (r) => r >= 15 ? { label: 'VIP', color: 'text-amber-600 bg-amber-50 border-amber-200' }
  : r >= 8  ? { label: 'Régulier', color: 'text-primary bg-primary/5 border-primary/20' }
  : r >= 3  ? { label: 'Actif', color: 'text-blue-600 bg-blue-50 border-blue-200' }
  : { label: 'Nouveau', color: 'text-gray-500 bg-gray-50 border-gray-200' };

const StatutBadge = ({ s }) => {
  const map = { actif: 'bg-green-50 text-green-700 border-green-200', suspendu: 'bg-red-50 text-red-600 border-red-200', inactif: 'bg-gray-100 text-gray-500 border-gray-200' };
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${map[s] || 'bg-gray-100 text-gray-500'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
};

const ReservStatut = ({ s }) => {
  const map = { Confirmée: 'text-green-700 bg-green-50', Terminée: 'text-gray-500 bg-gray-100', Annulée: 'text-red-600 bg-red-50', 'En attente': 'text-yellow-700 bg-yellow-50' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>;
};

/* ── Bottom Sheet ── */
const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 lg:left-64 z-[9999]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-lg text-primary-dark">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"><IconX size={18} /></button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  , document.body);
};

/* ── User Card ── */
const UserCard = ({ u, onClick }) => {
  const niv = niveau(u.reservations);
  return (
    <button onClick={() => onClick(u)}
      className="w-full bg-white rounded-2xl border border-black/5 shadow-subtle p-4 flex items-center gap-4 text-left hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
      style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
      {/* Avatar */}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${u.statut === 'suspendu' ? 'bg-red-50 text-red-500' : u.statut === 'inactif' ? 'bg-gray-100 text-gray-400' : 'bg-primary/10 text-primary'}`}>
        {u.initiales}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-bold text-primary-dark truncate">{u.nom}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${niv.color}`}>{niv.label}</span>
          <StatutBadge s={u.statut} />
        </div>
        <p className="text-[11px] text-gray-400 font-medium">{u.quartier} · dernier accès {u.dernierAcces}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs font-bold text-primary">{u.reservations} résa</span>
          <span className="text-xs text-gray-500 font-semibold">{fmt(u.depenses)}</span>
          {u.note && <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500"><IconStarFilled size={10} />{u.note}</span>}
        </div>
      </div>
      <IconChevronRight size={18} className="text-gray-300 flex-shrink-0" />
    </button>
  );
};

/* ══════════════ PAGE ══════════════ */
const STATUTS = ['tous', 'actif', 'suspendu', 'inactif'];
const TRIS = [
  { key: 'reservations', label: 'Réservations' },
  { key: 'depenses', label: 'Dépenses' },
  { key: 'dateInscription', label: 'Récents' },
];

export const Utilisateurs = () => {
  const [search, setSearch]   = useState('');
  const [filtre, setFiltre]   = useState('tous');
  const [tri, setTri]         = useState('reservations');
  const [selected, setSelected] = useState(null);
  const [toast, setToast]     = useState(null);
  const [users, setUsers]     = useState(UTILISATEURS);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleSuspend = (u) => {
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, statut: x.statut === 'suspendu' ? 'actif' : 'suspendu' } : x));
    setSelected(null);
    showToast(u.statut === 'suspendu' ? `${u.nom} réactivé ✓` : `${u.nom} suspendu`);
  };

  const handleDelete = (u) => {
    setUsers(prev => prev.filter(x => x.id !== u.id));
    setSelected(null);
    showToast(`${u.nom} supprimé`);
  };

  const filtered = users
    .filter(u => {
      const ms = u.nom.toLowerCase().includes(search.toLowerCase()) || u.quartier.toLowerCase().includes(search.toLowerCase());
      const mf = filtre === 'tous' || u.statut === filtre;
      return ms && mf;
    })
    .sort((a, b) => tri === 'dateInscription'
      ? new Date(b.dateInscription.split('/').reverse().join('-')) - new Date(a.dateInscription.split('/').reverse().join('-'))
      : b[tri] - a[tri]
    );

  const stats = {
    total: users.length,
    actifs: users.filter(u => u.statut === 'actif').length,
    suspendus: users.filter(u => u.statut === 'suspendu').length,
    inactifs: users.filter(u => u.statut === 'inactif').length,
    totalDepenses: users.reduce((s, u) => s + u.depenses, 0),
  };

  const niv = selected ? niveau(selected.reservations) : null;

  return (
    <div className="flex-1 overflow-y-auto pb-28 lg:pb-12">

      {/* Header */}
      <div className="px-5 lg:px-8 pt-6 pb-4" style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
        <h1 className="text-2xl font-display font-bold text-primary-dark tracking-tight">Utilisateurs</h1>
        <p className="text-xs text-gray-400 font-medium mt-0.5">{stats.total} joueurs inscrits · {fmt(stats.totalDepenses)} générés</p>
      </div>

      {/* KPI row */}
      <div className="px-5 lg:px-8 mb-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Actifs',    val: stats.actifs,    color: 'text-green-600', bg: 'bg-green-50',  filter: 'actif'    },
            { label: 'Suspendus', val: stats.suspendus, color: 'text-red-500',   bg: 'bg-red-50',    filter: 'suspendu' },
            { label: 'Inactifs',  val: stats.inactifs,  color: 'text-gray-500',  bg: 'bg-gray-100',  filter: 'inactif'  },
          ].map((s, i) => (
            <button key={i} onClick={() => setFiltre(f => f === s.filter ? 'tous' : s.filter)}
              className={`${s.bg} rounded-2xl p-3 text-center transition-all active:scale-95 cursor-pointer min-h-[72px] ${
                filtre === s.filter ? 'ring-2 ring-offset-1 ring-current shadow-md scale-[1.02]' : 'hover:opacity-80'
              }`}
              style={{ animation: `slideUp 0.4s ${i*0.08}s cubic-bezier(.22,1,.36,1) both` }}>
              <p className={`text-2xl font-display font-black ${s.color}`}>{s.val}</p>
              <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recherche */}
      <div className="px-5 lg:px-8 mb-4 space-y-3">
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm focus-within:ring-2 ring-primary/20 transition-all">
          <IconSearch size={18} className="text-gray-400 flex-shrink-0" />
          <input type="text" placeholder="Rechercher un joueur ou quartier…" value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1 bg-transparent border-none focus:outline-none text-sm" />
          {search && <button onClick={() => setSearch('')}><IconX size={16} className="text-gray-400" /></button>}
        </div>

        {/* Filtres statut */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {STATUTS.map(s => (
            <button key={s} onClick={() => setFiltre(s)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all min-h-[36px] ${filtre === s ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/30'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Tris */}
        <div className="flex gap-2 items-center">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Trier par</span>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {TRIS.map(t => (
              <button key={t.key} onClick={() => setTri(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${tri === t.key ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="px-5 lg:px-8 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <IconUserOff size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Aucun utilisateur trouvé</p>
          </div>
        ) : filtered.map((u, i) => (
          <div key={u.id} style={{ animationDelay: `${i * 0.05}s` }}>
            <UserCard u={u} onClick={setSelected} />
          </div>
        ))}
      </div>

      {/* Sheet: profil utilisateur */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.nom || ''}>
        {selected && (
          <div>
            {/* Header profil */}
            <div className="p-5 bg-gradient-to-br from-primary/5 to-transparent border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black flex-shrink-0 ${selected.statut === 'suspendu' ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'}`}>
                  {selected.initiales}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-bold text-lg text-primary-dark">{selected.nom}</p>
                    {niv && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${niv.color}`}>{niv.label}</span>}
                  </div>
                  <StatutBadge s={selected.statut} />
                  <p className="text-xs text-gray-400 mt-1">Inscrit le {selected.dateInscription}</p>
                </div>
              </div>
            </div>

            {/* Coordonnées */}
            <div className="p-5 space-y-2">
              {[
                { icon: IconMail,    val: selected.email },
                { icon: IconPhone,   val: selected.tel },
                { icon: IconMapPin,  val: selected.quartier },
                { icon: IconClock,   val: `Dernier accès : ${selected.dernierAcces}` },
              ].map(({ icon: Icon, val }, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Icon size={17} className="text-primary flex-shrink-0" />
                  <span className="text-sm text-gray-700 font-medium">{val}</span>
                </div>
              ))}
            </div>

            {/* Stats joueur */}
            <div className="px-5 pb-4 grid grid-cols-3 gap-2">
              <div className="bg-primary/5 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-primary">{selected.reservations}</p>
                <p className="text-[10px] text-gray-500 font-semibold">Réservations</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-sm font-black text-green-600">{selected.depenses > 0 ? (selected.depenses/1000).toFixed(0)+'k' : '—'}</p>
                <p className="text-[10px] text-gray-500 font-semibold">Dépensé</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-xl font-black text-amber-500">{selected.note ?? '—'}</p>
                <p className="text-[10px] text-gray-500 font-semibold">Note moy.</p>
              </div>
            </div>

            {/* Historique */}
            <div className="px-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Historique des réservations</p>
              {selected.historique.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucune réservation</p>
              ) : (
                <div className="space-y-2">
                  {selected.historique.map((h, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-primary-dark truncate">{h.terrain}</p>
                        <p className="text-[11px] text-gray-400">{h.date} · {h.creneau}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-primary">{h.montant}</p>
                        <ReservStatut s={h.statut} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-5 pt-0 space-y-2 border-t border-gray-100">
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
                <IconTrash size={18} /> Supprimer le compte
              </button>
            </div>
          </div>
        )}
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
