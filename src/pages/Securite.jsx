import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconSearch, IconX, IconLoader2, IconRefresh, IconUserShield,
  IconChevronRight, IconTerminal2, IconCalendarTime, IconCircleCheck,
  IconBallFootball, IconCalendarEvent, IconUsers, IconCreditCard, IconFlame
} from '@tabler/icons-react';
import { fetchAuditLogs } from '../services/audit';

/* ── Bottom Sheet / Detail Panel ── */
const Sheet = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-xl mx-auto rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 z-10">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-[#0F2318] text-white">
          <div className="flex items-center gap-2">
            <IconUserShield size={20} className="text-primary" />
            <h3 className="font-bold text-lg">{title}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white">
            <IconX size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </div>
    , document.body);
};

/* Helper for action names */
const getActionMeta = (action) => {
  const meta = {
    update_statut_reservation: {
      label: 'Statut Réservation',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: IconCalendarEvent
    },
    update_statut_creneau: {
      label: 'Planning / Créneau',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: IconCalendarTime
    },
    update_role_utilisateur: {
      label: 'Rôle Utilisateur',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: IconUsers
    },
    create_terrain: {
      label: 'Nouveau Terrain',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: IconBallFootball
    },
    update_terrain: {
      label: 'Mise à jour Terrain',
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      icon: IconBallFootball
    },
    update_statut_paiement: {
      label: 'Statut Paiement',
      color: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: IconCreditCard
    }
  };

  return meta[action] || {
    label: action.replace(/_/g, ' ').toUpperCase(),
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: IconTerminal2
  };
};

/* Format Date beautifully */
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now - d);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays <= 1 && d.getDate() === now.getDate()) {
    return `Aujourd'hui à ${timeStr}`;
  } else if (diffDays <= 2 && d.getDate() === now.getDate() - 1) {
    return `Hier à ${timeStr}`;
  }
  return `${d.toLocaleDateString('fr-FR')} à ${timeStr}`;
};

export const Securite = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [toast, setToast] = useState(null);
  const [filterAction, setFilterAction] = useState('tous');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await fetchAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
      showToast('Impossible de récupérer l\'historique de sécurité.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const uniqueActions = ['tous', ...new Set(logs.map(l => l.action))];

  const filteredLogs = logs.filter(log => {
    const actorName = log.profiles?.nom || 'Système';
    const matchSearch = actorName.toLowerCase().includes(search.toLowerCase()) || 
      log.action.toLowerCase().includes(search.toLowerCase()) || 
      log.resource_type.toLowerCase().includes(search.toLowerCase());
    
    const matchFilter = filterAction === 'tous' || log.action === filterAction;
    
    return matchSearch && matchFilter;
  });

  return (
    <div className="flex-1 overflow-y-auto pb-28 lg:pb-12">
      {/* Header */}
      <div className="px-5 lg:px-8 pt-6 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4" style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
        <div>
          <h1 className="text-2xl font-display font-bold text-primary-dark tracking-tight">Sécurité & Audit</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Historique complet et traçabilité en temps réel des actions critiques du système.
          </p>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-[#1A7A4A]/10 text-[#1A7A4A] border border-[#1A7A4A]/20 hover:bg-[#1A7A4A] hover:text-white px-4 py-2.5 rounded-xl font-bold transition-all text-xs active:scale-95 disabled:opacity-50 cursor-pointer w-fit"
        >
          <IconRefresh size={16} className={loading ? 'animate-spin' : ''} />
          Rafraîchir
        </button>
      </div>

      {/* KPI/Overview Rows */}
      <div className="px-5 lg:px-8 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0F2318] text-white rounded-2xl p-5 border border-white/5 flex items-center justify-between"
            style={{ animation: 'slideUp 0.4s 0.05s cubic-bezier(.22,1,.36,1) both' }}>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest">Logs d'activité</p>
              <h3 className="text-3xl font-display font-black mt-1">{logs.length}</h3>
            </div>
            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-primary">
              <IconUserShield size={24} />
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-subtle flex items-center justify-between"
            style={{ animation: 'slideUp 0.4s 0.1s cubic-bezier(.22,1,.36,1) both' }}>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Actions de Gérants</p>
              <h3 className="text-3xl font-display font-black text-primary-dark mt-1">
                {logs.filter(l => l.profiles?.role === 'gerant').length}
              </h3>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <IconFlame size={24} />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-subtle flex items-center justify-between"
            style={{ animation: 'slideUp 0.4s 0.15s cubic-bezier(.22,1,.36,1) both' }}>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Dernière Action</p>
              <p className="text-xs font-bold text-primary-dark mt-2 truncate max-w-[200px]">
                {logs[0] ? getActionMeta(logs[0].action).label : 'Aucune action'}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <IconCircleCheck size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-5 lg:px-8 mb-5 space-y-4">
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 shadow-sm focus-within:ring-2 ring-primary/20 transition-all">
          <IconSearch size={18} className="text-gray-400 flex-shrink-0" />
          <input 
            type="text" 
            placeholder="Rechercher par acteur, action ou ressource..." 
            value={search}
            onChange={e => setSearch(e.target.value)} 
            className="flex-1 bg-transparent border-none focus:outline-none text-sm" 
          />
          {search && <button onClick={() => setSearch('')}><IconX size={16} className="text-gray-400" /></button>}
        </div>

        {/* Action tags */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {uniqueActions.map(act => (
            <button
              key={act}
              onClick={() => setFilterAction(act)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all min-h-[36px] cursor-pointer ${
                filterAction === act 
                  ? 'bg-[#1A7A4A] text-white shadow-md' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1A7A4A]/30'
              }`}
            >
              {act === 'tous' ? 'Tous les types' : getActionMeta(act).label}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="px-5 lg:px-8">
        <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <IconLoader2 className="animate-spin text-primary" size={32} />
              <p className="text-sm font-semibold">Chargement des logs de sécurité...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <IconUserShield size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Aucun événement de sécurité trouvé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/75 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <th className="py-4 px-6">Acteur</th>
                    <th className="py-4 px-6">Action & Type</th>
                    <th className="py-4 px-6">Ressource ID</th>
                    <th className="py-4 px-6">Date & Heure</th>
                    <th className="py-4 px-6 text-right">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLogs.map((log, i) => {
                    const meta = getActionMeta(log.action);
                    const ActionIcon = meta.icon;
                    return (
                      <tr 
                        key={log.id} 
                        className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                        style={{ 
                          animation: 'slideUp 0.3s cubic-bezier(.22,1,.36,1) both',
                          animationDelay: `${Math.min(i * 0.03, 0.5)}s`
                        }}
                      >
                        {/* Actor column */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#0F2318] text-white flex items-center justify-center text-xs font-bold font-display flex-shrink-0">
                              {log.profiles?.avatar || (log.profiles?.nom || 'S').substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-primary-dark text-sm leading-tight">
                                {log.profiles?.nom || 'Système'}
                              </p>
                              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                                {log.profiles?.role || 'automatic'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Action column */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg border ${meta.color} flex-shrink-0`}>
                              <ActionIcon size={16} />
                            </div>
                            <div>
                              <p className="font-bold text-gray-700 text-sm">{meta.label}</p>
                              <p className="text-[11px] text-gray-400 font-medium">Type: {log.resource_type}</p>
                            </div>
                          </div>
                        </td>

                        {/* Resource ID column */}
                        <td className="py-4 px-6">
                          <code className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded border border-gray-100">
                            {log.resource_id.substring(0, 8)}...
                          </code>
                        </td>

                        {/* Date column */}
                        <td className="py-4 px-6 text-sm text-gray-500 font-medium">
                          {formatDate(log.created_at)}
                        </td>

                        {/* Action button */}
                        <td className="py-4 px-6 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:bg-primary/10 hover:text-[#1A7A4A] hover:border-primary/20 transition-all cursor-pointer"
                          >
                            <IconChevronRight size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sheet: Detail & JSON Comparison */}
      <Sheet 
        open={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
        title={`Audit Log : ${selectedLog ? getActionMeta(selectedLog.action).label : ''}`}
      >
        {selectedLog && (
          <div className="p-5 space-y-6">
            {/* Meta details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Acteur</p>
                <p className="font-bold text-primary-dark mt-0.5">{selectedLog.profiles?.nom || 'Système'}</p>
                <p className="text-xs text-primary font-bold uppercase tracking-wider">{selectedLog.profiles?.role || 'automatic'}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date de l'événement</p>
                <p className="font-bold text-primary-dark mt-0.5">{new Date(selectedLog.created_at).toLocaleString('fr-FR')}</p>
                <p className="text-xs text-gray-400 font-medium">ID: {selectedLog.id.substring(0, 8)}...</p>
              </div>
            </div>

            {/* Resource Identifier */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ressource affectée</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary-dark capitalize">{selectedLog.resource_type}</span>
                <code className="text-xs text-gray-600 font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
                  {selectedLog.resource_id}
                </code>
              </div>
            </div>

            {/* State Comparison / JSON Diff */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <IconTerminal2 size={18} className="text-primary" />
                <p className="text-sm font-bold text-primary-dark">Comparaison d'états (Différentiel)</p>
              </div>

              {(!selectedLog.old_state && !selectedLog.new_state) ? (
                <div className="text-center py-6 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400 text-sm">
                  Aucun changement d'état enregistré pour cette action.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Old State */}
                  <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Ancien État</p>
                    {selectedLog.old_state ? (
                      <pre className="text-[11px] text-red-700 font-mono overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.old_state, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-red-400 italic">Aucun état antérieur (Création)</span>
                    )}
                  </div>

                  {/* New State */}
                  <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2">Nouvel État</p>
                    {selectedLog.new_state ? (
                      <pre className="text-[11px] text-green-700 font-mono overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.new_state, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-green-400 italic">Aucun nouvel état (Suppression)</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => setSelectedLog(null)} 
              className="w-full py-3.5 bg-primary text-white font-bold rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all min-h-[48px] cursor-pointer"
            >
              Fermer les détails
            </button>
          </div>
        )}
      </Sheet>

      {/* Global Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl text-sm font-medium z-[100] animate-in slide-in-from-bottom-5 duration-300">
          {toast}
        </div>
      )}
    </div>
  );
};
