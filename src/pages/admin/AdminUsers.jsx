import React, { useState, useEffect } from 'react';
import { callRpc } from '../../lib/supabaseRpc';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomAlertModal } from '../../components/CustomAlertModal';
import {
  IconSearch, 
  IconUser, 
  IconEye, 
  IconEyeOff, 
  IconShield, 
  IconKey, 
  IconX, 
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconCheck
} from '@tabler/icons-react';

export const AdminUsers = () => {
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Alert modal
  const [alertConfig, setAlertConfig] = useState(null);
  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
  };

  // Filtres
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // State pour contact révélé { [userId]: { email, tel } }
  const [revealedContacts, setRevealedContacts] = useState({});
  const [revealingId, setRevealingId] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callRpc('admin_list_users', {
        p_role: role || null,
        p_search: search.trim() || null,
        p_statut: statut || null,
        p_page: page,
        p_page_size: pageSize
      });

      if (data) {
        setItems(data.items || []);
        setTotalCount(data.total_count || 0);
      }
    } catch (err) {
      console.error('Erreur admin_list_users:', err);
      setError(err.message || 'Impossible de charger la liste des utilisateurs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [role, search, statut, page]);

  const handleRevealContact = async (userId) => {
    setRevealingId(userId);
    try {
      const data = await callRpc('admin_reveal_user_contact', {
        p_user_id: userId
      });
      setRevealedContacts(prev => ({
        ...prev,
        [userId]: { email: data.email, tel: data.tel }
      }));
    } catch (err) {
      showAlert('Erreur', `Erreur lors de la révélation du contact: ${err.message}`, 'error');
    } finally {
      setRevealingId(null);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await callRpc('admin_update_user_role', {
        p_user_id: userId,
        p_new_role: newRole
      });
      setActionMsg(`Rôle mis à jour en "${newRole}" avec succès.`);
      setTimeout(() => setActionMsg(null), 3000);
      fetchUsers();
    } catch (err) {
      showAlert('Erreur', `Erreur changement de rôle: ${err.message}`, 'error');
    }
  };

  const handleResetAccess = (user) => {
    setAlertConfig({
      isOpen: true,
      type: 'confirm',
      title: "Réinitialiser l'accès",
      message: `Réinitialiser l'accès pour ${user.nom} ? Cette action invalidera sa session.`,
      confirmLabel: 'Réinitialiser',
      cancelLabel: 'Annuler',
      onClose: () => setAlertConfig(null),
      onConfirm: async () => {
        setAlertConfig(null);
        try {
          await callRpc('admin_reset_user_access', {
            p_user_id: user.id
          });
          setActionMsg(`Accès réinitialisé pour ${user.nom}.`);
          setTimeout(() => setActionMsg(null), 3000);
        } catch (err) {
          showAlert('Erreur', `Erreur réinitialisation: ${err.message}`, 'error');
        }
      },
    });
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const roleBadge = (r) => {
    switch (r) {
      case 'admin':
        return <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-full border border-purple-200 whitespace-nowrap">Super Admin</span>;
      case 'gerant':
        return <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20 whitespace-nowrap">Gérant</span>;
      case 'joueur':
      default:
        return <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full border border-gray-200 whitespace-nowrap">Joueur</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10 min-w-0 w-full animate-in fade-in duration-300">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-primary-dark font-display">
            Gestion des Utilisateurs
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Supervision des comptes joueurs et gérants avec masquage RGPD des données de contact.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="h-10 px-4 bg-white border border-black/5 hover:bg-gray-50 text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle text-primary-dark"
        >
          <IconRefresh size={16} /> Actualiser
        </button>
      </div>

      {actionMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-xs font-bold rounded-xl flex items-center gap-2">
          <IconCheck size={16} /> {actionMsg}
        </div>
      )}

      {/* Barre de Recherche et Filtres par rôle */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <IconSearch size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-40">
            <CustomSelect
              value={role}
              onChange={(val) => { setRole(val); setPage(1); }}
              options={[
                { value: '', label: 'Tous les rôles' },
                { value: 'joueur', label: 'Joueur' },
                { value: 'gerant', label: 'Gérant' },
                { value: 'admin', label: 'Super Admin' }
              ]}
              placeholder="Tous les rôles"
            />
          </div>

          <div className="w-40">
            <CustomSelect
              value={statut}
              onChange={(val) => { setStatut(val); setPage(1); }}
              options={[
                { value: '', label: 'Tous les statuts' },
                { value: 'actif', label: 'Actif' },
                { value: 'suspendu', label: 'Suspendu' },
                { value: 'en_attente', label: 'En attente' }
              ]}
              placeholder="Tous les statuts"
            />
          </div>
        </div>
      </div>

      {/* Table des Utilisateurs */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Chargement des utilisateurs...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun utilisateur trouvé pour ces filtres.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/50">
                  <th className="py-3.5 px-4">Utilisateur</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Téléphone</th>
                  <th className="py-3.5 px-4">Rôle</th>
                  <th className="py-3.5 px-4">Quartier</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {items.map((u) => {
                  const isRevealed = !!revealedContacts[u.id];
                  const emailDisp = isRevealed ? revealedContacts[u.id].email : u.email;
                  const telDisp = isRevealed ? revealedContacts[u.id].tel : u.tel;

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        {u.nom}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-gray-600">
                        {emailDisp || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-gray-600">
                        {telDisp || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {roleBadge(u.role)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {u.quartier || 'Dakar'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-end gap-2">
                          {!isRevealed ? (
                            <button
                              onClick={() => handleRevealContact(u.id)}
                              disabled={revealingId === u.id}
                              className="px-2.5 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                              title="Révéler les coordonnées (loggé)"
                            >
                              <IconEye size={14} /> Révéler
                            </button>
                          ) : (
                            <span className="text-[10px] bg-green-50 text-green-600 font-bold px-2 py-0.5 rounded-md">Contact Révélé</span>
                          )}

                          <div className="flex items-center gap-2">
                            <div className="w-36">
                              <CustomSelect
                                value={u.role}
                                onChange={(val) => handleUpdateRole(u.id, val)}
                                options={[
                                  { value: 'joueur', label: 'Joueur' },
                                  { value: 'gerant', label: 'Gérant' },
                                  { value: 'admin', label: 'Super Admin' }
                                ]}
                              />
                            </div>

                            <button
                              onClick={() => handleResetAccess(u)}
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              title="Réinitialiser l'accès"
                            >
                              <IconKey size={16} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">Page {page} sur {totalPages} ({totalCount} utilisateurs)</span>
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

      {/* Modale d'alerte et de confirmation */}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};
