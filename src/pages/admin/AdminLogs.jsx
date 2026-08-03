import React, { useState, useEffect } from 'react';
import { callRpc } from '../../lib/supabaseRpc';
import {
  IconShieldCheck, 
  IconClock, 
  IconRefresh, 
  IconChevronLeft, 
  IconChevronRight,
  IconSearch,
  IconFilter
} from '@tabler/icons-react';
import { CustomDatePicker } from '../../components/CustomDatePicker';

export const AdminLogs = () => {
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtres
  const [action, setAction] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callRpc('admin_list_logs', {
        p_action: action.trim() || null,
        p_date_debut: dateDebut ? new Date(dateDebut).toISOString() : null,
        p_date_fin: dateFin ? new Date(dateFin).toISOString() : null,
        p_admin_id: null,
        p_page: page,
        p_page_size: pageSize
      });

      if (data) {
        setItems(data.items || []);
        setTotalCount(data.total_count || 0);
      }
    } catch (err) {
      console.error('Erreur admin_list_logs:', err);
      setError(err.message || 'Impossible de charger l\'historique d\'audit.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [action, dateDebut, dateFin, page]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col gap-6 pb-10 min-w-0 w-full animate-in fade-in duration-300">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-primary-dark font-display flex items-center gap-2">
            <IconShieldCheck size={28} className="text-primary" />
            Audit Logs Super Admin
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Traçabilité complète des actions administratives effectuées sur la plateforme.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="h-10 px-4 bg-white border border-black/5 hover:bg-gray-50 text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle text-primary-dark"
        >
          <IconRefresh size={16} /> Actualiser
        </button>
      </div>

      {/* Filtres par Action & Dates */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Filtrer par nom d'action (ex: admin_update_terrain_status)..."
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <CustomDatePicker
            value={dateDebut}
            max={dateFin}
            onChange={(newDate) => { setDateDebut(newDate); setPage(1); }}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none"
            title="Date de début"
            placeholder="Du..."
          />
          <span className="text-xs text-gray-400">à</span>
          <CustomDatePicker
            value={dateFin}
            min={dateDebut}
            onChange={(newDate) => { setDateFin(newDate); setPage(1); }}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none"
            title="Date de fin"
            placeholder="Au..."
          />
        </div>
      </div>

      {/* Table Chronologique des Logs */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Chargement de l'audit trail...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun événement d'audit enregistré pour ces filtres.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/50">
                  <th className="py-3.5 px-4">Horodatage</th>
                  <th className="py-3.5 px-4">Admin / Auteur</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Cible</th>
                  <th className="py-3.5 px-4">Métadonnées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {items.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-xs font-mono text-gray-500 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-800">
                      {log.actor_nom || 'Super Admin'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-gray-700">
                      {log.resource_type ? `${log.resource_type}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-gray-500 max-w-[250px] truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">Page {page} sur {totalPages} ({totalCount} logs)</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >
                <IconChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
