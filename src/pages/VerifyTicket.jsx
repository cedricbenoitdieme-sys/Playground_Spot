import React, { useState, useEffect } from 'react';
import { 
  IconCheck, 
  IconAlertTriangle, 
  IconX, 
  IconLoader2, 
  IconMapPin, 
  IconCalendar, 
  IconClock, 
  IconUsers, 
  IconWallet
} from '@tabler/icons-react';

const MOCK_TICKETS = {
  'PSPOT-A7X3K2': {
    statut: 'valide',
    joueur: 'Moussa Diallo',
    terrain: 'Terrain Les Champions',
    quartier: 'Almadies',
    date: '15/01/2025',
    creneau: '18h00 – 19h00',
    nbJoueurs: 10,
    montant: '12 500 FCFA',
    scanAt: null
  },
  'PSPOT-B3K9M1': {
    statut: 'utilise',
    joueur: 'Ibrahima Sow',
    terrain: 'Terrain Médina Star',
    quartier: 'Médina',
    date: '15/01/2025',
    creneau: '16h00 – 17h00',
    nbJoueurs: 6,
    montant: '8 000 FCFA',
    scanAt: '15/01/2025 à 15h52'
  },
  'PSPOT-C1X4P8': {
    statut: 'annule',
    joueur: 'Cheikh Ndiaye',
    terrain: 'Terrain Yoff Paradise',
    quartier: 'Yoff',
    date: '15/01/2025',
    creneau: '20h00 – 21h00',
    nbJoueurs: 14,
    montant: '15 000 FCFA',
    scanAt: null
  }
};

export const VerifyTicket = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Simuler un appel API
    const timer = setTimeout(() => {
      const foundTicket = MOCK_TICKETS[token];
      if (foundTicket) {
        setTicket(foundTicket);
      } else {
        setError(true);
      }
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [token]);

  const markAsUsed = () => {
    setTicket(prev => ({
      ...prev,
      statut: 'utilise',
      scanAt: new Date().toLocaleString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', ' à')
    }));
  };

  if (loading) {
    return (
      <div className="h-full bg-background flex flex-col items-center justify-center p-6">
        <IconLoader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-primary-dark font-bold animate-pulse">Vérification en cours...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="h-full bg-gray-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-6">
          <IconX size={40} className="text-gray-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Token invalide</h2>
        <p className="text-gray-500 mb-8 text-sm">Ce ticket n'est pas reconnu par le système PlaygroundSpot.</p>
        <button 
          onClick={() => window.location.href = '/'}
          className="btn-primary w-full max-w-xs h-14"
        >
          Retour à l'accueil
        </button>
      </div>
    );
  }

  const themes = {
    valide: {
      bg: 'bg-[#1A7A4A]',
      icon: <IconCheck size={48} className="text-white" />,
      title: 'Ticket Valide',
      textColor: 'text-white'
    },
    utilise: {
      bg: 'bg-[#F5820D]',
      icon: <IconAlertTriangle size={48} className="text-white" />,
      title: 'Déjà Utilisé',
      textColor: 'text-white'
    },
    annule: {
      bg: 'bg-[#DC2626]',
      icon: <IconX size={48} className="text-white" />,
      title: 'Ticket Annulé',
      textColor: 'text-white'
    }
  };

  const theme = themes[ticket.statut];

  return (
    <div className={`h-full ${theme.bg} flex flex-col p-0 transition-colors duration-500`}>
      {/* Visual Header */}
      <div className="flex flex-col items-center justify-center py-12 px-6">
        <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border border-white/30 animate-in zoom-in duration-500">
          {theme.icon}
        </div>
        <h1 className="text-3xl font-display font-bold text-white mb-2">{theme.title}</h1>
        <p className="text-white/80 font-medium text-sm tracking-widest uppercase">{token}</p>
      </div>

      {/* Ticket Details Card */}
      <div className="flex-1 bg-[#F8F7F2] rounded-t-[3rem] p-8 shadow-2xl relative">
        {/* Ticket Perforation Notch */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 bg-white/20 backdrop-blur-md rounded-full border border-white/30"></div>
        
        <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-700">
          {ticket.statut === 'utilise' && (
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl flex items-start gap-3">
              <IconAlertTriangle className="text-orange-500 shrink-0" size={20} />
              <p className="text-orange-800 text-sm font-medium">
                Ce ticket a déjà été scanné le <span className="font-bold">{ticket.scanAt}</span>.
              </p>
            </div>
          )}

          {ticket.statut === 'annule' && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3">
              <IconX className="text-red-500 shrink-0" size={20} />
              <p className="text-red-800 text-sm font-medium">
                Cette réservation a été annulée par le client ou l'administration.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            <InfoRow icon={IconCheck} label="Joueur" value={ticket.joueur} />
            <InfoRow icon={IconMapPin} label="Terrain" value={`${ticket.terrain} (${ticket.quartier})`} />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={IconCalendar} label="Date" value={ticket.date} />
              <InfoRow icon={IconClock} label="Créneau" value={ticket.creneau} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={IconUsers} label="Joueurs" value={`${ticket.nbJoueurs} Joueurs`} />
              <InfoRow icon={IconWallet} label="Montant" value={ticket.montant} />
            </div>
          </div>

          <div className="pt-8 space-y-4">
            {ticket.statut === 'valide' && (
              <button 
                onClick={markAsUsed}
                className="w-full bg-[#1A7A4A] text-white h-16 rounded-2xl font-bold text-lg shadow-lg shadow-[#1A7A4A]/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <IconCheck size={24} />
                Marquer comme utilisé
              </button>
            )}
            
            <button 
              onClick={() => window.location.href = '/'}
              className="w-full bg-white text-primary-dark border border-gray-200 h-16 rounded-2xl font-bold text-lg active:scale-95 transition-all"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-4">
    <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-primary-dark shrink-0 shadow-sm">
      <Icon size={20} stroke={2} />
    </div>
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-base font-bold text-primary-dark">{value}</p>
    </div>
  </div>
);
