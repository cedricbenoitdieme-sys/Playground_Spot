import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Header } from './components/Header';
import { StatsGrid } from './components/StatsGrid';
import { OccupationChart } from './components/OccupationChart';
import { ReservationsTable } from './components/ReservationsTable';
import { TopTerrains } from './components/TopTerrains';
import { Discovery } from './pages/Discovery';
import { TerrainDetail } from './pages/TerrainDetail';
import { BookingFlow } from './components/BookingFlow';
import { MyReservations } from './pages/MyReservations';
import { ReservationDetail } from './pages/ReservationDetail';
import { MyTickets } from './pages/MyTickets';
import { VerifyTicket } from './pages/VerifyTicket';
import { GerantStats } from './pages/GerantStats';
import { Gerants } from './pages/Gerants';
import { Utilisateurs } from './pages/Utilisateurs';
import { Parametres } from './pages/Parametres';

// Import new subviews
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { GerantDashboard } from './pages/GerantDashboard';
import { GerantTerrain } from './pages/GerantTerrain';
import { GerantPlanning } from './pages/GerantPlanning';
import { JoueurHome } from './pages/JoueurHome';
import { JoueurProfile } from './pages/JoueurProfile';
import { JoueurFavoris } from './pages/JoueurFavoris';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useUser } from './context/UserContext';
import { signOut } from './services/auth';

import { IconCheck, IconX, IconTrendingUp, IconUsers, IconTrophy, IconUsersGroup, IconSettings, IconChevronRight, IconLogout, IconBallFootball } from '@tabler/icons-react';

function App() {
  const path = window.location.pathname;
  const isVerify = path.startsWith('/verify/');
  const verifyToken = isVerify ? path.split('/verify/')[1] : null;

  const { currentUser, setCurrentUser, loading } = useUser();
  const hasRedirectedRef = useRef(false);
  
  const getInitialView = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    // Allow deep-linking from landing page (e.g. ?role=joueur&view=discovery)
    const validViews = [
      'landing', 'login', 'register',
      'dashboard','reservations','gerants','utilisateurs','parametres','menu',
      'gerant-dashboard','gerant-terrain','gerant-planning','gerant-reservations','gerant-stats','gerant-parametres',
      'joueur-home','joueur-reservations','joueur-favoris','joueur-profile','tickets',
      'discovery','terrain-detail','booking-flow','reservation-detail'
    ];
    if (viewParam && validViews.includes(viewParam)) return viewParam;
    return 'landing'; // default - will be updated by useEffect after auth loads
  };

  const [view, setView] = useState(getInitialView);

  // ── Synchroniser la vue quand la session est restaurée après un refresh ──
  useEffect(() => {
    if (loading || hasRedirectedRef.current) return;
    if (currentUser) {
      hasRedirectedRef.current = true;
      // Si on est encore sur landing/login/register, rediriger vers le bon dashboard
      const publicViews = ['landing', 'login', 'register'];
      if (publicViews.includes(view)) {
        if (currentUser.role === 'admin') setView('dashboard');
        else if (currentUser.role === 'gerant') setView('gerant-dashboard');
        else setView('joueur-home');
      }
    }
  }, [currentUser, loading]);
  const [selectedTerrain, setSelectedTerrain] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [toast, setToast] = useState(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const triggerToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDenied = () => {
    if (!currentUser) {
      setView('landing');
      triggerToast('Veuillez vous connecter pour accéder à cette page');
      return;
    }
    if (currentUser.role === 'admin') {
      setView('dashboard');
    } else if (currentUser.role === 'gerant') {
      setView('gerant-dashboard');
    } else {
      setView('joueur-home');
    }
    triggerToast('Accès non autorisé');
  };

  if (isVerify) {
    return <VerifyTicket token={verifyToken} />;
  }

  // ── Écran de chargement premium pendant la restauration de session ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F2318] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 animate-pulse">
            <IconBallFootball size={36} className="text-white" />
          </div>
          <div className="absolute -inset-4 rounded-3xl border-2 border-primary/20 animate-ping" style={{ animationDuration: '1.5s' }}></div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-display font-bold text-lg tracking-tight">PlaygroundSpot</p>
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout currentView={view} setView={setView}>
      {view === 'landing' ? (
        <Landing setView={setView} />
      ) : view === 'login' ? (
        <Login setView={setView} />
      ) : view === 'register' ? (
        <Register setView={setView} />
      ) : view === 'dashboard' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <Header title="Tableau de bord Admin" showSearch={true} setView={setView} />

          <div className="flex-1 space-y-6 pb-8 overflow-y-auto overflow-x-hidden px-1">
            {/* Statistics Cards */}
            <StatsGrid />

            <div className="px-6 lg:px-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Terrains Section */}
                <div className="lg:col-span-2 bg-white p-5 rounded-card shadow-subtle border border-black/5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-primary-dark uppercase">Performance des Terrains</h3>
                    <button 
                      onClick={() => setShowAnalysisModal(true)}
                      className="text-[11px] font-bold text-primary hover:underline active:scale-95 transition-transform cursor-pointer"
                    >
                      Analyser tout
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <TopTerrains />
                  </div>
                </div>

                {/* Occupation Chart */}
                <div className="bg-white p-5 rounded-card shadow-subtle border border-black/5">
                  <OccupationChart />
                </div>
              </div>

              {/* Main Table below */}
              <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
                <ReservationsTable />
              </div>
            </div>
          </div>
        </ProtectedRoute>
      ) : view === 'reservations' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <Header title="Toutes les réservations" showSearch={true} setView={setView} />
          <MyReservations onSelect={(res) => {
            setSelectedReservation(res);
            setView('reservation-detail');
          }} />
        </ProtectedRoute>
      ) : view === 'gerants' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <Header title="Gestion des Gérants" setView={setView} />
          <Gerants />
        </ProtectedRoute>
      ) : view === 'utilisateurs' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <Header title="Gestion des Joueurs" setView={setView} />
          <Utilisateurs />
        </ProtectedRoute>
      ) : view === 'parametres' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <Header title="Paramètres Plateforme" setView={setView} />
          <Parametres setView={setView} />
        </ProtectedRoute>
      ) : view === 'menu' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <div className="flex-1 overflow-y-auto px-5 py-6 bg-background space-y-6 pb-28">
            <div className="flex items-center gap-4 bg-white p-5 rounded-[20px] shadow-subtle border border-black/5"
              style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}>
              <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center text-xl font-black shadow-lg shadow-primary/20">
                {currentUser?.avatar}
              </div>
              <div>
                <p className="font-bold text-primary-dark text-lg">{currentUser?.nom}</p>
                <span className="text-[10px] font-bold text-primary bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20 uppercase tracking-wider">Super Administrateur</span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1"
                style={{ animation: 'slideUp 0.4s 0.05s cubic-bezier(.22,1,.36,1) both' }}>Navigation Administration</p>
              {[
                { id: 'gerants', label: 'Gérants', sub: 'CRUD, suspensions, approbation', icon: IconUsersGroup },
                { id: 'utilisateurs', label: 'Utilisateurs', sub: 'Liste joueurs, historique, blocage', icon: IconUsers },
                { id: 'parametres', label: 'Paramètres', sub: 'Sécurité, commission, notifications', icon: IconSettings },
              ].map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-black/5 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 text-left cursor-pointer"
                  style={{ 
                    animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                    animationDelay: `${index * 0.08 + 0.1}s`
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <item.icon size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-primary-dark text-sm">{item.label}</p>
                      <p className="text-[11px] text-gray-400 font-medium">{item.sub}</p>
                    </div>
                  </div>
                  <IconChevronRight size={18} className="text-gray-300" />
                </button>
              ))}
            </div>

            <button
              onClick={async () => {
                triggerToast('Déconnexion…');
                hasRedirectedRef.current = false;
                try { await signOut(); } catch (_) {}
                setCurrentUser(null);
                setView('landing');
              }}
              className="w-full flex items-center justify-center gap-3 py-4 bg-red-50 text-red-600 font-bold rounded-2xl border border-red-100 hover:bg-red-100 active:scale-[0.98] transition-all min-h-[56px] cursor-pointer"
              style={{ 
                animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                animationDelay: '0.35s'
              }}
            >
              <IconLogout size={20} /> Se déconnecter
            </button>
          </div>
        </ProtectedRoute>
      ) : view === 'gerant-dashboard' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Mon Complexe" setView={setView} />
          <GerantDashboard />
        </ProtectedRoute>
      ) : view === 'gerant-terrain' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Mon Terrain" setView={setView} />
          <GerantTerrain />
        </ProtectedRoute>
      ) : view === 'gerant-planning' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Planning" setView={setView} />
          <GerantPlanning />
        </ProtectedRoute>
      ) : view === 'gerant-reservations' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Réservations Complex" setView={setView} />
          <div className="flex-1 overflow-y-auto px-6 py-6 pb-28">
            <ReservationsTable />
          </div>
        </ProtectedRoute>
      ) : view === 'gerant-stats' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Analyses & Stats" setView={setView} />
          <GerantStats />
        </ProtectedRoute>
      ) : view === 'gerant-parametres' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Paramètres Gérant" setView={setView} />
          <Parametres setView={setView} />
        </ProtectedRoute>
      ) : view === 'joueur-home' ? (
        <ProtectedRoute allowedRoles={['joueur']} onDenied={handleDenied}>
          <Header title="Accueil Joueur" setView={setView} />
          <JoueurHome setView={setView} setSelectedTerrain={setSelectedTerrain} />
        </ProtectedRoute>
      ) : view === 'joueur-reservations' ? (
        <ProtectedRoute allowedRoles={['joueur']} onDenied={handleDenied}>
          <Header title="Mes Réservations" setView={setView} />
          <MyReservations onSelect={(res) => {
            setSelectedReservation(res);
            setView('reservation-detail');
          }} />
        </ProtectedRoute>
      ) : view === 'joueur-favoris' ? (
        <ProtectedRoute allowedRoles={['joueur']} onDenied={handleDenied}>
          <Header title="Terrains Favoris" setView={setView} />
          <JoueurFavoris setView={setView} setSelectedTerrain={setSelectedTerrain} />
        </ProtectedRoute>
      ) : view === 'joueur-profile' ? (
        <ProtectedRoute allowedRoles={['joueur']} onDenied={handleDenied}>
          <Header title="Mon Profil Joueur" setView={setView} />
          <JoueurProfile />
        </ProtectedRoute>
      ) : view === 'tickets' ? (
        <ProtectedRoute allowedRoles={['joueur']} onDenied={handleDenied}>
          <MyTickets
            reservations={[
              { id: 'PS-88291', terrain: 'City Foot Almadies', quartier: 'Almadies', date: '22/05/2026', slot: '18:00', status: 'À venir', amount: '15.000 FCFA', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800' },
              { id: 'PS-44210', terrain: 'Dakar Arena Pitch', quartier: 'Plateau', date: '25/05/2026', slot: '20:00', status: 'À venir', amount: '20.000 FCFA', image: 'https://images.unsplash.com/photo-1529900948638-02f04dc5b4e0?auto=format&fit=crop&q=80&w=800' }
            ]}
            onViewDetail={(ticket) => {
              setSelectedReservation(ticket);
              setView('reservation-detail');
            }}
          />
        </ProtectedRoute>
      ) : view === 'discovery' ? (
        <ProtectedRoute allowedRoles={['admin', 'joueur']} onDenied={handleDenied}>
          <Discovery setView={setView} setSelectedTerrain={setSelectedTerrain} />
        </ProtectedRoute>
      ) : view === 'terrain-detail' ? (
        <ProtectedRoute allowedRoles={['admin', 'joueur']} onDenied={handleDenied}>
          <TerrainDetail
            terrain={selectedTerrain}
            onBack={() => setView('discovery')}
            onBook={() => setView('booking-flow')}
          />
        </ProtectedRoute>
      ) : view === 'booking-flow' ? (
        <ProtectedRoute allowedRoles={['admin', 'joueur']} onDenied={handleDenied}>
          <BookingFlow
            terrain={selectedTerrain}
            onBack={() => setView('terrain-detail')}
            onComplete={() => {
              triggerToast('Réservation effectuée avec succès !');
              setView(currentUser?.role === 'admin' ? 'reservations' : 'joueur-reservations');
            }}
          />
        </ProtectedRoute>
      ) : view === 'reservation-detail' ? (
        <ProtectedRoute allowedRoles={['admin', 'joueur', 'gerant']} onDenied={handleDenied}>
          <ReservationDetail
            reservation={selectedReservation}
            onBack={() => setView(currentUser?.role === 'admin' ? 'reservations' : currentUser?.role === 'gerant' ? 'gerant-reservations' : 'joueur-reservations')}
            onCancel={(id) => {
              triggerToast(`Réservation ${id} annulée avec succès.`);
              setView(currentUser?.role === 'admin' ? 'reservations' : currentUser?.role === 'gerant' ? 'gerant-reservations' : 'joueur-reservations');
            }}
          />
        </ProtectedRoute>
      ) : null}

      {/* Analysis Modal for "Analyser tout" */}
      {showAnalysisModal && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setShowAnalysisModal(false)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-lg mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300 no-scrollbar">
            <button onClick={() => setShowAnalysisModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 rounded-full cursor-pointer">
              <IconX size={20} />
            </button>
            <div className="mb-6 pr-10 min-w-0">
              <h3 className="text-2xl font-display font-bold text-primary-dark tracking-tight mb-1 truncate whitespace-normal break-words">Rapport Global de Performance</h3>
              <p className="text-sm text-gray-500 font-medium">Statistiques complètes de tous les terrains.</p>
            </div>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 no-scrollbar">
              {TOP_TERRAINS.map((terrain) => (
                <div key={terrain.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <img src={terrain.image} alt={terrain.name} className="w-10 h-10 rounded-xl object-cover" />
                    <div>
                      <h4 className="font-bold text-sm text-primary-dark">{terrain.name}</h4>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">{terrain.bookings} réservations</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{terrain.revenue}</p>
                    <span className="text-[10px] text-green-500 bg-green-50 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                      <IconTrendingUp size={10} /> +12%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-3">
              <button onClick={() => setShowAnalysisModal(false)} className="w-full btn-primary h-12">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </Layout>
  );
}

export default App;
