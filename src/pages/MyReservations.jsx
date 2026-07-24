import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { fetchReservations } from '../services/reservations';
import { 
  IconCalendar, 
  IconMapPin, 
  IconClock, 
  IconChevronRight, 
  IconTicket,
  IconDotsVertical,
  IconCheck,
  IconLoader2
} from '@tabler/icons-react';
import { ReservationsSkeleton } from '../components/Skeletons';
import { TerrainImage } from '../components/TerrainImage';

const getStatusColor = (status) => {
  switch (status) {
    case 'Confirmée':
    case 'confirmee':
    case 'À venir': return 'bg-primary/10 text-primary border-primary/20';
    case 'Passée':
    case 'Terminée':
    case 'terminee': return 'bg-gray-100 text-gray-500 border-gray-200';
    case 'Annulée':
    case 'annulee': return 'bg-red-50 text-red-500 border-red-100';
    default: return 'bg-yellow-50 text-yellow-600 border-yellow-200';
  }
};

export const MyReservations = ({ onSelect }) => {
  const { currentUser } = useUser();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('À venir');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const params = {};
        if (currentUser && currentUser.role === 'joueur') {
          params.joueurId = currentUser.id;
        }
        const data = await fetchReservations(params);
        setReservations(data);
      } catch (err) {
        console.error('Erreur chargement reservations:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const filtered = reservations.filter(res => {
    const s = res.status;
    if (activeTab === 'À venir') return s === 'Confirmée' || s === 'En attente' || s === 'À venir';
    if (activeTab === 'Passées') return s === 'Terminée' || s === 'Passée';
    if (activeTab === 'Annulées') return s === 'Annulée';
    return true;
  });

  const renderStepper = (status) => {
    // 3 steps: En attente -> Confirmée -> Terminée
    // If Cancelled, it's a special red state.
    if (status === 'Annulée') {
      return (
         <div className="flex items-center gap-2 mt-4 opacity-70">
            <div className="flex-1 h-1 bg-red-200 rounded-full"></div>
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Réservation Annulée</span>
            <div className="flex-1 h-1 bg-red-200 rounded-full"></div>
         </div>
      );
    }

    const steps = ['En attente', 'Confirmée', 'Terminée'];
    let currentStepIndex = 1; // Default to Confirmée for "À venir"
    if (status === 'Passée') currentStepIndex = 2; // Terminée

    return (
      <div className="mt-4 flex items-center justify-between relative">
        <div className="absolute top-2.5 left-4 right-4 h-0.5 bg-gray-100 -z-10"></div>
        <div className="absolute top-2.5 left-4 h-0.5 bg-primary -z-10 transition-all duration-500" style={{ width: currentStepIndex === 0 ? '0%' : currentStepIndex === 1 ? '50%' : '100%' }}></div>
        
        {steps.map((step, idx) => {
          const isActive = idx <= currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          
          return (
            <div key={step} className="flex flex-col items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                isActive ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-transparent'
              }`}>
                {isActive && <IconCheck size={12} stroke={3} />}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider ${
                isCurrent ? 'text-primary' : isActive ? 'text-gray-600' : 'text-gray-300'
              }`}>{step}</span>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <ReservationsSkeleton />;
  }


  return (
    <div className="flex-1 space-y-6 pb-12 overflow-y-auto px-6 lg:px-8 py-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl text-primary-dark tracking-tight">Mes Réservations</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Retrouvez l'historique de vos matchs à Dakar.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit">
        {['À venir', 'Passées', 'Annulées'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((res) => (
            <div 
              key={res.id} 
              onClick={() => onSelect(res)}
              className="bg-white rounded-[2rem] overflow-hidden shadow-subtle border border-black/5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col"
            >
              <div className="flex gap-4 p-5">
                <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 relative">
                  <TerrainImage terrainId={res.terrain_id} fallbackUrl={res.terrain_image || res.image || res.image_url} alt={res.terrain} iconSize={20} className="w-full h-full group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-primary-dark/10 group-hover:bg-transparent transition-colors"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(res.status)}`}>
                      {res.status}
                    </span>
                    <p className="text-[10px] font-bold text-gray-300">#{res.id.slice(0, 8)}</p>
                  </div>
                  <h3 className="font-bold text-primary-dark truncate mb-2 text-lg">{res.terrain}</h3>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                      <IconCalendar size={14} className="text-primary" />
                      {res.date_slot ? new Date(res.date_slot).toLocaleDateString('fr-FR') : res.date}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                      <IconClock size={14} className="text-primary" />
                      {res.heure_slot ? res.heure_slot.slice(0, 5) : res.slot}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="px-5 pb-5 mt-auto">
                {renderStepper(res.status)}
              </div>

              <div className="bg-gray-50 px-5 py-4 border-t border-gray-100 flex items-center justify-between group-hover:bg-primary transition-colors">
                <span className="text-sm font-bold text-primary group-hover:text-white transition-colors">{res.amount}</span>
                <div className="flex items-center gap-1 text-primary group-hover:text-white text-xs font-bold uppercase tracking-wider transition-colors">
                  Détails
                  <IconChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
            <IconTicket size={32} />
          </div>
          <h3 className="text-lg font-bold text-primary-dark">Aucune réservation</h3>
          <p className="text-gray-400 text-sm">Vous n'avez aucune réservation dans cet onglet.</p>
        </div>
      )}
    </div>
  );
};
