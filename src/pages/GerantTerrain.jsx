import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconBuildingStore,
  IconCheck,
  IconTools,
  IconUsers,
  IconSparkles,
  IconX,
  IconPlus,
  IconClock,
  IconAlertCircle,
  IconCircleCheck,
  IconEdit,
  IconMapPin,
  IconPhoto,
  IconCoin,
  IconChevronLeft
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { useGerantTerrains } from '../hooks/useGerantTerrains';
import { supabase } from '../lib/supabase';
import { 
  updateTerrain, 
  addAmenity, 
  removeAmenity,
  createGerantTerrain,
  resubmitGerantTerrain,
  getTerrainPrincipalPhotoUrl
} from '../services/terrains';
import { TerrainFormModal } from '../components/TerrainFormModal';

export const GerantTerrain = () => {
  const { currentUser } = useUser();
  const { terrains, loading, error: fetchError, refetch } = useGerantTerrains(currentUser?.id);
  const [actionError, setActionError] = useState(null);
  const error = actionError || fetchError;
  const setError = setActionError;

  const [selectedTerrainId, setSelectedTerrainId] = useState(null);
  const selectedTerrain = (terrains || []).find(t => t.id === selectedTerrainId) || null;
  const terrain = selectedTerrain || (terrains?.length === 1 ? terrains[0] : null);

  const [saving, setSaving] = useState(false);

  const [selectedSpec, setSelectedSpec] = useState(null);
  const [showAddAmenity, setShowAddAmenity] = useState(false);
  const [newAmenity, setNewAmenity] = useState('');
  const [priceInput, setPriceInput] = useState(0);

  // Quota info du gérant
  const [quotaInfo, setQuotaInfo] = useState(null);

  const fetchQuota = async () => {
    if (!currentUser?.id) return;
    try {
      const { data } = await supabase.rpc('check_quota', { p_user_id: currentUser.id, p_quota_type: 'terrains' });
      setQuotaInfo(data);
    } catch (e) {
      console.error("Erreur chargement quota terrains:", e);
    }
  };

  useEffect(() => {
    fetchQuota();
  }, [currentUser?.id, terrains]);

  // Modal de création/édition
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalEditingTerrain, setModalEditingTerrain] = useState(null);
  const [newTerrainId, setNewTerrainId] = useState(null);

  const openCreateModal = () => {
    setModalEditingTerrain(null);
    setNewTerrainId(crypto.randomUUID());
    setIsModalOpen(true);
  };

  const openEditModal = (t) => {
    setModalEditingTerrain(t);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (terrain) setPriceInput(terrain.price || 0);
  }, [terrain]);

  const [principalPhotoUrl, setPrincipalPhotoUrl] = useState(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (terrain?.id) {
      setLoadingPhoto(true);
      getTerrainPrincipalPhotoUrl(terrain.id)
        .then(url => {
          if (isMounted) setPrincipalPhotoUrl(url);
        })
        .catch(err => console.error('Erreur chargement photo principale:', err))
        .finally(() => {
          if (isMounted) setLoadingPhoto(false);
        });
    } else {
      setPrincipalPhotoUrl(null);
    }
    return () => { isMounted = false; };
  }, [terrain?.id]);

  const [successToast, setSuccessToast] = useState(null);

  const handleFormSubmit = async (formData) => {
    setSaving(true);
    setActionError(null);
    try {
      const targetTerrain = modalEditingTerrain || selectedTerrain;
      if (targetTerrain) {
        await resubmitGerantTerrain(
          targetTerrain.id,
          { ...formData, gerant_id: currentUser.id },
          targetTerrain.status
        );
        setSuccessToast(
          targetTerrain.status === 'rejected'
            ? "Fiche terrain corrigée et resoumise avec succès pour homologation."
            : "Fiche terrain mise à jour avec succès."
        );
      } else {
        await createGerantTerrain({
          ...formData,
          id: newTerrainId,
          gerant_id: currentUser.id
        });
        setSuccessToast("Terrain créé avec succès ! Votre fiche est maintenant en attente d'homologation admin.");
      }
      await refetch();
      await fetchQuota();
      setIsModalOpen(false);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      console.error('Erreur soumission terrain dans GerantTerrain:', err);
      if (err.code === 'QUOTA_TERRAINS_ATTEINT' || err.message?.includes('quota_terrains_atteint')) {
        const userMsg = err.userMessage || "Votre quota de terrains pour votre plan actuel est atteint. Passez au plan supérieur pour ajouter d'autres terrains.";
        setActionError(userMsg);
        setIsModalOpen(false);
        return;
      }
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const pitchSpecs = terrain ? [
    { label: "Type de surface", value: terrain.surface, icon: IconSparkles, desc: `Surface actuellement enregistrée pour ce terrain : ${terrain.surface}.` },
    { label: "Format", value: terrain.size, icon: IconUsers, desc: `Format de jeu configuré : ${terrain.size}.` },
    { label: "Tarif Horaire", value: `${(terrain.price || 0).toLocaleString('fr-FR')} FCFA`, icon: IconBuildingStore, desc: "Tarif de base facturé aux joueurs pour une heure de réservation." },
  ] : [];

  const handleSavePrice = async () => {
    if (!terrain || priceInput === terrain.price) return;
    setSaving(true);
    try {
      const updated = await updateTerrain(terrain.id, { price: priceInput });
      setTerrain(t => ({ ...t, price: updated.price }));
    } catch (err) {
      setError(err.userMessage || err.message || 'Impossible de mettre à jour le prix.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaintenance = async () => {
    if (!terrain) return;
    const nextStatut = terrain.statut === 'en_maintenance' ? 'actif' : 'en_maintenance';
    setSaving(true);
    try {
      const updated = await updateTerrain(terrain.id, { statut: nextStatut });
      setTerrain(t => ({ ...t, statut: updated.statut }));
    } catch (err) {
      setError(err.userMessage || err.message || 'Impossible de changer le statut du terrain.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAmenity = async (e) => {
    e.preventDefault();
    if (!newAmenity.trim() || !terrain) return;
    try {
      const created = await addAmenity(terrain.id, newAmenity.trim());
      setTerrain(t => ({
        ...t,
        amenities: [...(t.amenities || []), created.label],
        terrain_amenities: [...(t.terrain_amenities || []), created],
      }));
      setNewAmenity('');
      setShowAddAmenity(false);
    } catch (err) {
      setError(err.userMessage || err.message || "Impossible d'ajouter cette commodité.");
    }
  };

  const handleRemoveAmenity = async (amenityId) => {
    if (!terrain) return;
    try {
      await removeAmenity(amenityId);
      setTerrain(t => ({
        ...t,
        terrain_amenities: (t.terrain_amenities || []).filter(a => a.id !== amenityId),
        amenities: (t.terrain_amenities || []).filter(a => a.id !== amenityId).map(a => a.label),
      }));
    } catch (err) {
      setError(err.userMessage || err.message || "Impossible de retirer cette commodité.");
    }
  };

  const renderStatusBadge = (statut, status) => {
    const s = status || statut;
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <IconClock size={14} /> En attente
        </span>
      );
    }
    if (s === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
          <IconAlertCircle size={14} /> Refusé
        </span>
      );
    }
    if (s === 'en_maintenance' || statut === 'en_maintenance') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
          <IconAlertCircle size={14} /> En maintenance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <IconCircleCheck size={14} /> Actif
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 text-center text-gray-500 font-medium animate-pulse">
        Chargement des terrains...
      </div>
    );
  }

  // ── ÉTAT 0 : Vue Liste Multi-Terrains (si aucun terrain n'est sélectionné et terrains.length > 0) ──
  if (!selectedTerrainId && terrains && terrains.length > 0) {
    return (
      <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
        {successToast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
            <IconCheck size={18} className="text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Header section avec Quota */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-card border border-black/5 shadow-subtle">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-2xl font-bold font-display text-primary-dark">Mes Terrains</h1>
              <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                {terrains.length} terrain{terrains.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium mt-1">
              {quotaInfo ? (
                quotaInfo.illimite ? (
                  <span className="text-emerald-600 font-bold">✨ Terrains illimités avec votre abonnement</span>
                ) : (
                  <span>Quota abonnement : <strong className="text-primary-dark font-bold">{quotaInfo.utilise} / {quotaInfo.limite}</strong> terrain(s) utilisé(s)</span>
                )
              ) : (
                'Gérez vos terrains de football'
              )}
            </p>
          </div>

          <button
            onClick={openCreateModal}
            disabled={quotaInfo?.quota_atteint}
            title={quotaInfo?.quota_atteint ? `Quota atteint (${quotaInfo.limite} max). Passez au plan supérieur.` : 'Ajouter un nouveau terrain'}
            className={`px-5 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md ${
              quotaInfo?.quota_atteint
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300 shadow-none'
                : 'bg-primary hover:bg-primary-dark text-white shadow-primary/20 cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            <IconPlus size={18} />
            <span>Ajouter un terrain</span>
          </button>
        </div>

        {/* Message d'avertissement quota atteint */}
        {quotaInfo?.quota_atteint && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs font-medium flex items-center justify-between gap-3 shadow-sm">
            <span>⚠️ Vous avez atteint la limite de <strong>{quotaInfo.limite} terrain(s)</strong> de votre offre actuelle. Pour ajouter d'autres terrains, souscrivez au plan Starter ou Pro dans l'onglet Abonnement.</span>
          </div>
        )}

        {/* Grille des terrains */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {terrains.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-card overflow-hidden border border-gray-100 shadow-subtle hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-0.5 rounded-full inline-block mb-1.5 border border-primary/20">
                      {t.quartier || 'Dakar'}
                    </span>
                    <h3 className="font-bold font-display text-primary-dark text-lg truncate">{t.nom}</h3>
                  </div>
                  {renderStatusBadge(t.statut, t.status)}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-gray-100 text-gray-600">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Surface</span>
                    <span className="font-semibold text-gray-800">{t.surface || 'Synthétique'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Format</span>
                    <span className="font-semibold text-gray-800">{t.size || '5v5'}</span>
                  </div>
                  <div className="col-span-2 pt-1">
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Tarif Horaire</span>
                    <span className="font-black text-primary text-sm">{(t.price || 0).toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedTerrainId(t.id)}
                  className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <IconBuildingStore size={16} />
                  <span>Gérer ce terrain</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        <TerrainFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialData={modalEditingTerrain}
          terrainId={modalEditingTerrain ? modalEditingTerrain.id : newTerrainId}
          onSubmit={handleFormSubmit}
          saving={saving}
        />
      </div>
    );
  }

  // ── ÉTAT 1 : Aucun terrain enregistré (Bouton d'ajout principal) ──
  if (!terrain) {
    return (
      <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
        {error && (
          <div className="w-full max-w-md bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-semibold mb-4">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-100 p-8 md:p-12 rounded-[2.5rem] shadow-xl text-center max-w-lg w-full space-y-6 animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto border-2 border-primary/20 shadow-sm">
            <IconBuildingStore size={40} />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold font-display text-primary-dark">Aucun terrain enregistré</h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Créez et enregistrez votre fiche terrain pour la soumettre à la validation administrative de PlaygroundSpot.
            </p>
          </div>

          <button
            onClick={openCreateModal}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 px-6 rounded-2xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <IconPlus size={20} />
            <span>Ajouter mon terrain ⚽</span>
          </button>
        </div>

        <TerrainFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          terrainId={newTerrainId}
          onSubmit={handleFormSubmit}
          saving={saving}
        />
      </div>
    );
  }

  // ── ÉTAT 2 : Terrain en attente de validation (Pending) ──
  if (terrain.status === 'pending') {
    return (
      <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
        <button
          onClick={() => setSelectedTerrainId(null)}
          className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-3.5 py-2 rounded-xl border border-primary/20 transition-all cursor-pointer shadow-sm"
        >
          <IconChevronLeft size={16} />
          <span>← Voir tous mes terrains ({terrains?.length || 1})</span>
        </button>
        {successToast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
            <IconCheck size={18} className="text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Carte d'avertissement Pending */}
        <div className="bg-amber-500/10 border-2 border-amber-500/30 p-6 md:p-8 rounded-[2.5rem] shadow-sm space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                <IconClock size={28} className="animate-spin-slow" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-white uppercase tracking-wider shadow-sm">
                  En attente de validation
                </span>
                <h2 className="text-xl font-bold font-display text-primary-dark mt-1">Fiche terrain sous revue admin</h2>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 self-start sm:self-auto shadow-sm"
            >
              <IconEdit size={16} />
              <span>Modifier la fiche</span>
            </button>
          </div>

          <p className="text-sm text-amber-900 leading-relaxed font-medium bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
            ℹ️ Votre fiche terrain a bien été transmise à notre équipe. Elle est en cours de vérification. 
            Tant qu'elle est en attente, le terrain n'est pas encore visible côté joueur et ne peut recevoir de réservations.
          </p>
        </div>

        {/* Résumé de la fiche soumise */}
        <div className="bg-white rounded-[2.5rem] border border-black/5 shadow-subtle p-6 md:p-8 space-y-6">
          <h3 className="text-lg font-bold font-display text-primary-dark border-b border-gray-100 pb-3">
            Résumé de la fiche soumise
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-56 rounded-2xl overflow-hidden border border-gray-100 relative bg-gray-50">
              {principalPhotoUrl ? (
                <img 
                  src={principalPhotoUrl} 
                  alt={terrain.nom} 
                  className="w-full h-full object-cover"
                />
              ) : loadingPhoto ? (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold animate-pulse">
                  Chargement du visuel...
                </div>
              ) : (
                <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                  <IconPhoto size={36} className="text-gray-300 mb-1" />
                  <span className="text-xs font-bold text-gray-500">Aucune photo principale</span>
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="bg-gray-50 p-4 rounded-2xl space-y-2 border border-gray-100">
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Nom du terrain :</span> <span className="font-bold text-primary-dark">{terrain.nom}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Quartier :</span> <span className="font-bold text-primary-dark">{terrain.quartier}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Adresse :</span> <span className="font-bold text-primary-dark truncate max-w-[200px]">{terrain.adresse || terrain.quartier}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Surface :</span> <span className="font-bold text-primary-dark">{terrain.surface}</span></div>
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Format :</span> <span className="font-bold text-primary-dark">{terrain.size} ({terrain.capacite || 10} joueurs)</span></div>
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Tarif Horaire :</span> <span className="font-bold text-primary">{(terrain.price || 0).toLocaleString('fr-FR')} FCFA</span></div>
                <div className="flex justify-between"><span className="text-gray-400 font-medium">Horaires :</span> <span className="font-bold text-primary-dark">{terrain.horaires || '08:00 - 00:00'}</span></div>
              </div>
            </div>
          </div>
        </div>

        <TerrainFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialData={terrain}
          terrainId={terrain.id}
          onSubmit={handleFormSubmit}
          saving={saving}
        />
      </div>
    );
  }

  // ── ÉTAT 3 : Terrain Rejeté par l'Admin (Rejected) ──
  if (terrain.status === 'rejected') {
    return (
      <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
        <button
          onClick={() => setSelectedTerrainId(null)}
          className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-3.5 py-2 rounded-xl border border-primary/20 transition-all cursor-pointer shadow-sm"
        >
          <IconChevronLeft size={16} />
          <span>← Voir tous mes terrains ({terrains?.length || 1})</span>
        </button>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Carte d'alerte Rejeté */}
        <div className="bg-red-500/10 border-2 border-red-500/30 p-6 md:p-8 rounded-[2.5rem] shadow-sm space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-600 flex items-center justify-center shrink-0">
                <IconAlertCircle size={28} />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-600 text-white uppercase tracking-wider shadow-sm">
                  Terrain Refusé
                </span>
                <h2 className="text-xl font-bold font-display text-red-950 mt-1">Fiche terrain non approuvée</h2>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shrink-0 self-start sm:self-auto shadow-sm"
            >
              <IconEdit size={16} />
              <span>Corriger et resoumettre</span>
            </button>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-red-200 space-y-2">
            <h4 className="font-bold text-xs text-red-700 uppercase tracking-wider">Motif du refus rédigé par l'admin :</h4>
            <p className="text-sm text-red-950 font-semibold leading-relaxed">
              "{terrain.rejection_reason || 'Information incomplète ou visuels non conformes. Veuillez corriger la fiche.'}"
            </p>
          </div>
        </div>

        <TerrainFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialData={terrain}
          terrainId={terrain.id}
          onSubmit={handleFormSubmit}
          saving={saving}
        />
      </div>
    );
  }

  // ── ÉTAT 4 : Terrain Approuvé (Approved) -> Dashboard Complet Standard ──
  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
      <button
        onClick={() => setSelectedTerrainId(null)}
        className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-3.5 py-2 rounded-xl border border-primary/20 transition-all cursor-pointer shadow-sm"
      >
        <IconChevronLeft size={16} />
        <span>← Voir tous mes terrains ({terrains?.length || 1})</span>
      </button>
      {successToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
          <IconCheck size={18} className="text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Pitch Showcase Card */}
      <div
        className="relative bg-white rounded-[2.5rem] overflow-hidden shadow-subtle border border-black/5"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <button
          onClick={() => setIsModalOpen(true)}
          className="absolute top-4 right-4 z-10 px-4 py-2 bg-white/95 backdrop-blur-md hover:bg-white text-primary-dark text-xs font-bold rounded-xl uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          <IconEdit size={14} />
          <span>Modifier ma fiche</span>
        </button>
        <div className="h-48 relative bg-gray-900">
          {principalPhotoUrl ? (
            <img
              src={principalPhotoUrl}
              alt={terrain.nom}
              className="w-full h-full object-cover"
            />
          ) : loadingPhoto ? (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold animate-pulse">
              Chargement du visuel...
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary-dark/90 via-primary-dark to-slate-900 flex flex-col items-center justify-center text-white/50 p-4 text-center">
              <IconPhoto size={36} className="text-white/30 mb-1" />
              <span className="text-xs font-bold text-white/60">Aucune photo enregistrée</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary-dark/40 to-transparent pointer-events-none"></div>
          <div className="absolute bottom-6 left-6 text-white space-y-1 z-10">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">{terrain.quartier}</span>
            <h2 className="text-xl md:text-2xl font-display font-bold">{terrain.nom}</h2>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {pitchSpecs.map((spec, index) => (
              <div
                key={index}
                onClick={() => setSelectedSpec(spec)}
                className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-start gap-3 cursor-pointer hover:bg-primary/5 hover:border-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{
                  animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                  animationDelay: `${index * 0.08 + 0.05}s`
                }}
              >
                <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0"><spec.icon size={20} /></div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{spec.label}</p>
                  <p className="font-bold text-primary-dark text-sm mt-0.5">{spec.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-primary-dark text-sm">Mode Maintenance</h4>
              <p className="text-xs text-gray-400">Activer le mode maintenance fermera instantanément le terrain aux réservations.</p>
            </div>
            <button
              onClick={handleToggleMaintenance}
              disabled={saving}
              className={`px-6 py-3 rounded-2xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2 disabled:opacity-60 ${
                terrain.statut === 'en_maintenance'
                  ? 'bg-red-50 text-red-500 border border-red-200 shadow-md shadow-red-100'
                  : 'bg-primary/10 text-primary border border-primary/20'
              }`}
            >
              <IconTools size={16} />
              {terrain.statut === 'en_maintenance' ? 'Désactiver Maintenance' : 'Activer Maintenance'}
            </button>
          </div>
        </div>
      </div>

      {/* Configuration des Tarifs (Unitech Pay) */}
      <div
        className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-6"
        style={{ animation: 'slideUp 0.4s 0.15s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <IconBuildingStore size={18} className="text-primary" />
              Configuration des Tarifs (Unitech Pay)
            </h3>
            <p className="text-xs text-gray-400">Gérez le prix public affiché aux joueurs et optimisez vos revenus nets.</p>
          </div>
          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full uppercase tracking-wider self-start md:self-auto">
            Frais Unitech Pay : 1.5%
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2">
              <h4 className="font-bold text-xs text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                ⚠️ Attention : Commission Unitech Pay de 1,5%
              </h4>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                La plateforme de paiement sécurisé <span className="font-bold">Unitech Pay</span> (Wave & Orange Money) applique des frais de <span className="font-bold text-amber-800">1,5% de commission</span> sur chaque transaction.
                <br />
                <span className="font-bold text-red-600">Ces frais de 1,5% sont entièrement à votre charge</span>. Vous devez adapter votre prix en y rajoutant les frais, sinon c'est vous qui supportez la perte sur votre gain net.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl space-y-2">
              <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wide">Comment ajuster votre tarif ?</h4>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">
                Pour compenser la commission et ne pas perdre de marge, nous vous conseillons d'intégrer ces frais directement dans votre prix de vente.
                <br />
                <span className="text-primary-dark font-semibold">Exemple :</span> Si vous fixez le prix de base à 15 000 FCFA sans ajustement, vous ne recevrez que 14 775 FCFA nets. En adaptant le prix à 15 230 FCFA, vous récupérez votre marge nette initiale de 15 000 FCFA.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 bg-gray-50/50 border border-gray-100 p-5 rounded-2xl space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tarif affiché au client (FCFA)</label>
              <div className="relative">
                <input
                  type="number"
                  value={priceInput}
                  onChange={(e) => setPriceInput(Math.max(0, parseInt(e.target.value) || 0))}
                  onBlur={handleSavePrice}
                  placeholder="Ex: 15000"
                  className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-primary-dark focus:outline-none focus:ring-2 ring-primary/20 pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">FCFA</span>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-gray-100">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 font-semibold">Frais Unitech Pay (1,5%) :</span>
                <span className="font-bold text-gray-500 font-mono">-{Math.round(priceInput * 0.015).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-primary/10 rounded-xl border border-primary/20">
                <span className="text-xs font-bold text-primary">Votre gain net reçu :</span>
                <span className="text-sm font-black text-primary font-mono">{(priceInput - Math.round(priceInput * 0.015)).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Equipment */}
      <div
        className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-4"
        style={{ animation: 'slideUp 0.4s 0.2s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Équipements & Commodités</h3>
          <button
            onClick={() => setShowAddAmenity(true)}
            className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <IconPlus size={16} />
          </button>
        </div>

        {(terrain.terrain_amenities || []).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Aucune commodité enregistrée pour le moment.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(terrain.terrain_amenities || []).map((item) => (
              <div
                key={item.id}
                onClick={() => handleRemoveAmenity(item.id)}
                className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-red-50 hover:text-red-600 rounded-xl border border-gray-100 hover:border-red-200 transition-all cursor-pointer group text-xs font-semibold text-gray-600"
              >
                <div className="flex items-center gap-2">
                  <IconCheck size={16} className="text-primary shrink-0 group-hover:text-red-500" />
                  <span className="truncate">{item.label}</span>
                </div>
                <IconX size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal - Pitch Spec detail */}
      {selectedSpec && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" onClick={() => setSelectedSpec(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar z-10">
            <button onClick={() => setSelectedSpec(null)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer">
              <IconX size={20} />
            </button>
            <div className="flex items-center gap-3 mb-6 pr-10">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
                <selectedSpec.icon size={24} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">{selectedSpec.label}</h3>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mt-0.5">Spécifications Terrain</span>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Valeur Actuelle</span>
                <p className="font-bold text-base text-primary-dark mt-0.5">{selectedSpec.value}</p>
              </div>
              <div className="border-t border-black/5 pt-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description</span>
                <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{selectedSpec.desc}</p>
              </div>
            </div>
            <button onClick={() => setSelectedSpec(null)} className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
              <IconCheck size={18} /> Confirmer
            </button>
          </div>
        </div>
      , document.body)}

      {/* Modal - Add Amenity */}
      {showAddAmenity && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-primary-dark/60 backdrop-blur-md transition-opacity" onClick={() => setShowAddAmenity(false)}></div>
          <form onSubmit={handleAddAmenity} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar z-10">
            <button type="button" onClick={() => setShowAddAmenity(false)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer">
              <IconX size={20} />
            </button>
            <h3 className="text-xl font-display font-bold text-primary-dark mb-6 pr-10 min-w-0 truncate whitespace-normal break-words">Ajouter une commodité</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Nom de la commodité</label>
                <input
                  type="text"
                  value={newAmenity}
                  onChange={(e) => setNewAmenity(e.target.value)}
                  placeholder="Ex: Wi-Fi gratuit, Vestiaires climatisés..."
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 ring-primary/20"
                  required
                  autoFocus
                />
              </div>
            </div>
            <button type="submit" className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
              <IconPlus size={18} /> Ajouter
            </button>
          </form>
        </div>
      , document.body)}

      <TerrainFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={terrain}
        terrainId={terrain.id}
        onSubmit={handleFormSubmit}
        saving={saving}
      />
    </div>
  );
};
