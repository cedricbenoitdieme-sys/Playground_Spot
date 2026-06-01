import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconBuildingStore, 
  IconCheck, 
  IconClock, 
  IconMapPin, 
  IconTools, 
  IconUsers, 
  IconSparkles,
  IconX,
  IconPlus,
  IconCalendar,
  IconUser
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';

export const GerantTerrain = () => {
  const { currentUser } = useUser();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  
  // Interactive modal states
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showAddAmenity, setShowAddAmenity] = useState(false);
  const [newAmenity, setNewAmenity] = useState('');
  
  const [amenities, setAmenities] = useState([
    "Vestiaires Chauds / Froids",
    "Douches Individuelles",
    "Chasubles fournies",
    "Ballons de match (Nike)",
    "Parking Sécurisé gratuit",
    "Zone Cafétéria & Buvette",
    "Éclairage LED Nuit",
    "Tableau d'affichage des scores"
  ]);

  const pitchSpecs = [
    { label: "Type de surface", value: "Synthétique 5G Premium", icon: IconSparkles, desc: "Pelouse synthétique de dernière génération pour réduire les risques de blessures et assurer un rebond de balle professionnel." },
    { label: "Dimensions", value: "Foot à 5 & Foot à 7", icon: IconUsers, desc: "Modulable selon le nombre de joueurs avec lignes de marquage haute visibilité pour matchs compétitifs ou loisirs." },
    { label: "Horaires", value: "08:00 - 23:00", icon: IconClock, desc: "Ouvert tous les jours avec créneaux de 60 minutes. Éclairage automatique activé à partir de 18:30." },
    { label: "Tarif Horaire", value: "15K - 20K FCFA", icon: IconBuildingStore, desc: "Tarif de base en journée : 15.000 FCFA/h. Tarif heures pleines (après 18h & week-end) : 20.000 FCFA/h." },
  ];

  const logs = [
    { id: 1, action: "Entretien pelouse synthétique", date: "15/05/2026", user: "Gérant", desc: "Brossage et regarnissage complet des granules de liège écologique pour un amorti optimal.", status: "Terminé" },
    { id: 2, action: "Remplacement projecteur LED", date: "10/05/2026", user: "Technicien", desc: "Changement de 2 modules de projecteurs défectueux (Zone Nord). Puissance accrue de 20%.", status: "Terminé" },
    { id: 3, action: "Réapprovisionnement buvette", date: "08/05/2026", user: "Gérant", desc: "Livraison de 10 packs d'eau, boissons énergisantes et lavage complet des chasubles de rechange.", status: "Terminé" },
  ];

  const handleAddAmenity = (e) => {
    e.preventDefault();
    if (newAmenity.trim()) {
      setAmenities([...amenities, newAmenity.trim()]);
      setNewAmenity('');
      setShowAddAmenity(false);
    }
  };

  const handleRemoveAmenity = (indexToRemove) => {
    setAmenities(amenities.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto px-6 lg:px-8 py-6">
      {/* Pitch Showcase Card */}
      <div 
        className="relative bg-white rounded-[2.5rem] overflow-hidden shadow-subtle border border-black/5"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="h-48 relative">
          <img 
            src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=1200" 
            alt="Terrain Champions" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary-dark/40 to-transparent"></div>
          <div className="absolute bottom-6 left-6 text-white space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">Almadies</span>
            <h2 className="text-xl md:text-2xl font-display font-bold">{currentUser.terrain}</h2>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
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
              onClick={() => setMaintenanceMode(!maintenanceMode)}
              className={`px-6 py-3 rounded-2xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2 ${
                maintenanceMode 
                  ? 'bg-red-50 text-red-500 border border-red-200 shadow-md shadow-red-100' 
                  : 'bg-primary/10 text-primary border border-primary/20'
              }`}
            >
              <IconTools size={16} />
              {maintenanceMode ? 'Désactiver Maintenance' : 'Activer Maintenance'}
            </button>
          </div>
        </div>
      </div>

      {/* Equipment & Settings details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pitch Equipment checklist */}
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {amenities.map((item, index) => (
              <div 
                key={index} 
                onClick={() => handleRemoveAmenity(index)}
                className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-red-50 hover:text-red-600 rounded-xl border border-gray-100 hover:border-red-200 transition-all cursor-pointer group text-xs font-semibold text-gray-600"
              >
                <div className="flex items-center gap-2">
                  <IconCheck size={16} className="text-primary shrink-0 group-hover:text-red-500" />
                  <span className="truncate">{item}</span>
                </div>
                <IconX size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Live maintenance/events log */}
        <div 
          className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-4"
          style={{ animation: 'slideUp 0.4s 0.25s cubic-bezier(.22,1,.36,1) both' }}
        >
          <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Historique & Rapports</h3>
          <div className="space-y-3">
            {logs.map((log) => (
              <div 
                key={log.id} 
                onClick={() => setSelectedLog(log)}
                className="p-4 bg-gray-50 hover:bg-primary/5 rounded-2xl border border-gray-100 hover:border-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer space-y-2"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-primary-dark">{log.action}</span>
                  <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1"><IconCalendar size={10} /> {log.date}</span>
                </div>
                <p className="text-[10px] text-gray-500 font-medium line-clamp-1">{log.desc}</p>
                <div className="flex items-center justify-between pt-1 border-t border-black/5">
                  <span className="text-[9px] font-semibold text-gray-400 flex items-center gap-0.5"><IconUser size={10} /> Par : {log.user}</span>
                  <span className="text-[9px] font-bold text-status-confirmed bg-status-confirmed/10 px-2 py-0.5 rounded-full">{log.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal - Pitch Spec detail */}
      {selectedSpec && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedSpec(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar">
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
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description Technique</span>
                <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{selectedSpec.desc}</p>
              </div>
            </div>
            <button onClick={() => setSelectedSpec(null)} className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
              <IconCheck size={18} /> Confirmer
            </button>
          </div>
        </div>
      , document.body)}

      {/* Modal - Log detail */}
      {selectedLog && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedLog(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar">
            <button onClick={() => setSelectedLog(null)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-all cursor-pointer">
              <IconX size={20} />
            </button>
            <div className="flex items-center gap-3 mb-6 pr-10">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0">
                <IconTools size={24} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-display font-bold text-primary-dark leading-tight truncate whitespace-normal break-words">{selectedLog.action}</h3>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 mt-0.5"><IconCalendar size={10} /> Rapport du {selectedLog.date}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3 text-sm">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Intervenant</span>
                  <p className="font-bold text-primary-dark mt-0.5">{selectedLog.user}</p>
                </div>
                <div className="border-t border-black/5 pt-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description des travaux</span>
                  <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{selectedLog.desc}</p>
                </div>
                <div className="border-t border-black/5 pt-3 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Statut</span>
                  <span className="text-xs font-bold text-status-confirmed bg-status-confirmed/10 px-3 py-0.5 rounded-full">{selectedLog.status}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedLog(null)} className="w-full btn-primary h-12 rounded-2xl font-bold mt-8 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20">
              <IconCheck size={18} /> Fermer
            </button>
          </div>
        </div>
      , document.body)}

      {/* Modal - Add Amenity */}
      {showAddAmenity && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAddAmenity(false)}></div>
          <form onSubmit={handleAddAmenity} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar">
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
    </div>
  );
};
