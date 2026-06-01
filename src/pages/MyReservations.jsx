import React, { useState } from 'react';
import { 
  IconCalendar, 
  IconMapPin, 
  IconClock, 
  IconChevronRight, 
  IconTicket,
  IconDotsVertical,
  IconCheck
} from '@tabler/icons-react';

const MOCK_USER_RESERVATIONS = [
  {
    id: 'PS-88234',
    terrain: 'Five Dakar Almadies',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=400',
    date: '20/05/2026',
    slot: '18:00 - 19:00',
    amount: '15 000 FCFA',
    status: 'À venir',
    statusColor: 'bg-primary/10 text-primary border-primary/20'
  },
  {
    id: 'PS-77123',
    terrain: 'City Sport Plateau',
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=400',
    date: '12/05/2026',
    slot: '19:00 - 20:00',
    amount: '12 500 FCFA',
    status: 'Passée',
    statusColor: 'bg-gray-100 text-gray-500 border-gray-200'
  },
  {
    id: 'PS-66456',
    terrain: 'Parcelles Arena',
    image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=400',
    date: '05/05/2026',
    slot: '20:00 - 21:00',
    amount: '10 000 FCFA',
    status: 'Annulée',
    statusColor: 'bg-red-50 text-red-500 border-red-100'
  }
];

export const MyReservations = ({ onSelect }) => {
  const [activeTab, setActiveTab] = useState('À venir');

  const filtered = MOCK_USER_RESERVATIONS.filter(res => {
    if (activeTab === 'À venir') return res.status === 'À venir';
    if (activeTab === 'Passées') return res.status === 'Passée';
    if (activeTab === 'Annulées') return res.status === 'Annulée';
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
                  <img src={res.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={res.terrain} />
                  <div className="absolute inset-0 bg-primary-dark/10 group-hover:bg-transparent transition-colors"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${res.statusColor}`}>
                      {res.status}
                    </span>
                    <p className="text-[10px] font-bold text-gray-300">#{res.id}</p>
                  </div>
                  <h3 className="font-bold text-primary-dark truncate mb-2 text-lg">{res.terrain}</h3>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                      <IconCalendar size={14} className="text-primary" />
                      {res.date}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                      <IconClock size={14} className="text-primary" />
                      {res.slot}
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
