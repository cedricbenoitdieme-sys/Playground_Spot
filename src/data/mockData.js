export const TERRAINS = [
  { 
    id: 1, 
    name: 'Five Dakar Almadies', 
    quartier: 'Almadies',
    price: 15000,
    rating: 4.8,
    reviews: 124,
    surface: 'Synthétique',
    size: '5v5',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800',
    lat: 14.7483,
    lng: -17.5147,
    amenities: ['Vestiaires', 'Éclairage', 'Parking']
  },
  { 
    id: 2, 
    name: 'City Sport Plateau', 
    quartier: 'Plateau',
    price: 12500,
    rating: 4.5,
    reviews: 89,
    surface: 'Béton',
    size: '5v5',
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=800',
    lat: 14.6677,
    lng: -17.4331,
    amenities: ['Éclairage']
  },
  { 
    id: 3, 
    name: 'Parcelles Arena', 
    quartier: 'Parcelles Assainies',
    price: 10000,
    rating: 4.2,
    reviews: 156,
    surface: 'Synthétique',
    size: '7v7',
    image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=800',
    lat: 14.7558,
    lng: -17.4419,
    amenities: ['Parking', 'Tribune']
  },
  { 
    id: 4, 
    name: 'Ouakam Soccer Center', 
    quartier: 'Ouakam',
    price: 18000,
    rating: 4.9,
    reviews: 45,
    surface: 'Synthétique',
    size: '5v5',
    image: 'https://images.unsplash.com/photo-1459196333979-1eb43a0d2030?auto=format&fit=crop&q=80&w=800',
    lat: 14.7194,
    lng: -17.4883,
    amenities: ['Vestiaires', 'Éclairage', 'Garde']
  },
  { 
    id: 5, 
    name: 'Yoff Beach Foot', 
    quartier: 'Yoff',
    price: 8000,
    rating: 4.0,
    reviews: 67,
    surface: 'Sable',
    size: '5v5',
    image: 'https://images.unsplash.com/photo-1562552052-c72ceddf93dc?auto=format&fit=crop&q=80&w=800',
    lat: 14.7614,
    lng: -17.4658,
    amenities: ['Douches']
  },
  { 
    id: 6, 
    name: 'Mermoz Soccer 5', 
    quartier: 'Mermoz',
    price: 15000,
    rating: 4.6,
    reviews: 78,
    surface: 'Synthétique',
    size: '5v5',
    image: 'https://images.unsplash.com/photo-1510566337590-2fc1f21d0faa?auto=format&fit=crop&q=80&w=800',
    lat: 14.7042,
    lng: -17.4764,
    amenities: ['Vestiaires', 'Parking']
  }
];

export const STATS = [
  { label: 'Revenus totaux (Mai)', value: '1 250 000 FCFA', change: '+12.5%', isPositive: true },
  { label: 'Réservations aujourd\'hui', value: '24', change: '+18.2%', isPositive: true },
  { label: 'Terrains actifs', value: '15', change: '+1', isPositive: true },
  { label: 'Utilisateurs inscrits', value: '1 420', change: '-2.4%', isPositive: false },
];

export const OCCUPATION_BY_QUARTIER = [
  { quartier: 'Almadies', percentage: 85 },
  { quartier: 'Plateau', percentage: 72 },
  { quartier: 'Médina', percentage: 65 },
  { quartier: 'Parcelles', percentage: 92 },
  { quartier: 'Yoff', percentage: 58 },
  { quartier: 'Ouakam', percentage: 78 },
];

export const RECENT_RESERVATIONS = [
  { id: 1, terrain: 'Five Dakar Almadies', player: 'Moussa Diop', slot: '15/05/2026 - 18:00', amount: '15 000 FCFA', status: 'Confirmée' },
  { id: 2, terrain: 'City Sport Plateau', player: 'Fatou Sow', slot: '15/05/2026 - 19:00', amount: '12 500 FCFA', status: 'En attente' },
  { id: 3, terrain: 'Parc Hann Foot', player: 'Omar Sy', slot: '15/05/2026 - 20:00', amount: '10 000 FCFA', status: 'Confirmée' },
  { id: 4, terrain: 'Espace Foot Ouakam', player: 'Ibrahim Ndiaye', slot: '16/05/2026 - 08:00', amount: '20 000 FCFA', status: 'Terminée' },
  { id: 5, terrain: 'Terrou Bi Foot', player: 'Awa Fall', slot: '16/05/2026 - 10:00', amount: '25 000 FCFA', status: 'Annulée' },
  { id: 6, terrain: 'Urban Soccer Dakar', player: 'Cheikh Tidiane', slot: '16/05/2026 - 17:00', amount: '15 000 FCFA', status: 'Confirmée' },
  { id: 7, terrain: 'Dakar Arena Pitch', player: 'Mariam Kane', slot: '17/05/2026 - 18:00', amount: '18 000 FCFA', status: 'Confirmée' },
  { id: 8, terrain: 'Goree Foot Center', player: 'Babacar Ba', slot: '17/05/2026 - 19:00', amount: '12 500 FCFA', status: 'En attente' },
  { id: 9, terrain: 'Olympique de Ngor', player: 'Samba Diallo', slot: '18/05/2026 - 21:00', amount: '15 000 FCFA', status: 'Confirmée' },
  { id: 10, terrain: 'Mermoz Soccer 5', player: 'Khady Gning', slot: '18/05/2026 - 22:00', amount: '15 000 FCFA', status: 'Confirmée' },
];

export const TOP_TERRAINS = TERRAINS.slice(0, 3).map(t => ({ ...t, revenue: (t.price * 30).toLocaleString('fr-FR') + ' FCFA', bookings: 30 }));

// ── Gérant Stats ──────────────────────────────────────────────
// KPIs par terrain
export const GERANT_TERRAINS = [
  { id: 'all', label: 'Tous les terrains' },
  { id: '1', label: 'Five Dakar Almadies' },
  { id: '2', label: 'City Sport Plateau' },
  { id: '3', label: 'Parcelles Arena' },
];

export const GERANT_KPIS = {
  all: {
    week:    { revenus: 843750,  reservations: 54,  tauxOccupation: 76, noteMoyenne: 4.7 },
    month:   { revenus: 3375000, reservations: 216, tauxOccupation: 81, noteMoyenne: 4.8 },
    quarter: { revenus: 10125000,reservations: 648, tauxOccupation: 78, noteMoyenne: 4.6 },
  },
  '1': {
    week:    { revenus: 312500,  reservations: 21,  tauxOccupation: 74, noteMoyenne: 4.7 },
    month:   { revenus: 1187500, reservations: 86,  tauxOccupation: 81, noteMoyenne: 4.8 },
    quarter: { revenus: 3562500, reservations: 258, tauxOccupation: 78, noteMoyenne: 4.6 },
  },
  '2': {
    week:    { revenus: 281250,  reservations: 22,  tauxOccupation: 72, noteMoyenne: 4.5 },
    month:   { revenus: 1125000, reservations: 88,  tauxOccupation: 79, noteMoyenne: 4.5 },
    quarter: { revenus: 3375000, reservations: 264, tauxOccupation: 76, noteMoyenne: 4.4 },
  },
  '3': {
    week:    { revenus: 250000,  reservations: 11,  tauxOccupation: 80, noteMoyenne: 4.8 },
    month:   { revenus: 1062500, reservations: 42,  tauxOccupation: 85, noteMoyenne: 4.9 },
    quarter: { revenus: 3187500, reservations: 126, tauxOccupation: 82, noteMoyenne: 4.8 },
  },
};

export const REVENUS_PAR_JOUR = [
  { jour: '12/05', montant: 45000, all: 135000 },
  { jour: '13/05', montant: 62500, all: 187500 },
  { jour: '14/05', montant: 37500, all: 112500 },
  { jour: '15/05', montant: 80000, all: 240000 },
  { jour: '16/05', montant: 55000, all: 165000 },
  { jour: '17/05', montant: 92500, all: 277500 },
  { jour: '18/05', montant: 70000, all: 210000 },
];

export const RESERVATIONS_PAR_CRENEAU = [
  { heure: '08h', nb: 3, reservations: [
    { id: 'R-001', joueur: 'Moussa Diop', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-002', joueur: 'Fatou Sow',   terrain: 'City Plateau',   montant: '12 500 FCFA', statut: 'Terminée' },
    { id: 'R-003', joueur: 'Omar Sy',     terrain: 'Parcelles Arena',montant: '10 000 FCFA', statut: 'Confirmée' },
  ]},
  { heure: '10h', nb: 5, reservations: [
    { id: 'R-011', joueur: 'Awa Fall',      terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-012', joueur: 'Cheikh T.',     terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-013', joueur: 'Babacar Ba',    terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
    { id: 'R-014', joueur: 'Samba Diallo',  terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Annulée' },
    { id: 'R-015', joueur: 'Khady Gning',   terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
  ]},
  { heure: '12h', nb: 4, reservations: [
    { id: 'R-021', joueur: 'Ibrahim N.', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
    { id: 'R-022', joueur: 'Mariam K.',  terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-023', joueur: 'Youssou D.', terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Confirmée' },
    { id: 'R-024', joueur: 'Khadija F.', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'En attente' },
  ]},
  { heure: '14h', nb: 6, reservations: [
    { id: 'R-031', joueur: 'Moussa D.',  terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-032', joueur: 'Awa F.',     terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-033', joueur: 'Saliou N.',  terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Confirmée' },
    { id: 'R-034', joueur: 'Astou D.',   terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
    { id: 'R-035', joueur: 'Modou F.',   terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-036', joueur: 'Bigué T.',   terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Annulée' },
  ]},
  { heure: '16h', nb: 9, reservations: [
    { id: 'R-041', joueur: 'Cheikh T.',  terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-042', joueur: 'Fatou S.',   terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-043', joueur: 'Youssou D.', terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Terminée' },
    { id: 'R-044', joueur: 'Ibou N.',    terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
  ]},
  { heure: '18h', nb: 14, reservations: [
    { id: 'R-051', joueur: 'Moussa D.',  terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-052', joueur: 'Awa F.',     terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-053', joueur: 'Omar S.',    terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Confirmée' },
    { id: 'R-054', joueur: 'Ibrahim N.', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
    { id: 'R-055', joueur: 'Mariam K.',  terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-056', joueur: 'Samba D.',   terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Confirmée' },
  ]},
  { heure: '20h', nb: 12, reservations: [
    { id: 'R-061', joueur: 'Babacar B.', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-062', joueur: 'Khady G.',   terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { id: 'R-063', joueur: 'Moussa D.',  terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Terminée' },
  ]},
  { heure: '22h', nb: 7, reservations: [
    { id: 'R-071', joueur: 'Cheikh T.',  terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { id: 'R-072', joueur: 'Fatou S.',   terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Terminée' },
    { id: 'R-073', joueur: 'Saliou N.',  terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Annulée' },
  ]},
];

export const REPARTITION_PAIEMENT = [
  { label: 'Wave',         value: 48, color: '#2563EB', montant: 1620000, transactions: 41, trend: '+5%' },
  { label: 'Orange Money', value: 32, color: '#F97316', montant: 1080000, transactions: 27, trend: '+2%' },
  { label: 'Sur place',    value: 20, color: '#1A7A4A', montant:  675000, transactions: 17, trend: '-3%' },
];

export const TOP_JOUEURS = [
  { id: 1, nom: 'Moussa Diop',    initiales: 'MD', reservations: 18, montant: 270000, historique: [
    { date: '18/05/2026', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Confirmée' },
    { date: '11/05/2026', terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Terminée' },
    { date: '05/05/2026', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
  ]},
  { id: 2, nom: 'Fatou Sow',      initiales: 'FS', reservations: 14, montant: 175000, historique: [
    { date: '17/05/2026', terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
    { date: '10/05/2026', terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Terminée' },
  ]},
  { id: 3, nom: 'Omar Sy',        initiales: 'OS', reservations: 11, montant: 165000, historique: [
    { date: '15/05/2026', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
    { date: '08/05/2026', terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Terminée' },
  ]},
  { id: 4, nom: 'Awa Fall',       initiales: 'AF', reservations: 9,  montant: 112500, historique: [
    { date: '16/05/2026', terrain: 'Parcelles',     montant: '10 000 FCFA', statut: 'Annulée' },
    { date: '09/05/2026', terrain: 'Five Almadies', montant: '15 000 FCFA', statut: 'Terminée' },
  ]},
  { id: 5, nom: 'Ibrahim Ndiaye', initiales: 'IN', reservations: 7,  montant: 140000, historique: [
    { date: '16/05/2026', terrain: 'Five Almadies', montant: '20 000 FCFA', statut: 'Terminée' },
    { date: '12/05/2026', terrain: 'City Plateau',  montant: '12 500 FCFA', statut: 'Confirmée' },
  ]},
];

// ── Gérants ───────────────────────────────────────────────────
export const GERANTS = [
  { id: 1, nom: 'Ibrahima Diallo',    initiales: 'ID', email: 'ibrahima@playgroundspot.sn', tel: '+221 77 123 45 67', quartier: 'Almadies',            statut: 'actif',      terrains: ['Five Dakar Almadies', 'Mermoz Soccer 5'],   revenus: 1187500, reservations: 86, note: 4.8, dateInscription: '12/01/2026' },
  { id: 2, nom: 'Fatou Ndiaye',       initiales: 'FN', email: 'fatou.ndiaye@gmail.com',    tel: '+221 76 234 56 78', quartier: 'Plateau',              statut: 'actif',      terrains: ['City Sport Plateau'],                       revenus: 1125000, reservations: 88, note: 4.5, dateInscription: '05/02/2026' },
  { id: 3, nom: 'Moustapha Sarr',     initiales: 'MS', email: 'moustapha.sarr@gmail.com',  tel: '+221 70 345 67 89', quartier: 'Parcelles Assainies',  statut: 'suspendu',   terrains: ['Parcelles Arena'],                          revenus: 420000,  reservations: 38, note: 3.9, dateInscription: '20/03/2026' },
  { id: 4, nom: 'Aissatou Ba',        initiales: 'AB', email: 'aissatou.ba@playgroundspot.sn', tel: '+221 77 456 78 90', quartier: 'Ouakam',          statut: 'actif',      terrains: ['Ouakam Soccer Center'],                     revenus: 954000,  reservations: 53, note: 4.9, dateInscription: '14/02/2026' },
  { id: 5, nom: 'Cheikh Tidiane Fall',initiales: 'CF', email: 'cheikh.fall@gmail.com',     tel: '+221 78 567 89 01', quartier: 'Yoff',                 statut: 'en attente', terrains: ['Yoff Beach Foot'],                          revenus: 0,       reservations: 0,  note: null, dateInscription: '10/05/2026' },
];

// ── Utilisateurs ──────────────────────────────────────────────
export const UTILISATEURS = [
  { id: 1,  nom: 'Moussa Diop',      initiales: 'MD', email: 'moussa.diop@gmail.com',    tel: '+221 77 111 22 33', quartier: 'Almadies',           statut: 'actif',    reservations: 18, depenses: 270000, note: 4.8, dateInscription: '15/01/2026', dernierAcces: '18/05/2026',
    historique: [
      { date: '18/05/2026', terrain: 'Five Almadies',  creneau: '18:00', montant: '15 000 FCFA', statut: 'Confirmée' },
      { date: '11/05/2026', terrain: 'City Plateau',   creneau: '20:00', montant: '12 500 FCFA', statut: 'Terminée' },
      { date: '05/05/2026', terrain: 'Five Almadies',  creneau: '19:00', montant: '15 000 FCFA', statut: 'Terminée' },
    ]},
  { id: 2,  nom: 'Fatou Sow',        initiales: 'FS', email: 'fatou.sow@gmail.com',      tel: '+221 76 222 33 44', quartier: 'Plateau',            statut: 'actif',    reservations: 14, depenses: 175000, note: 4.5, dateInscription: '02/02/2026', dernierAcces: '17/05/2026',
    historique: [
      { date: '17/05/2026', terrain: 'City Plateau',   creneau: '18:00', montant: '12 500 FCFA', statut: 'Confirmée' },
      { date: '10/05/2026', terrain: 'Parcelles Arena',creneau: '16:00', montant: '10 000 FCFA', statut: 'Terminée' },
    ]},
  { id: 3,  nom: 'Omar Sy',          initiales: 'OS', email: 'omar.sy@gmail.com',        tel: '+221 70 333 44 55', quartier: 'Médina',             statut: 'actif',    reservations: 11, depenses: 165000, note: 4.6, dateInscription: '20/02/2026', dernierAcces: '15/05/2026',
    historique: [
      { date: '15/05/2026', terrain: 'Five Almadies',  creneau: '20:00', montant: '15 000 FCFA', statut: 'Terminée' },
    ]},
  { id: 4,  nom: 'Awa Fall',         initiales: 'AF', email: 'awa.fall@gmail.com',       tel: '+221 77 444 55 66', quartier: 'Parcelles Assainies',statut: 'suspendu', reservations: 9,  depenses: 112500, note: 3.2, dateInscription: '10/03/2026', dernierAcces: '05/05/2026',
    historique: [
      { date: '05/05/2026', terrain: 'Parcelles Arena',creneau: '08:00', montant: '10 000 FCFA', statut: 'Annulée'  },
    ]},
  { id: 5,  nom: 'Ibrahim Ndiaye',   initiales: 'IN', email: 'ibrahim.ndiaye@gmail.com', tel: '+221 78 555 66 77', quartier: 'Ouakam',             statut: 'actif',    reservations: 7,  depenses: 140000, note: 4.7, dateInscription: '01/04/2026', dernierAcces: '16/05/2026',
    historique: [
      { date: '16/05/2026', terrain: 'Ouakam S.C.',    creneau: '19:00', montant: '18 000 FCFA', statut: 'Terminée' },
    ]},
  { id: 6,  nom: 'Mariam Kane',      initiales: 'MK', email: 'mariam.kane@gmail.com',    tel: '+221 77 666 77 88', quartier: 'Yoff',               statut: 'actif',    reservations: 5,  depenses: 90000,  note: 4.4, dateInscription: '12/04/2026', dernierAcces: '17/05/2026',
    historique: [
      { date: '17/05/2026', terrain: 'Dakar Arena',    creneau: '18:00', montant: '18 000 FCFA', statut: 'Confirmée'},
    ]},
  { id: 7,  nom: 'Babacar Ba',       initiales: 'BB', email: 'babacar.ba@gmail.com',     tel: '+221 76 777 88 99', quartier: 'Mermoz',             statut: 'inactif',  reservations: 2,  depenses: 25000,  note: null, dateInscription: '20/04/2026', dernierAcces: '02/05/2026',
    historique: []},
  { id: 8,  nom: 'Samba Diallo',     initiales: 'SD', email: 'samba.diallo@gmail.com',   tel: '+221 70 888 99 00', quartier: 'Guédiawaye',         statut: 'actif',    reservations: 6,  depenses: 90000,  note: 4.1, dateInscription: '05/05/2026', dernierAcces: '18/05/2026',
    historique: [
      { date: '18/05/2026', terrain: 'Parcelles Arena',creneau: '21:00', montant: '10 000 FCFA', statut: 'Confirmée'},
    ]},
];

export const formatAmountAbbreviated = (num) => {
  if (typeof num !== 'number') {
    const cleanStr = num.toString().replace(/\s/g, '').replace(/[^0-9]/g, '');
    const parsed = parseInt(cleanStr, 10);
    if (isNaN(parsed)) return num;
    num = parsed;
  }
  if (num >= 1000000000) {
    return (num / 1000000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Md';
  }
  if (num >= 1000000) {
    return (num / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  }
  if (num >= 1000) {
    return (num / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' K';
  }
  return num.toLocaleString('fr-FR');
};