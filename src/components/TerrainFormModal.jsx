import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  IconX,
  IconBuildingStore,
  IconMapPin,
  IconSparkles,
  IconUsers,
  IconPhoto,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconClock,
  IconCoin,
  IconCheck,
  IconPlus,
  IconLoader2,
  IconUpload,
  IconCamera,
  IconAlertCircle,
  IconRefresh,
  IconFileText,
  IconPaperclip,
  IconExternalLink,
  IconFileTypePdf,
  IconCrosshair,
  IconSearch,
  IconPhone,
  IconCircleCheckFilled
} from '@tabler/icons-react';
import waveLogo from '../assets/wave.png';
import omLogo from '../assets/orange_money.png';
import { ImageCropperModal } from './ImageCropperModal';
import { 
  uploadTerrainPhoto, 
  getTerrainGalleryPhotoUrls,
  uploadTerrainDocument,
  fetchTerrainDocuments,
  getTerrainDocumentSignedUrl,
  deleteTerrainDocument
} from '../services/terrains';
import { CustomSelect } from './CustomSelect';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';

// Custom Marker Icon for location picker
const createPickerIcon = () => {
  return L.divIcon({
    html: `
      <div class="relative w-9 h-9 flex items-center justify-center">
        <div class="absolute inset-0 bg-primary rounded-full shadow-lg border-2 border-white animate-bounce"></div>
        <div class="z-10 text-white font-bold text-xs">⚽</div>
      </div>
    `,
    className: 'custom-picker-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
};

// Component to handle map clicks for setting GPS pin
const MapLocationPicker = ({ position, onChange }) => {
  useMapEvents({
    click(e) {
      onChange({ lat: parseFloat(e.latlng.lat.toFixed(6)), lng: parseFloat(e.latlng.lng.toFixed(6)) });
    },
  });

  return position ? (
    <Marker 
      position={[position.lat, position.lng]} 
      icon={createPickerIcon()} 
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          onChange({ lat: parseFloat(pos.lat.toFixed(6)), lng: parseFloat(pos.lng.toFixed(6)) });
        }
      }}
    />
  ) : null;
};

export const TerrainFormModal = ({ isOpen, onClose, initialData = null, terrainId, onSubmit, saving = false }) => {
  const [formData, setFormData] = useState({
    nom: '',
    quartier: 'Almadies',
    adresse: '',
    surface: 'Synthétique',
    size: '5v5',
    capacite: 10,
    price: 35000,
    horaires: '08:00 - 00:00',
    lat: 14.7167,
    lng: -17.4677,
    payoutPhone: '',
    payoutOperator: 'wave',
    photos: []
  });

  const [formError, setFormError] = useState('');
  const [selectedFileForCrop, setSelectedFileForCrop] = useState(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [lastCroppedBlob, setLastCroppedBlob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const QUARTIERS = [
    'Almadies', 'Mermoz', 'Plateau', 'Yoff', 'Sacré-Cœur', 'Ouakam', 'Ngor',
    'Liberté 6', 'Fann', 'Parcelles Assainies', 'Grand Yoff', 'Guédiawaye', 'Pikine', 'Rufisque'
  ];

  // value = valeur réelle de l'enum Postgres surface_terrain (Synthétique/
  // Béton/Sable/Gazon naturel) ; label = libellé affiché au gérant.
  const SURFACES = [
    { value: 'Synthétique', label: 'Gazon Synthétique' },
    { value: 'Gazon naturel', label: 'Gazon Naturel' },
    { value: 'Béton', label: 'Béton / City Stade' },
    { value: 'Sable', label: 'Sable' },
  ];

  const SIZES = ['5v5', '7v7', '11v11'];

  // Géolocalisation navigateur (Option A) & Recherche Nominatim
  const [geoLocating, setGeoLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);

  const DAKAR_DEFAULT = { lat: 14.7167, lng: -17.4677 };

  const handleUseMyPosition = () => {
    if (!navigator.geolocation) {
      setFormError("La géolocalisation n'est pas supportée. Position récente conservée.");
      return;
    }

    setGeoLocating(true);
    setFormError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(p => ({
          ...p,
          lat: parseFloat(pos.coords.latitude.toFixed(6)),
          lng: parseFloat(pos.coords.longitude.toFixed(6))
        }));
        setGeoLocating(false);
      },
      (err) => {
        setGeoLocating(false);
        // Fallback Dakar center
        setFormData(p => ({
          ...p,
          lat: p.lat || DAKAR_DEFAULT.lat,
          lng: p.lng || DAKAR_DEFAULT.lng
        }));

        if (err.code === 1) {
          setFormError("Permission de géolocalisation refusée. Carte recentrée sur Dakar.");
        } else if (err.code === 2) {
          setFormError("Position GPS indisponible. Carte recentrée sur Dakar.");
        } else if (err.code === 3) {
          setFormError("Délai GPS dépassé. Carte recentrée sur Dakar.");
        } else {
          setFormError("Impossible de déterminer votre position. Carte centrée sur Dakar.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // OpenStreetMap Nominatim search helper
  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;
    setSearchingAddress(true);
    setFormError('');
    try {
      const q = encodeURIComponent(`${searchQuery.trim()}, Dakar, Sénégal`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`);
      const results = await res.json();
      if (results && results.length > 0) {
        const first = results[0];
        setFormData(p => ({
          ...p,
          lat: parseFloat(parseFloat(first.lat).toFixed(6)),
          lng: parseFloat(parseFloat(first.lon).toFixed(6))
        }));
      } else {
        setFormError("Aucune adresse trouvée pour cette recherche à Dakar.");
      }
    } catch (err) {
      console.error('Erreur recherche Nominatim:', err);
      setFormError("Erreur lors de la recherche de l'adresse.");
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (formData.photos.length >= 6) {
      setFormError('Limite de 6 photos atteinte.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setFormError('Le fichier sélectionné est trop lourd (max 15 Mo).');
      return;
    }

    setFormError('');
    setUploadError('');
    setSelectedFileForCrop(file);
    setIsCropperOpen(true);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropComplete = async (croppedBlob) => {
    setIsCropperOpen(false);
    setLastCroppedBlob(croppedBlob);
    await processUploadBlob(croppedBlob);
  };

  const processUploadBlob = async (blob) => {
    if (formData.photos.length >= 6) {
      setFormError('Limite de 6 photos atteinte.');
      return;
    }
    if (!terrainId) {
      setUploadError("Impossible d'uploader : identifiant terrain manquant.");
      return;
    }

    setUploadingPhoto(true);
    setUploadError('');

    try {
      const uploaded = await uploadTerrainPhoto(blob, terrainId);
      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, uploaded] // { storagePath, previewUrl }
      }));
    } catch (err) {
      console.error('Erreur upload photo terrain:', err);
      setUploadError(err.userMessage || "L'envoi de la photo a échoué.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const [loadingExistingPhotos, setLoadingExistingPhotos] = useState(false);

  // ── Gestion des Documents Justificatifs Terrain ──
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('piece_identite');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  const docFileInputRef = useRef(null);

  const DOC_TYPE_LABELS = {
    piece_identite: "Pièce d'identité (CNI / Passeport)",
    justificatif_propriete: "Justificatif de propriété / Bail",
    autre: "Autre document justificatif"
  };

  useEffect(() => {
    let isMounted = true;
    if (isOpen && initialData) {
      setFormData({
        nom: initialData.nom || initialData.name || '',
        quartier: initialData.quartier || 'Almadies',
        adresse: initialData.adresse || initialData.quartier || '',
        surface: initialData.surface || 'Synthétique',
        size: initialData.size || '5v5',
        capacite: initialData.capacite || 10,
        price: initialData.price || 35000,
        horaires: initialData.horaires || '08:00 - 00:00',
        lat: initialData.lat || 14.7167,
        lng: initialData.lng || -17.4677,
        photos: []
      });

      const targetId = initialData.id || terrainId;
      if (targetId) {
        setLoadingExistingPhotos(true);
        getTerrainGalleryPhotoUrls(targetId)
          .then(gallery => {
            if (isMounted && gallery && gallery.length > 0) {
              setFormData(prev => ({
                ...prev,
                photos: gallery
              }));
            }
          })
          .catch(err => console.error('Erreur rechargement photos existantes:', err))
          .finally(() => {
            if (isMounted) setLoadingExistingPhotos(false);
          });

        setLoadingDocs(true);
        fetchTerrainDocuments(targetId)
          .then(docs => {
            if (isMounted) setDocuments(docs || []);
          })
          .catch(err => console.error('Erreur rechargement documents existants:', err))
          .finally(() => {
            if (isMounted) setLoadingDocs(false);
          });
      }
    } else if (isOpen) {
      setFormData({
        nom: '',
        quartier: 'Almadies',
        adresse: '',
        surface: 'Synthétique',
        size: '5v5',
        capacite: 10,
        price: 35000,
        horaires: '08:00 - 00:00',
        lat: 14.7167,
        lng: -17.4677,
        photos: []
      });

      if (terrainId) {
        setLoadingDocs(true);
        fetchTerrainDocuments(terrainId)
          .then(docs => {
            if (isMounted) setDocuments(docs || []);
          })
          .catch(err => console.error('Erreur chargement documents:', err))
          .finally(() => {
            if (isMounted) setLoadingDocs(false);
          });
      } else {
        setDocuments([]);
      }
    }
    return () => { isMounted = false; };
  }, [initialData, isOpen, terrainId]);

  const handleDocumentFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocError('');

    const targetId = initialData?.id || terrainId;
    if (!targetId) {
      setDocError('Identifiant terrain introuvable pour l\'upload du document.');
      return;
    }

    if (documents.length >= 5) {
      setDocError('Limite maximale de 5 documents justificatifs atteinte pour ce terrain.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setDocError('Le fichier dépasse la taille maximale autorisée de 10 Mo.');
      return;
    }

    setUploadingDoc(true);
    try {
      const newDoc = await uploadTerrainDocument(file, targetId, selectedDocType);
      setDocuments(prev => [...prev, newDoc]);
    } catch (err) {
      console.error('Erreur upload document terrain:', err);
      setDocError(err.userMessage || "L'envoi du document a échoué.");
    } finally {
      setUploadingDoc(false);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId) => {
    setDocError('');
    try {
      await deleteTerrainDocument(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Erreur suppression document:', err);
      setDocError(err.userMessage || 'Impossible de supprimer ce document.');
    }
  };

  const handleOpenDocument = async (storagePath) => {
    try {
      const url = await getTerrainDocumentSignedUrl(storagePath);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Erreur ouverture document:', err);
      setDocError(err.userMessage || 'Impossible d\'ouvrir ce document.');
    }
  };

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'capacite' || name === 'price' ? Number(value) : value
    }));
  };

  const handleRemovePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleMovePhoto = (index, direction) => {
    const newPhotos = [...formData.photos];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newPhotos.length) return;
    const temp = newPhotos[index];
    newPhotos[index] = newPhotos[targetIndex];
    newPhotos[targetIndex] = temp;
    setFormData(prev => ({ ...prev, photos: newPhotos }));
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.nom.trim()) {
      setFormError('Le nom du terrain est requis.');
      return;
    }
    if (!formData.adresse.trim()) {
      setFormError("L'adresse exacte est requise.");
      return;
    }
    if (!formData.payoutPhone || !/^7[0-9]{8}$/.test(formData.payoutPhone.replace(/\s+/g, ''))) {
      setFormError('Un numéro de versement Wave/Orange Money valide à 9 chiffres est obligatoire pour recevoir vos revenus.');
      return;
    }
    if (formData.photos.length === 0) {
      setFormError('Veuillez ajouter au moins une photo pour le terrain.');
      return;
    }

    // Ne plus jamais envoyer d'URL signée dans terrains.image_url !
    const payload = {
      nom: formData.nom.trim(),
      quartier: formData.quartier,
      adresse: formData.adresse.trim(),
      surface: formData.surface,
      size: formData.size,
      capacite: Number(formData.capacite) || 10,
      price: Number(formData.price) || 35000,
      horaires: formData.horaires.trim(),
      lat: Number(formData.lat),
      lng: Number(formData.lng),
      photos: formData.photos.map(p => ({
        storagePath: typeof p === 'string' ? p : p.storagePath
      }))
    };

    setSubmitting(true);
    try {
      const { error: payoutInfoError } = await supabase.rpc('upsert_gerant_payout_info', {
        p_phone: formData.payoutPhone.replace(/\s+/g, ''),
        p_operator: formData.payoutOperator,
      });

      if (payoutInfoError) {
        setFormError(payoutInfoError.message || "Impossible d'enregistrer vos informations de versement.");
        setSubmitting(false);
        return;
      }

      await onSubmit(payload);
    } catch (err) {
      console.error('Erreur lors de la soumission du terrain:', err);
      setFormError(err.userMessage || err.message || "Erreur lors de la soumission du terrain pour validation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="relative bg-white w-full max-w-3xl rounded-[2rem] p-6 lg:p-8 shadow-2xl space-y-6 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <IconBuildingStore size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold font-display text-primary-dark">
                {initialData ? 'Modifier la Fiche Terrain' : 'Créer un Nouveau Terrain'}
              </h3>
              <p className="text-xs text-gray-500">
                {initialData?.status === 'approved' 
                  ? 'Mettez à jour les informations de votre complexe (application immédiate).'
                  : 'Remplissez les spécifications de votre complexe pour validation admin.'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer text-gray-600"
          >
            <IconX size={18} />
          </button>
        </div>

        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs font-semibold">
            ⚠️ {formError}
          </div>
        )}

        <form onSubmit={handleSubmitForm} className="space-y-6">

          {/* Section 1 : Informations Générales */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-primary-dark flex items-center gap-2">
              <IconSparkles size={18} className="text-primary" />
              1. Informations Générales
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nom du terrain *</label>
                <input 
                  type="text" 
                  name="nom"
                  value={formData.nom} 
                  onChange={handleChange}
                  placeholder="Ex: Arena Five Almadies" 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary font-medium"
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Quartier / Zone *</label>
                <CustomSelect 
                  value={formData.quartier}
                  onChange={(val) => setFormData(p => ({ ...p, quartier: val }))}
                  options={QUARTIERS}
                  placeholder="Sélectionner un quartier"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">Adresse complète / Repères *</label>
                <input 
                  type="text" 
                  name="adresse"
                  value={formData.adresse} 
                  onChange={handleChange}
                  placeholder="Ex: Route des Almadies, en face de la station Total" 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary font-medium"
                  required 
                />
              </div>
            </div>
          </div>

          {/* Section 2 : Spécifications Techniques & Tarifs */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-primary-dark flex items-center gap-2">
              <IconUsers size={18} className="text-primary" />
              2. Caractéristiques & Tarification
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Type de surface</label>
                <CustomSelect 
                  value={formData.surface}
                  onChange={(val) => setFormData(p => ({ ...p, surface: val }))}
                  options={SURFACES}
                  placeholder="Type de surface"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Format de jeu</label>
                <CustomSelect 
                  value={formData.size}
                  onChange={(val) => setFormData(p => ({ ...p, size: val }))}
                  options={SIZES}
                  placeholder="Format de jeu"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Capacité (joueurs)</label>
                <input 
                  type="number" 
                  name="capacite"
                  min="2"
                  max="30"
                  value={formData.capacite} 
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Tarif Horaire (FCFA) *</label>
                <input 
                  type="number" 
                  name="price"
                  step="1000"
                  min="0"
                  value={formData.price} 
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary font-medium"
                  required 
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">Horaires d'ouverture</label>
                <input 
                  type="text" 
                  name="horaires"
                  value={formData.horaires} 
                  onChange={handleChange}
                  placeholder="Ex: 08:00 - 00:00" 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary font-medium"
                />
              </div>
            </div>
          </div>

          {/* Section 3 : Localisation sur Carte Leaflet */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-sm text-primary-dark flex items-center gap-2">
                <IconMapPin size={18} className="text-primary" />
                3. Emplacement GPS
              </h4>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleUseMyPosition}
                  disabled={geoLocating}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {geoLocating ? <IconLoader2 size={12} className="animate-spin" /> : <IconCrosshair size={12} />}
                  Ma position actuelle
                </button>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                  {formData.lat}, {formData.lng}
                </span>
              </div>
            </div>

            {/* Barre de Recherche d'Adresse Nominatim (OpenStreetMap) */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchAddress())}
                  placeholder="Rechercher un lieu/quartier à Dakar (ex: Mermoz, Sacré-Cœur)..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              <button
                type="button"
                onClick={handleSearchAddress}
                disabled={searchingAddress || !searchQuery.trim()}
                className="px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
              >
                {searchingAddress ? <IconLoader2 size={14} className="animate-spin" /> : 'Centrer'}
              </button>
            </div>

            {/* Carte Leaflet déplaçable avec tuiles CartoDB Voyager */}
            <div className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative">
              <MapContainer 
                key={isOpen ? `map-${formData.lat}-${formData.lng}` : 'closed'}
                center={[formData.lat, formData.lng]} 
                zoom={14} 
                scrollWheelZoom={false}
                className="h-full w-full z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
                <MapLocationPicker 
                  position={{ lat: formData.lat, lng: formData.lng }}
                  onChange={({ lat, lng }) => setFormData(p => ({ ...p, lat, lng }))}
                />
              </MapContainer>
            </div>
            <p className="text-[11px] text-gray-400 italic">
              💡 Astuce : Vous pouvez glisser-déposer l'icône ballon de foot directement sur la carte pour ajuster la position exacte.
            </p>
          </div>

          {/* Section 4 : Galerie Photos (6 max) avec Recadrage & Compression */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-primary-dark flex items-center gap-2">
                <IconPhoto size={18} className="text-primary" />
                4. Photos du Terrain ({formData.photos.length}/6 max)
              </h4>
              <span className="text-xs text-gray-500">La 1ère photo sera la couverture principale (format 16:9).</span>
            </div>

            {/* Fichier file input masqué */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Zone d'upload DropZone */}
            {formData.photos.length < 6 && (
              <div
                onClick={() => !uploadingPhoto && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  uploadingPhoto
                    ? 'border-primary bg-primary/5 cursor-wait'
                    : 'border-gray-300 hover:border-primary hover:bg-gray-50/80 bg-gray-50/50'
                }`}
              >
                {uploadingPhoto ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <IconLoader2 size={32} className="animate-spin text-primary" />
                    <span className="text-xs font-bold text-primary">Envoi de la photo recadrée en cours...</span>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <IconUpload size={24} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-primary-dark block">
                        Cliquez ou glissez une photo ici
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        JPEG, PNG, WEBP, HEIC (max 15 Mo). Appareil photo mobile supporté.
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Message d'erreur d'upload avec Retry */}
            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconAlertCircle size={16} className="shrink-0 text-red-600" />
                  <span>{uploadError}</span>
                </div>
                {lastCroppedBlob && (
                  <button
                    type="button"
                    onClick={() => processUploadBlob(lastCroppedBlob)}
                    className="px-3 py-1 bg-red-600 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 hover:bg-red-700 transition-all shrink-0 cursor-pointer"
                  >
                    <IconRefresh size={13} /> Réessayer
                  </button>
                )}
              </div>
            )}

            {/* Photo Grid Preview & Reorder */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {formData.photos.map((photo, idx) => (
                <div key={idx} className="relative group bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 h-28 shadow-sm">
                  <img src={photo.previewUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  
                  {idx === 0 && (
                    <span className="absolute top-2 left-2 bg-primary text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                      PRINCIPALE
                    </span>
                  )}

                  {/* Actions overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    {idx > 0 && (
                      <button 
                        type="button"
                        onClick={() => handleMovePhoto(idx, -1)}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg transition-colors cursor-pointer"
                        title="Déplacer vers la gauche"
                      >
                        <IconArrowUp size={14} />
                      </button>
                    )}
                    {idx < formData.photos.length - 1 && (
                      <button 
                        type="button"
                        onClick={() => handleMovePhoto(idx, 1)}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg transition-colors cursor-pointer"
                        title="Déplacer vers la droite"
                      >
                        <IconArrowDown size={14} />
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer"
                      title="Supprimer la photo"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5 : Documents Justificatifs */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-primary-dark flex items-center gap-2">
                  <IconFileText size={18} className="text-primary" />
                  5. Documents Justificatifs ({documents.length}/5 max)
                </h4>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                  Transmettez vos pièces réglementaires (CNI/Passeport, Titre de propriété ou Bail). Stockage confidentiel réservé à l'administration.
                </p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                Fichiers Privés
              </span>
            </div>

            {docError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                <IconAlertCircle size={16} className="shrink-0 text-red-600" />
                <span>{docError}</span>
              </div>
            )}

            {/* Zone d'upload de document */}
            {documents.length < 5 ? (
              <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Type de document *
                    </label>
                    <CustomSelect
                      value={selectedDocType}
                      onChange={(val) => setSelectedDocType(val)}
                      options={[
                        { value: 'piece_identite', label: "Pièce d'identité (CNI / Passeport)" },
                        { value: 'justificatif_propriete', label: 'Justificatif de propriété / Bail' },
                        { value: 'autre', label: 'Autre document justificatif' }
                      ]}
                    />
                  </div>

                  <div>
                    <input 
                      type="file" 
                      ref={docFileInputRef}
                      onChange={handleDocumentFileSelect}
                      accept="application/pdf,image/jpeg,image/png,image/heic" 
                      className="hidden" 
                    />
                    <button
                      type="button"
                      disabled={uploadingDoc}
                      onClick={() => docFileInputRef.current?.click()}
                      className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-subtle transition-all cursor-pointer disabled:opacity-50 min-h-[42px]"
                    >
                      {uploadingDoc ? (
                        <> <IconLoader2 size={16} className="animate-spin" /> Envoi en cours... </>
                      ) : (
                        <> <IconPaperclip size={16} /> Joindre un document (PDF/Image) </>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">
                  Formats acceptés : PDF, JPG, PNG, HEIC (Max 10 Mo par fichier).
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold">
                ⚠️ Limite maximale de 5 documents justificatifs atteinte pour ce terrain.
              </div>
            )}

            {/* Liste des Documents Téléversés */}
            {loadingDocs ? (
              <div className="p-4 text-center text-gray-400 text-xs font-medium animate-pulse">
                Chargement des documents...
              </div>
            ) : documents.length > 0 ? (
              <div className="space-y-2 pt-1">
                {documents.map((doc) => (
                  <div 
                    key={doc.id}
                    className="p-3 bg-white border border-gray-100 rounded-2xl flex items-center justify-between gap-3 shadow-subtle hover:border-gray-200 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        {doc.storage_path.endsWith('.pdf') ? <IconFileTypePdf size={20} /> : <IconPaperclip size={20} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-primary-dark truncate">
                            {doc.nom_original}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-600 shrink-0">
                            {DOC_TYPE_LABELS[doc.type_document] || doc.type_document}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 block font-medium mt-0.5">
                          Ajouté le {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenDocument(doc.storage_path)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Consulter le document"
                      >
                        <IconExternalLink size={14} />
                        <span className="hidden sm:inline">Consulter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                        title="Supprimer le document"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center border-2 border-dashed border-gray-200 rounded-2xl text-xs text-gray-400 font-medium">
                Aucun document justificatif joint pour le moment.
              </div>
            )}
          </div>

          {/* Section 6 : Coordonnées de Versement & Transparence Commission */}
          <div className="space-y-4 pt-4 border-t border-gray-100 bg-[#0F2318]/5 p-5 rounded-2xl border border-[#1A7A4A]/20">
            <h4 className="font-bold text-sm text-[#0F2318] flex items-center gap-2">
              <IconCoin size={18} className="text-[#1A7A4A]" />
              6. Coordonnées de Versement des Revenus *
            </h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Opérateur de versement *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Wave */}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, payoutOperator: 'wave' }))}
                    className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer ${
                      formData.payoutOperator === 'wave'
                        ? 'border-[#1DB954] bg-[#1DB954]/5 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#1DB954]/10 p-1 flex items-center justify-center shrink-0">
                        <img src={waveLogo} alt="Wave" className="w-full h-full object-contain" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm text-primary-dark">Wave</p>
                        <p className="text-[10px] text-gray-400 font-medium">Wave Mobile Money</p>
                      </div>
                    </div>
                    {formData.payoutOperator === 'wave' && <IconCircleCheckFilled className="text-[#1DB954] shrink-0" size={20} />}
                  </button>

                  {/* Orange Money */}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, payoutOperator: 'orange_money' }))}
                    className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer ${
                      formData.payoutOperator === 'orange_money'
                        ? 'border-[#FF6600] bg-[#FF6600]/5 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#FF6600]/10 p-1 flex items-center justify-center shrink-0">
                        <img src={omLogo} alt="Orange Money" className="w-full h-full object-contain" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm text-primary-dark">Orange Money</p>
                        <p className="text-[10px] text-gray-400 font-medium">Orange Money Sénégal</p>
                      </div>
                    </div>
                    {formData.payoutOperator === 'orange_money' && <IconCircleCheckFilled className="text-[#FF6600] shrink-0" size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Numéro de téléphone *</label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center gap-1.5 text-gray-400 pointer-events-none">
                    <IconPhone size={16} />
                    <span className="text-xs font-bold text-gray-500 border-r border-gray-200 pr-2">+221</span>
                  </div>
                  <input
                    type="tel"
                    value={formData.payoutPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, payoutPhone: e.target.value }))}
                    placeholder="77 123 45 67"
                    className="w-full bg-white border border-gray-300 rounded-xl pl-20 pr-3.5 py-2.5 text-xs text-gray-800 focus:outline-none focus:border-[#1A7A4A] font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Message de transparence obligatoire sur les commissions */}
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed font-medium">
              💡 <span className="font-bold">Informations sur les versements :</span> Une commission de <span className="font-bold">X%</span> (selon votre plan d'abonnement : Free 12%, Starter 8%, Pro 2%, Entreprise 0%) ainsi que les frais du fournisseur d'accès Wave/Orange Money (~2.5%) sont déduits automatiquement de chaque réservation avant versement sur votre compte. Précision : même avec le plan Entreprise (0% de commission), les frais de l'opérateur mobile money restent prélevés.
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              Annuler
            </button>

            <button 
              type="submit"
              disabled={saving || submitting || uploadingPhoto}
              className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-subtle transition-all cursor-pointer disabled:opacity-50"
            >
              {(saving || submitting) ? (
                <> <IconLoader2 size={16} className="animate-spin" /> Enregistrement... </>
              ) : initialData ? (
                <> <IconCheck size={16} /> Enregistrer les modifications </>
              ) : (
                <> <IconCheck size={16} /> Soumettre pour validation </>
              )}
            </button>
          </div>

        </form>

      </div>

      {/* Modale d'Édition et de Recadrage Photo 16:9 */}
      <ImageCropperModal
        isOpen={isCropperOpen}
        imageFile={selectedFileForCrop}
        onClose={() => setIsCropperOpen(false)}
        onCropComplete={handleCropComplete}
      />
    </Modal>
  );
};
