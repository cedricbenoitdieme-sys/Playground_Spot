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
import { Telemetrie } from './pages/Telemetrie';

import { AdminLayout } from './pages/admin/AdminLayout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { GerantDashboard } from './pages/GerantDashboard';
import { GerantTerrain } from './pages/GerantTerrain';
import { GerantPlanning } from './pages/GerantPlanning';
import { JoueurHome } from './pages/JoueurHome';
import { JoueurProfile } from './pages/JoueurProfile';
import { JoueurFavoris } from './pages/JoueurFavoris';
import { ScanTicket } from './pages/ScanTicket';
import { GerantTarifs } from './pages/GerantTarifs';
import { GerantVisibilityBoost } from './pages/GerantVisibilityBoost';
import { PaymentSuccess } from './pages/PaymentSuccess';
import { PaymentCancel } from './pages/PaymentCancel';
import { Abonnement } from './pages/Abonnement';
import { TrialBanner } from './components/TrialBanner';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useUser } from './context/UserContext';
import { signOut } from './services/auth';
import { fetchReservations } from './services/reservations';
import { supabase } from './lib/supabase';

import { IconCheck, IconX, IconTrendingUp, IconUsers, IconTrophy, IconUsersGroup, IconSettings, IconChevronRight, IconLogout, IconBallFootball, IconScan, IconLoader2 } from '@tabler/icons-react';

import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  const path = window.location.pathname;
  const isVerify = path.startsWith('/verify/');
  const verifyToken = isVerify ? path.split('/verify/')[1] : null;

  const { currentUser, setCurrentUser, loading: isProfileLoading, displayPlan, setDisplayPlan } = useUser() || { currentUser: null, setCurrentUser: () => {}, loading: true };
  const hasRedirectedRef = useRef(false);
  
  const getInitialView = () => {
    if (window.location.pathname === '/scan-ticket') return 'scan';
    if (window.location.pathname === '/payment/success') return 'payment-success';
    if (window.location.pathname === '/payment/cancel') return 'payment-cancel';
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const validViews = [
      'landing', 'login', 'register',
      'dashboard','reservations','gerants','utilisateurs','parametres','menu', 'telemetrie',
      'gerant-dashboard','gerant-terrain','gerant-planning','gerant-reservations','gerant-stats','gerant-parametres', 'gerant-tarifs', 'gerant-boost',
      'joueur-home','joueur-reservations','joueur-favoris','joueur-profile','tickets',
      'discovery','terrain-detail','booking-flow','reservation-detail', 'scan', 'payment-success', 'payment-cancel'
    ];
    if (viewParam && validViews.includes(viewParam)) return viewParam;
    return 'landing';
  };

  const [view, setView] = useState(getInitialView);
  const [maintenanceActive, setMaintenanceActive] = useState(false);

  // Paywall state machine: 'checking' | 'active' | 'trial' | 'paywall'
  const [subStatus, setSubStatus] = useState('checking');
  const [trialStatus, setTrialStatus] = useState(null);
  const [forceUnlock, setForceUnlock] = useState(false);

  // ── HARD FAILSAFE (CORRECTIF Tâche 5) ──
  // Timeout de 5s qui débloque À LA FOIS isProfileLoading ET subStatus s'il reste sur 'checking'
  useEffect(() => {
    const timer = setTimeout(() => {
      setForceUnlock(true);
      setSubStatus(prev => prev === 'checking' ? 'active' : prev);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // ── State Machine Paywall Abonnement ──
  useEffect(() => {
    // Si pas connecté, rien à vérifier pour le paywall
    if (!currentUser) {
      setSubStatus('active');
      if (setDisplayPlan) setDisplayPlan(null);
      return;
    }

    const checkSubscriptionStatus = async () => {
      // 1. Tâche 1: Branche de sortie JOUEUR -> subStatus = 'active', displayPlan = null
      let role = currentUser.role;
      if (!role) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', currentUser.id)
            .single();
          if (profile?.role) role = profile.role;
        } catch (e) {
          console.warn('[App Paywall] Impossible de charger le rôle DB:', e);
        }
      }

      if (role === 'joueur') {
        setSubStatus('active');
        if (setDisplayPlan) setDisplayPlan('Joueur');
        return;
      }

      // 2a. Bypass ADMIN (super_admin / admin OU email dans ADMIN_EMAILS)
      const isAdminEmail = ADMIN_EMAILS.includes(currentUser.email || '');
      if (role === 'admin' || role === 'super_admin' || isAdminEmail) {
        setSubStatus('active');
        if (setDisplayPlan) setDisplayPlan('Entreprise (Admin)');
        return;
      }

      // 2b. Bypass DEV
      const isDevFake = import.meta.env.DEV && currentUser.id === 'dev-admin-id';
      if (isDevFake) {
        setSubStatus('active');
        if (setDisplayPlan) setDisplayPlan('Dev');
        return;
      }

      // 2c. Essai gratuit via get_trial_status() RPC (si disponible)
      try {
        const { data: trial } = await supabase.rpc('get_trial_status', { p_gerant_id: currentUser.id });
        if (trial?.in_trial || (trial?.has_trial && trial?.status === 'trial' && !trial?.is_expired)) {
          setTrialStatus(trial);
          setSubStatus('trial');
          const daysLeft = trial.jours_restants ?? trial.days_left ?? 0;
          if (setDisplayPlan) setDisplayPlan(`Essai gratuit — ${daysLeft}j restants`);
          return;
        }
      } catch (err) {
        // Si la RPC get_trial_status n'existe pas encore dans ce projet, ignorer élégamment
      }

      // 2d. Abonnement actif via la table subscriptions
      try {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('id, plan_id, status, cycle, date_fin')
          .eq('gerant_id', currentUser.id)
          .eq('status', 'active');

        if (subs && subs.length > 0) {
          const activeSub = subs[0];
          setSubStatus('active');
          const planNames = { free: 'Free', starter: 'Starter', pro: 'Pro', entreprise: 'Entreprise' };
          const planNom = planNames[activeSub.plan_id] || (activeSub.plan_id ? activeSub.plan_id.charAt(0).toUpperCase() + activeSub.plan_id.slice(1) : 'Starter');
          const cycleNom = activeSub.cycle === 'annuel' ? 'Annuel' : activeSub.cycle === 'mensuel' ? 'Mensuel' : null;
          const formattedPlan = cycleNom ? `${planNom} · ${cycleNom}` : planNom;
          if (setDisplayPlan) setDisplayPlan(formattedPlan);
        } else {
          setSubStatus('paywall');
          if (setDisplayPlan) setDisplayPlan(null);
        }
      } catch (err) {
        console.error('[App Paywall] Erreur lors de la vérification des souscriptions:', err);
        setSubStatus('active'); // fallback de sécurité pour ne pas bloquer en cas d'erreur réseau
        if (setDisplayPlan) setDisplayPlan(null);
      }
    };

    checkSubscriptionStatus();
  }, [currentUser, setDisplayPlan]);

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const apiUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
        const res = await fetch(`${apiUrl}/api/settings`);
        if (res.ok) {
          const data = await res.json();
          if (data.modeMaintenance) {
            setMaintenanceActive(true);
          } else {
            setMaintenanceActive(false);
          }
        }
      } catch (err) {
        // Ignore
      }
    };
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 20000);
    return () => clearInterval(interval);
  }, []);

  // ── Synchroniser la vue quand la session est restaurée après un refresh ──
  useEffect(() => {
    const effectiveLoading = isProfileLoading && !forceUnlock;
    if (effectiveLoading) return;
    if (hasRedirectedRef.current) return;
    
    if (currentUser) {
      hasRedirectedRef.current = true;
      const publicViews = ['landing', 'login', 'register'];
      if (publicViews.includes(view)) {
        if (currentUser.role === 'admin') setView('dashboard');
        else if (currentUser.role === 'gerant') setView('gerant-dashboard');
        else setView('joueur-home');
      }
    }
  }, [currentUser, isProfileLoading, forceUnlock, view]);

  const [selectedTerrain, setSelectedTerrain] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [toast, setToast] = useState(null);
  const [ticketsData, setTicketsData] = useState([]);

  // Charge les vrais tickets du joueur connecté
  useEffect(() => {
    if (view !== 'tickets' || !currentUser?.id) return;
    const today = new Date().toISOString().split('T')[0];
    fetchReservations({ joueurId: currentUser.id, statut: 'confirmee' })
      .then(data => {
        setTicketsData(
          data
            .filter(r => r.date_slot >= today)
            .map(r => ({
              id: r.id,
              terrain: r.terrain,
              quartier: r.terrain_detail?.quartier || '',
              date: new Date(r.date_slot).toLocaleDateString('fr-FR'),
              slot: r.heure_slot?.slice(0, 5),
              status: 'À venir',
              amount: r.amount,
              image: r.terrain_detail?.image_url,
              raw: r,
            }))
        );
      })
      .catch(() => setTicketsData([]));
  }, [view, currentUser?.id]);

  const triggerToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDenied = () => {
    if (isProfileLoading && !forceUnlock) return;
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

  const handleLogout = async () => {
    hasRedirectedRef.current = false;
    try { await signOut(); } catch (_) {}
    setCurrentUser(null);
    setSubStatus('active');
    setView('landing');
  };

  if (isVerify) {
    return <VerifyTicket token={verifyToken} />;
  }

  // ── Écran de chargement du profil (avec Failsafe forceUnlock) ──
  const effectiveLoading = isProfileLoading && !forceUnlock;
  if (effectiveLoading) {
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

  // ── 3. Rendu selon subStatus (CHECKING & PAYWALL) ──
  if (currentUser && currentUser.role === 'gerant') {
    if (subStatus === 'checking' && !forceUnlock) {
      return (
        <div className="min-h-screen bg-[#0F2318] flex flex-col justify-center items-center p-6 text-center text-white">
          <IconLoader2 size={40} className="animate-spin text-primary mb-4" />
          <p className="font-bold text-sm uppercase tracking-wider mb-6">Vérification de votre abonnement...</p>
          <button
            onClick={handleLogout}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2"
          >
            <IconLogout size={16} />
            <span>Se déconnecter</span>
          </button>
        </div>
      );
    }

    if (subStatus === 'paywall') {
      return (
        <Abonnement
          onSuccess={(subData) => {
            setSubStatus('active');
            if (subData?.plan_id && setDisplayPlan) {
              const planMap = { free: 'Free', starter: 'Starter', pro: 'Pro', entreprise: 'Entreprise' };
              const planName = planMap[subData.plan_id] || (subData.plan_id.charAt(0).toUpperCase() + subData.plan_id.slice(1));
              const cycleName = subData.cycle === 'annuel' ? 'Annuel' : subData.cycle === 'mensuel' ? 'Mensuel' : null;
              setDisplayPlan(cycleName ? `${planName} · ${cycleName}` : planName);
            }
          }}
          onLogout={handleLogout}
        />
      );
    }
  }

  // ── Écran de maintenance globale ──
  if (maintenanceActive && currentUser?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0F2318] text-white flex flex-col justify-center items-center p-6 text-center relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-primary/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] rounded-full bg-primary/30 blur-[120px] pointer-events-none" />
        
        <div className="max-w-md w-full bg-[#122A1D]/85 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl backdrop-blur-xl space-y-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center border-2 border-primary mx-auto animate-pulse">
            <IconSettings size={40} className="text-primary animate-spin-slow" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display font-bold text-2xl text-white">Maintenance en cours 🛠️</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Nous mettons à jour la plateforme pour vous offrir la meilleure expérience possible sur le terrain.
            </p>
          </div>
          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl text-xs text-gray-500 font-medium">
            Le service sera de retour très bientôt. Merci pour votre patience !
          </div>
          {currentUser && (
            <button 
              onClick={handleLogout}
              className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 rounded-xl transition-all cursor-pointer shadow-glow text-xs uppercase tracking-wider"
            >
              Déconnexion
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout currentView={view} setView={setView}>
      <ErrorBoundary>
        {/* 3. Render TrialBanner if subStatus === 'trial' */}
        {subStatus === 'trial' && (
          <TrialBanner
            trialStatus={trialStatus}
            onTrialExpired={() => setSubStatus('paywall')}
          />
        )}

      {view === 'landing' ? (
        <Landing setView={setView} />
      ) : view === 'login' ? (
        <Login setView={setView} />
      ) : view === 'register' ? (
        <Register setView={setView} />
      ) : view === 'dashboard' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <AdminLayout onExit={() => setView('menu')} />
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
                { id: 'telemetrie', label: 'Télémétrie', sub: 'Activité en temps réel', icon: IconTrendingUp },
                { id: 'scan', label: 'Scanner un Ticket', sub: 'Validation QR Code joueur', icon: IconScan },
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
              onClick={handleLogout}
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
      ) : view === 'telemetrie' ? (
        <ProtectedRoute allowedRoles={['admin']} onDenied={handleDenied}>
          <Telemetrie setView={setView} />
        </ProtectedRoute>
      ) : view === 'gerant-dashboard' ? (
        <ProtectedRoute allowedRoles={['gerant']} onDenied={handleDenied}>
          <Header title="Mon Complexe" setView={setView} />
          <GerantDashboard setView={setView} />
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
      ) : view === 'gerant-tarifs' ? (
        <ProtectedRoute allowedRoles={['gerant', 'admin']} onDenied={handleDenied}>
          <Header title="Abonnement & Tarifs" setView={setView} />
          <GerantTarifs setView={setView} />
        </ProtectedRoute>
      ) : view === 'gerant-boost' ? (
        <ProtectedRoute allowedRoles={['gerant', 'admin']} onDenied={handleDenied}>
          <Header title="Budget Visibilité" setView={setView} />
          <GerantVisibilityBoost setView={setView} />
        </ProtectedRoute>
      ) : view === 'payment-success' ? (
        <ProtectedRoute allowedRoles={['gerant', 'admin', 'joueur']} onDenied={handleDenied}>
          <PaymentSuccess setView={setView} />
        </ProtectedRoute>
      ) : view === 'payment-cancel' ? (
        <ProtectedRoute allowedRoles={['gerant', 'admin', 'joueur']} onDenied={handleDenied}>
          <PaymentCancel setView={setView} />
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
            reservations={ticketsData}
            onViewDetail={(ticket) => {
              setSelectedReservation(ticket.raw || ticket);
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
            setSelectedTerrain={setSelectedTerrain}
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
      ) : view === 'scan' ? (
        <ProtectedRoute allowedRoles={['admin', 'gerant']} onDenied={handleDenied}>
          <Header title="Scanner un Ticket" setView={setView} />
          <ScanTicket onBack={() => setView(currentUser?.role === 'admin' ? 'menu' : 'gerant-dashboard')} />
        </ProtectedRoute>
      ) : null}

      {/* Global Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
      </ErrorBoundary>
    </Layout>
  );
}

export default App;
