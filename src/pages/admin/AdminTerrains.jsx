import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { callRpc } from '../../lib/supabaseRpc';
import { reviewTerrainAdmin, fetchTerrainDocuments, getTerrainDocumentSignedUrl } from '../../services/terrains';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomAlertModal } from '../../components/CustomAlertModal';
import {
  IconSearch, 
  IconFilter, 
  IconBuildingStore, 
  IconMapPin, 
  IconCheck, 
  IconBan, 
  IconEye, 
  IconX, 
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconAlertCircle,
  IconCircleCheck,
  IconFileText,
  IconExternalLink,
  IconPaperclip
} from '@tabler/icons-react';

const formatFCFA = (amount) => {
  if (amount === null || amount === undefined) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
};

export const AdminTerrains = () => {
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
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [statut, setStatut] = useState('');
  const [statusValidation, setStatusValidation] = useState(''); // '' | 'pending' | 'approved' | 'rejected'
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Modale Détail & Décision Terrain
  const [selectedTerrain, setSelectedTerrain] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // Modale de Motif de Refus
  const [rejectingTerrain, setRejectingTerrain] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Documents Justificatifs Terrain (Admin)
  const [adminDocs, setAdminDocs] = useState([]);
  const [loadingAdminDocs, setLoadingAdminDocs] = useState(false);
  const [adminDocError, setAdminDocError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (selectedTerrain?.id) {
      setLoadingAdminDocs(true);
      setAdminDocError(null);
      fetchTerrainDocuments(selectedTerrain.id)
        .then(docs => {
          if (isMounted) setAdminDocs(docs || []);
        })
        .catch(err => {
          console.error('Erreur chargement documents admin:', err);
          if (isMounted) setAdminDocError(err.userMessage || 'Impossible de charger les documents.');
        })
        .finally(() => {
          if (isMounted) setLoadingAdminDocs(false);
        });
    } else {
      setAdminDocs([]);
    }
    return () => { isMounted = false; };
  }, [selectedTerrain?.id]);

  const handleOpenAdminDoc = async (storagePath) => {
    try {
      const url = await getTerrainDocumentSignedUrl(storagePath);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Erreur ouverture document admin:', err);
      showAlert('Erreur', err.userMessage || "Impossible d'ouvrir ce document.", 'error');
    }
  };

  const fetchTerrains = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callRpc('admin_list_terrains', {
        p_search: search.trim() || null,
        p_zone: zone || null,
        p_statut: statut || null,
        p_page: page,
        p_page_size: pageSize,
        p_status_validation: statusValidation || null
      });

      if (data) {
        setItems(data.items || []);
        setTotalCount(data.total_count || 0);
      }
    } catch (err) {
      console.error('Erreur admin_list_terrains:', err);
      setError(err.message || 'Impossible de charger la liste des terrains.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerrains();
  }, [search, zone, statut, statusValidation, page]);

  const handleReviewDecision = async (terrainId, decision, reason = null) => {
    setUpdatingId(terrainId);
    try {
      await reviewTerrainAdmin(terrainId, decision, reason);
      fetchTerrains();
      if (selectedTerrain && selectedTerrain.id === terrainId) {
        setSelectedTerrain({
          ...selectedTerrain,
          status: decision,
          rejection_reason: decision === 'rejected' ? reason : null
        });
      }
      setRejectingTerrain(null);
      setRejectionReason('');
    } catch (err) {
      showAlert('Erreur', `Erreur lors de la révision du terrain: ${err.message}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleStatus = async (terrain) => {
    const nextStatus = terrain.statut === 'actif' ? 'suspendu' : 'actif';
    setUpdatingId(terrain.id);
    try {
      await callRpc('admin_update_terrain_status', {
        p_terrain_id: terrain.id,
        p_statut: nextStatus
      });
      fetchTerrains();
      if (selectedTerrain && selectedTerrain.id === terrain.id) {
        setSelectedTerrain({ ...selectedTerrain, statut: nextStatus });
      }
    } catch (err) {
      showAlert('Erreur', `Erreur lors du changement de statut: ${err.message}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const validationBadge = (stValidation) => {
    switch (stValidation) {
      case 'approved':
        return (
          <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 inline-flex items-center gap-1 whitespace-nowrap">
            <IconCheck size={14} strokeWidth={3} /> Approuvé
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200 inline-flex items-center gap-1 whitespace-nowrap">
            <IconX size={14} strokeWidth={3} /> Refusé
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-300 animate-pulse inline-flex items-center gap-1 whitespace-nowrap">
            <IconClock size={14} strokeWidth={2.5} /> En attente
          </span>
        );
    }
  };

  const statusBadge = (st) => {
    switch (st) {
      case 'actif':
        return <span className="bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-green-200">Actif</span>;
      case 'suspendu':
        return <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-red-200">Suspendu</span>;
      case 'en_maintenance':
      default:
        return <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200">Maintenance</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10 min-w-0 w-full animate-in fade-in duration-300">
      
      {/* Modale de Motif de Refus */}
      {rejectingTerrain && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" style={{ zIndex: -1 }} onClick={() => setRejectingTerrain(null)}></div>
          <div className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold font-display text-red-600 flex items-center gap-2">
                <IconAlertCircle size={20} /> Refuser le terrain
              </h3>
              <button onClick={() => setRejectingTerrain(null)} className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">
                <IconX size={16} />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Précisez le motif du refus pour <strong>{rejectingTerrain.nom}</strong>. Le gérant pourra consulter cette remarque et corriger sa fiche.
            </p>

            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Photos floues, tarif non conforme ou adresse imprécise."
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 ring-red-500/20 font-medium"
              required
            ></textarea>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectingTerrain(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (!rejectionReason.trim()) {
                    showAlert('Champ requis', 'Veuillez saisir un motif de refus.', 'error');
                    return;
                  }
                  handleReviewDecision(rejectingTerrain.id, 'rejected', rejectionReason.trim());
                }}
                disabled={updatingId === rejectingTerrain.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modale de Détail & Décision Terrain */}
      {selectedTerrain && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" style={{ zIndex: -1 }} onClick={() => setSelectedTerrain(null)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-6 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <IconBuildingStore size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-display text-primary-dark">{selectedTerrain.nom}</h3>
                  <span className="text-xs text-gray-500">{selectedTerrain.quartier}</span>
                </div>
              </div>
              <button onClick={() => setSelectedTerrain(null)} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer">
                <IconX size={18} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2.5">
                <div className="flex justify-between items-center"><span className="text-gray-500">Validation Admin :</span> {validationBadge(selectedTerrain.status || 'pending')}</div>
                <div className="flex justify-between items-center"><span className="text-gray-500">Statut Opérationnel :</span> {statusBadge(selectedTerrain.statut)}</div>
                <div className="flex justify-between"><span className="text-gray-500">Gérant :</span> <span className="font-bold">{selectedTerrain.gerant_nom || 'Non assigné'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tarif Horaire :</span> <span className="font-bold text-primary">{formatFCFA(selectedTerrain.price)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Surface :</span> <span className="font-bold">{selectedTerrain.surface || 'Synthétique'} ({selectedTerrain.size || '5v5'})</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Capacité :</span> <span className="font-bold">{selectedTerrain.capacite || 10} Joueurs</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Adresse :</span> <span className="font-bold text-right max-w-[200px] truncate">{selectedTerrain.adresse || selectedTerrain.quartier}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Coordonnées GPS :</span> <span className="font-mono text-xs">{selectedTerrain.lat && selectedTerrain.lng ? `${selectedTerrain.lat}, ${selectedTerrain.lng}` : 'Non définies'}</span></div>
                {selectedTerrain.rejection_reason && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                    <strong>Motif du refus :</strong> {selectedTerrain.rejection_reason}
                  </div>
                )}
              </div>

              {/* Documents Justificatifs (Vue Admin) */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <IconFileText size={16} className="text-primary" />
                    Documents Justificatifs Soumis ({adminDocs.length})
                  </h4>
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    Confidentiel
                  </span>
                </div>

                {loadingAdminDocs ? (
                  <div className="p-3 text-center text-gray-400 text-xs font-medium animate-pulse">
                    Chargement des documents justificatifs...
                  </div>
                ) : adminDocError ? (
                  <div className="p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-xl">
                    {adminDocError}
                  </div>
                ) : adminDocs.length > 0 ? (
                  <div className="space-y-2">
                    {adminDocs.map((doc) => (
                      <div key={doc.id} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-between gap-3 shadow-subtle">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <IconPaperclip size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-primary-dark truncate">{doc.nom_original}</div>
                            <div className="text-[10px] text-gray-500 font-medium">
                              {doc.type_document === 'piece_identite' ? "Pièce d'identité" : doc.type_document === 'justificatif_propriete' ? 'Justificatif propriété' : 'Autre'} • {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenAdminDoc(doc.storage_path)}
                          className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-subtle"
                        >
                          <IconExternalLink size={14} /> Voir
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center bg-gray-50 rounded-xl text-xs text-gray-400 font-medium border border-gray-100">
                    Aucun document justificatif joint par le gérant.
                  </div>
                )}
              </div>

              {/* Panneau de décision Validation */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider">Décision d'Homologation Admin</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleReviewDecision(selectedTerrain.id, 'approved')}
                    disabled={updatingId === selectedTerrain.id || selectedTerrain.status === 'approved'}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <IconCircleCheck size={16} /> Approuver
                  </button>

                  <button
                    onClick={() => setRejectingTerrain(selectedTerrain)}
                    disabled={updatingId === selectedTerrain.id || selectedTerrain.status === 'rejected'}
                    className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <IconAlertCircle size={16} /> Rejeter
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => handleToggleStatus(selectedTerrain)}
                  disabled={updatingId === selectedTerrain.id}
                  className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all text-xs uppercase tracking-wider ${
                    selectedTerrain.statut === 'actif'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      : 'bg-primary text-white hover:bg-primary-dark shadow-subtle'
                  }`}
                >
                  {selectedTerrain.statut === 'actif' ? (
                    <> <IconBan size={16} /> Suspendre ce terrain </>
                  ) : (
                    <> <IconCheck size={16} /> Activer le terrain </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-primary-dark font-display">
            Gestion & Homologation des Terrains
          </h1>
          <p className="text-gray-500 text-sm font-medium">
            Validez les soumissions de terrains gérants et administrez le parc de complexes.
          </p>
        </div>
        <button
          onClick={fetchTerrains}
          className="h-10 px-4 bg-white border border-black/5 hover:bg-gray-50 text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle text-primary-dark"
        >
          <IconRefresh size={16} /> Actualiser
        </button>
      </div>

      {/* Filtres Validation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => { setStatusValidation(''); setPage(1); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            statusValidation === '' ? 'bg-primary text-white shadow-subtle' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tous les terrains
        </button>
        <button
          onClick={() => { setStatusValidation('pending'); setPage(1); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            statusValidation === 'pending' ? 'bg-amber-500 text-white shadow-subtle' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <IconClock size={14} /> En attente de validation
        </button>
        <button
          onClick={() => { setStatusValidation('approved'); setPage(1); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            statusValidation === 'approved' ? 'bg-emerald-600 text-white shadow-subtle' : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          Approuvés
        </button>
        <button
          onClick={() => { setStatusValidation('rejected'); setPage(1); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
            statusValidation === 'rejected' ? 'bg-red-600 text-white shadow-subtle' : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'
          }`}
        >
          Refusés
        </button>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <IconSearch size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom de terrain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-48">
            <CustomSelect
              value={statut}
              onChange={(val) => { setStatut(val); setPage(1); }}
              options={[
                { value: '', label: "Tous les statuts d'activité" },
                { value: 'actif', label: 'Actif' },
                { value: 'suspendu', label: 'Suspendu' },
                { value: 'en_maintenance', label: 'En Maintenance' }
              ]}
              placeholder="Tous les statuts"
            />
          </div>

          <input
            type="text"
            placeholder="Zone (ex: Almadies)"
            value={zone}
            onChange={(e) => { setZone(e.target.value); setPage(1); }}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs w-36 focus:outline-none"
          />
        </div>
      </div>

      {/* Table des Terrains */}
      <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Chargement de la liste des terrains...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun terrain trouvé pour ces critères.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50/50">
                  <th className="py-3.5 px-4">Terrain</th>
                  <th className="py-3.5 px-4">Quartier</th>
                  <th className="py-3.5 px-4">Gérant</th>
                  <th className="py-3.5 px-4">Tarif</th>
                  <th className="py-3.5 px-4">Validation Admin</th>
                  <th className="py-3.5 px-4">Activité</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {items.map((terrain) => (
                  <tr key={terrain.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{terrain.nom}</div>
                      <div className="text-xs text-gray-400 font-medium">{terrain.surface || 'Synthétique'}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                        <IconMapPin size={12} className="text-primary" /> {terrain.quartier}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700">
                      {terrain.gerant_nom || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-primary-dark">
                      {formatFCFA(terrain.price)}
                    </td>
                    <td className="py-3.5 px-4">
                      {validationBadge(terrain.status || 'pending')}
                    </td>
                    <td className="py-3.5 px-4">
                      {statusBadge(terrain.statut)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1">
                      <button
                        onClick={() => setSelectedTerrain(terrain)}
                        className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors cursor-pointer"
                        title="Voir détails & réviser"
                      >
                        <IconEye size={18} />
                      </button>

                      {terrain.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleReviewDecision(terrain.id, 'approved')}
                            disabled={updatingId === terrain.id}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Approuver rapidement"
                          >
                            <IconCircleCheck size={18} />
                          </button>
                          <button
                            onClick={() => setRejectingTerrain(terrain)}
                            disabled={updatingId === terrain.id}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Rejeter"
                          >
                            <IconAlertCircle size={18} />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleToggleStatus(terrain)}
                        disabled={updatingId === terrain.id}
                        className={`px-2.5 py-1 rounded-xl font-bold text-xs transition-all cursor-pointer inline-flex items-center gap-1 ${
                          terrain.statut === 'actif'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {terrain.statut === 'actif' ? 'Suspendre' : 'Activer'}
                      </button>
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
            <span className="text-gray-500">Page {page} sur {totalPages} ({totalCount} terrains)</span>
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
