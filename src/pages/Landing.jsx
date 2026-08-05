import React, { useState, useEffect } from 'react';
import { CustomSelect } from '../components/CustomSelect';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { getTerrainPrincipalPhotoUrl } from '../services/terrains';
import { TerrainImage } from '../components/TerrainImage';
import { 
  IconBallFootball, 
  IconCheck, 
  IconX, 
  IconTrendingUp, 
  IconUsers, 
  IconUsersGroup, 
  IconSettings, 
  IconChevronRight, 
  IconLogout, 
  IconMenu2, 
  IconMapPin, 
  IconStar, 
  IconCreditCard, 
  IconQrcode, 
  IconChartBar, 
  IconMessageCircle, 
  IconShield,
  IconLock,
  IconMail,
  IconPhone,
  IconBuildingStore
} from '@tabler/icons-react';
import waveLogo from '../assets/wave.png';
import omLogo from '../assets/orange_money.png';

// Scroll-triggered butter-smooth CountUp component using requestAnimationFrame and IntersectionObserver
const CountUp = ({ end, duration = 1500, suffix = "" }) => {
  const [count, setCount] = useState(0);
  const elementRef = React.useRef(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const currentRef = elementRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (observer && currentRef) {
        observer.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (!hasStarted) return;

    let startTime = null;
    let animationFrameId = null;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const progressRatio = Math.min(progress / duration, 1);
      
      // Ease out cubic
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const currentCount = Math.floor(easeOutCubic(progressRatio) * end);
      
      setCount(currentCount);

      if (progressRatio < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [hasStarted, end, duration]);

  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  return <span ref={elementRef}>{formatNumber(count)}{suffix}</span>;
};

const CTA_ROTATING_PHRASES = [
  'en 30 secondes',
  "sans passer d'appel",
  'où que tu sois',
  'en un clic',
  'à toute heure',
];

export const Landing = ({ setView }) => {
  const { currentUser, setCurrentUser } = useUser();
  const [activeTab, setActiveTab] = useState('joueur');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'cgu', 'privacy', 'gerant'
  const [gerantFormSubmitted, setGerantFormSubmitted] = useState(false);
  const [gerantFormLoading, setGerantFormLoading] = useState(false);
  const [ctaPhraseIndex, setCtaPhraseIndex] = useState(0);
  const [ctaPhraseVisible, setCtaPhraseVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCtaPhraseVisible(false);
      setTimeout(() => {
        setCtaPhraseIndex(prev => (prev + 1) % CTA_ROTATING_PHRASES.length);
        setCtaPhraseVisible(true);
      }, 350);
    }, 3400);
    return () => clearInterval(interval);
  }, []);
  const [scrolled, setScrolled] = useState(false);

  // Form State
  const [gerantName, setGerantName] = useState('');
  const [gerantPhone, setGerantPhone] = useState('');
  const [gerantComplex, setGerantComplex] = useState('');
  const [gerantQuartier, setGerantQuartier] = useState('');
  const [gerantTerrains, setGerantTerrains] = useState('1');

  // Simulator State (AHA Moment & Investment Bias)
  const [simStep, setSimStep] = useState(1); // 1: quartier, 2: slot, 3: captain_name, 4: ticket
  const [simQuartier, setSimQuartier] = useState('Almadies');
  const [simSlot, setSimSlot] = useState('18:00');
  const [simName, setSimName] = useState('');

  // Popular Terrains State from Supabase RPC
  const [popularTerrains, setPopularTerrains] = useState([]);
  const [loadingTerrains, setLoadingTerrains] = useState(true);

  // Platform Stats Cache & Settings State
  const [platformStats, setPlatformStats] = useState(null);
  const [ribbonVisible, setRibbonVisible] = useState(true);

  useEffect(() => {
    const fetchPlatformData = async () => {
      try {
        const { data: statsData } = await supabase
          .from('stats_plateforme_cache')
          .select('*')
          .eq('id', true)
          .maybeSingle();

        if (statsData) {
          setPlatformStats(statsData);
        }

        const { data: settingData } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'landing_stats_ribbon_visible')
          .maybeSingle();

        if (settingData?.value !== undefined) {
          setRibbonVisible(!!settingData.value);
        }
      } catch (err) {
        console.warn('Stats plateforme ou réglages indisponibles:', err);
      }
    };

    fetchPlatformData();
  }, []);

  useEffect(() => {
    const fetchPopular = async () => {
      try {
        const { data, error } = await supabase.rpc('get_terrains_populaires', { p_limit: 6 });
        if (error) throw error;

        if (data && data.length > 0) {
          const terrainsWithPhotos = await Promise.all(
            data.map(async (t) => {
              const photoUrl = await getTerrainPrincipalPhotoUrl(t.id);
              return {
                ...t,
                principalPhotoUrl: photoUrl
              };
            })
          );
          setPopularTerrains(terrainsWithPhotos);
        } else {
          setPopularTerrains([]);
        }
      } catch (err) {
        console.error('Erreur chargement terrains populaires:', err);
        setPopularTerrains([]);
      } finally {
        setLoadingTerrains(false);
      }
    };

    fetchPopular();
  }, []);

  // Scroll effect for Navbar (support à la fois window et conteneur de scroll parent)
  useEffect(() => {
    const handleScroll = (e) => {
      const scrollY = e?.target?.scrollTop !== undefined ? e.target.scrollTop : window.scrollY;
      if (scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const handleGoToApp = (role, targetView) => {
    if (currentUser) {
      setView(targetView || (['admin', 'super_admin'].includes(currentUser.role) ? 'dashboard' : currentUser.role === 'gerant' ? 'gerant-dashboard' : 'joueur-home'));
      return;
    }
    // En production, on redirige vers la page de connexion
    setView('login');
  };

  const handleGerantFormSubmit = (e) => {
    e.preventDefault();
    setGerantFormLoading(true);
    setTimeout(() => {
      setGerantFormLoading(false);
      setGerantFormSubmitted(true);
      // Reset form
      setGerantName('');
      setGerantPhone('');
      setGerantComplex('');
      setGerantQuartier('');
      setGerantTerrains('1');
    }, 1500);
  };

  return (
    <div className="bg-[#FAFAFA] text-gray-800 font-sans min-h-screen relative overflow-x-hidden selection:bg-primary selection:text-white">
      {/* Navbar */}
      <nav className={`fixed top-4 left-4 right-4 md:left-8 md:right-8 z-50 rounded-3xl px-6 py-4 flex items-center justify-between shadow-subtle transition-all duration-300 ${
        scrolled ? 'shadow-lg bg-white/95 backdrop-blur-md border border-black/5' : 'bg-white/70 backdrop-blur-md border border-white/30'
      }`} id="navbar">
        <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-2 cursor-pointer group">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white group-hover:scale-105 transition-transform">
            <IconBallFootball size={24} />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-[#0F2318]">
            Playground<span className="text-primary">Spot</span>
          </span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold">
          <a href="#features" className="text-gray-600 hover:text-primary transition-all duration-200 border-b-2 border-transparent pb-1">Fonctionnalités</a>
          <a href="#how-it-works" className="text-gray-600 hover:text-primary transition-all duration-200 border-b-2 border-transparent pb-1">Comment ça marche</a>
          <a href="#terrains" className="text-gray-600 hover:text-primary transition-all duration-200 border-b-2 border-transparent pb-1">Terrains</a>
        </div>
        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="hidden sm:flex items-center gap-3">
              <button 
                onClick={() => handleGoToApp(currentUser.role)} 
                className="bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-glow cursor-pointer"
              >
                SaaS Dashboard ⚽
              </button>
              <button 
                onClick={() => { setCurrentUser(null); setView('landing'); }} 
                className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors px-3 py-2 cursor-pointer border border-red-500/20 bg-red-500/5 rounded-xl"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={() => setView('login')} 
                className="hidden sm:block text-sm font-bold text-[#0F2318] hover:text-primary transition-colors px-4 py-2 cursor-pointer"
              >
                Connexion
              </button>
              <button 
                onClick={() => handleGoToApp('joueur', 'discovery')} 
                className="hidden sm:block bg-primary text-white text-sm font-bold px-6 py-3 rounded-xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-glow cursor-pointer"
              >
                Réserver
              </button>
            </>
          )}
          {/* Mobile Hamburger Menu */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="md:hidden text-[#0F2318] p-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            <IconMenu2 size={24} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="fixed top-24 left-4 right-4 bg-white rounded-3xl shadow-2xl z-40 p-6 flex flex-col gap-4 border border-gray-100 origin-top transform transition-all duration-200 animate-in slide-in-from-top-5 duration-300">
          <a href="#features" className="text-lg font-bold text-[#0F2318] p-2 border-b border-gray-50 transition-colors" onClick={() => setMobileMenuOpen(false)}>Fonctionnalités</a>
          <a href="#how-it-works" className="text-lg font-bold text-[#0F2318] p-2 border-b border-gray-50 transition-colors" onClick={() => setMobileMenuOpen(false)}>Comment ça marche</a>
          <a href="#terrains" className="text-lg font-bold text-[#0F2318] p-2 border-b border-gray-50 transition-colors" onClick={() => setMobileMenuOpen(false)}>Terrains</a>
          {currentUser ? (
            <>
              <button 
                onClick={() => { setMobileMenuOpen(false); handleGoToApp(currentUser.role); }} 
                className="text-left text-lg font-bold text-primary p-2 border-b border-gray-50 w-full"
              >
                SaaS Dashboard ⚽
              </button>
              <button 
                onClick={() => { setMobileMenuOpen(false); setCurrentUser(null); setView('landing'); }} 
                className="text-left text-lg font-bold text-red-500 p-2 border-b border-gray-50 w-full"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => { setMobileMenuOpen(false); setView('login'); }} 
                className="text-left text-lg font-bold text-[#0F2318] p-2 border-b border-gray-50 w-full"
              >
                Connexion
              </button>
              <button 
                onClick={() => { setMobileMenuOpen(false); handleGoToApp('joueur', 'discovery'); }} 
                className="bg-primary text-white text-center font-bold px-6 py-4 mt-2 rounded-xl w-full hover:bg-primary-dark transition-colors active:scale-[0.98]"
              >
                Réserver un terrain
              </button>
            </>
          )}
        </div>
      )}

      {/* Custom Premium CSS Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUpSlow {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpMedium {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpFast {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpExtraSlow {
          from { opacity: 0; transform: translateY(48px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes floatPhone {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-12px) scale(1.015); }
        }
        @keyframes ctaWordCycleIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ctaWordCycleOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-10px); }
        }
        .animate-cta-word-in {
          animation: ctaWordCycleIn 0.6s cubic-bezier(.22,1,.36,1) both;
        }
        .animate-cta-word-out {
          animation: ctaWordCycleOut 0.35s cubic-bezier(.4,0,1,1) both;
        }
        .animate-slide-up-slow {
          animation: slideUpSlow 0.9s cubic-bezier(.22,1,.36,1) both;
        }
        .animate-slide-up-medium {
          animation: slideUpMedium 0.9s cubic-bezier(.22,1,.36,1) both;
          animation-delay: 0.15s;
        }
        .animate-slide-up-fast {
          animation: slideUpFast 0.9s cubic-bezier(.22,1,.36,1) both;
          animation-delay: 0.3s;
        }
        .animate-slide-up-extra-slow {
          animation: slideUpExtraSlow 1.1s cubic-bezier(.22,1,.36,1) both;
          animation-delay: 0.45s;
        }
        .animate-float-slow {
          animation: floatSlow 4s ease-in-out infinite;
        }
        .animate-float-phone {
          animation: floatPhone 6s ease-in-out infinite;
        }
        .shadow-glow-emerald:hover {
          box-shadow: 0 25px 60px -5px rgba(26, 122, 74, 0.45);
        }
      `}} />

      {/* HERO SECTION */}
      <section className="relative bg-[#0F2318] text-white pt-40 pb-24 lg:pt-48 lg:pb-32 px-4 overflow-hidden min-h-[90vh] flex flex-col justify-center items-center">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1543351611-58f69d7c1781?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80" 
            alt="Football match background" 
            className="w-full h-full object-cover object-bottom opacity-40 mix-blend-luminosity grayscale-[0.2]" 
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0F2318]/95 via-[#0F2318]/70 to-[#0F2318]"></div>
        </div>

        {/* Ambient Glow Elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] pointer-events-none z-0"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#E8DCC8]/10 rounded-full blur-[80px] pointer-events-none z-0"></div>

        <div className="max-w-3xl mx-auto relative z-10 flex flex-col items-center justify-center text-center gap-8 w-full pt-10 md:pt-0">
          
          <div className="space-y-5 flex flex-col items-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#E8DCC8] backdrop-blur-sm shadow-sm animate-float-slow justify-center mx-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10B981]"></span>
              Dakar, Sénégal
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold leading-[1.15] tracking-tight drop-shadow-md animate-slide-up-slow text-center mx-auto max-w-2xl">
              Réserve ton terrain{' '}
              <span
                key={ctaPhraseIndex}
                className={`text-[#E8F5E9] drop-shadow-lg text-primary-light bg-gradient-to-r from-emerald-400 to-[#E8DCC8] bg-clip-text text-transparent inline-block ${ctaPhraseVisible ? 'animate-cta-word-in' : 'animate-cta-word-out'}`}
              >
                {CTA_ROTATING_PHRASES[ctaPhraseIndex]}
              </span>
            </h1>
            
            <p className="text-gray-300 text-sm sm:text-base md:text-lg max-w-xl drop-shadow animate-slide-up-medium leading-relaxed text-center mx-auto">
              Trouve un terrain de foot près de chez toi, réserve ton créneau instantanément et paie via Wave ou Orange Money. Le foot sans prise de tête.
            </p>
            


            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center w-full max-w-sm pt-2 animate-slide-up-fast mx-auto">
              <button 
                onClick={() => handleGoToApp('joueur', 'discovery')} 
                className="w-full sm:w-auto bg-primary text-white font-bold text-base px-8 py-4 min-h-[48px] rounded-2xl flex items-center justify-center gap-3 shadow-glow hover:-translate-y-1 hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer hover:bg-emerald-600"
              >
                <IconMapPin size={22} />
                Trouver un terrain
              </button>
              <button 
                onClick={() => { setActiveModal('gerant'); setGerantFormSubmitted(false); }} 
                className="w-full sm:w-auto bg-transparent border-2 border-[#E8DCC8] text-[#E8DCC8] hover:bg-[#E8DCC8]/10 font-bold text-base px-8 py-4 min-h-[48px] rounded-2xl flex items-center justify-center transition-all active:scale-[0.98] cursor-pointer hover:border-white hover:text-white"
              >
                Inscrire mon terrain
              </button>
            </div>
          </div>

          {/* Real-time Dynamic Stats Ribbon */}
          {ribbonVisible && (
            <div className="w-full max-w-xl bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 backdrop-blur-md shadow-subtle flex flex-wrap gap-4 justify-around items-center mt-2 animate-slide-up-medium mx-auto">
              <div className="text-center group cursor-default">
                <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-display drop-shadow group-hover:scale-105 transition-transform duration-300">
                  <CountUp end={platformStats?.nombre_joueurs ?? 1} suffix="+" />
                </p>
                <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">Joueurs Dakarois</span>
              </div>
              <div className="w-px h-8 bg-white/10 hidden sm:block"></div>
              <div className="text-center group cursor-default">
                <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-display drop-shadow group-hover:scale-105 transition-transform duration-300">
                  <CountUp end={platformStats?.nombre_terrains ?? 1} suffix={platformStats?.nombre_terrains > 0 ? "" : "+"} />
                </p>
                <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">Terrains Homologués</span>
              </div>
              <div className="w-px h-8 bg-white/10 hidden sm:block"></div>
              <div className="text-center group cursor-default">
                {platformStats?.taux_satisfaction != null ? (
                  <p className="text-2xl sm:text-3xl font-black text-[#E8DCC8] font-display drop-shadow group-hover:scale-105 transition-transform duration-300">
                    <CountUp end={platformStats.taux_satisfaction} suffix="%" />
                  </p>
                ) : (
                  <p className="text-xl sm:text-2xl font-black text-[#E8DCC8] font-display drop-shadow group-hover:scale-105 transition-transform duration-300 pt-1">
                    Nouveau ! ⭐
                  </p>
                )}
                <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">Taux de Satisfaction</span>
              </div>
            </div>
          )}

          {/* Dakar Interactive Booking Simulator (AHA Moment & Investment Bias) */}
          <div className={`relative w-full max-w-sm mx-auto ${ribbonVisible ? 'mt-8' : 'mt-4'} animate-slide-up-extra-slow`}>
            {/* Decorative blur behind */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/20 blur-[80px] rounded-full pointer-events-none"></div>
            
            {/* Phone Container */}
            <div className="relative z-20 bg-[#0A1810] border-4 border-[#2A3F32] rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-500 flex flex-col mx-auto max-w-[280px] h-[520px] shadow-glow-emerald text-left">
              {/* Dynamic Status / Progress Bar */}
              <div className="px-6 pt-8 pb-3 bg-black/40 flex justify-between items-center text-white/50 text-[10px] font-bold uppercase tracking-widest border-b border-white/5 shrink-0 pointer-events-none">
                <span>Simulateur Dakar</span>
                <span className="text-primary font-black">Étape {simStep}/4</span>
              </div>

              {/* Screen Body */}
              <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto no-scrollbar bg-[#0f2318]/90">
                {simStep === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[#E8DCC8] font-display font-bold text-xs mb-1">Étape 1 : Choisissez votre quartier</h4>
                      <p className="text-[10px] text-gray-400">Où souhaitez-vous réserver aujourd'hui ?</p>
                    </div>
                    <div className="space-y-2 my-auto">
                      {['Almadies', 'Mermoz', 'Plateau'].map(q => (
                        <button 
                          key={q}
                          onClick={() => { setSimQuartier(q); setSimStep(2); }}
                          className="w-full bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary text-white text-[11px] font-bold py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-between"
                        >
                          <span>{q}</span>
                          <span className="text-[9px] text-primary">Sélectionner →</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-gray-500 text-center italic">Plus de 55 terrains homologués à Dakar.</p>
                  </div>
                )}

                {simStep === 2 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[#E8DCC8] font-display font-bold text-xs mb-1">Étape 2 : Choisissez votre créneau</h4>
                      <p className="text-[10px] text-gray-400">Créneaux disponibles aujourd'hui.</p>
                    </div>
                    <div className="space-y-2 my-auto">
                      {['18:00', '20:00', '22:00'].map(t => (
                        <button 
                          key={t}
                          onClick={() => { setSimSlot(t); setSimStep(3); }}
                          className="w-full bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary text-white text-[11px] font-bold py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-between"
                        >
                          <span>{t}</span>
                          <span className="text-[9px] text-primary">Dispo ✓</span>
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => setSimStep(1)}
                      className="text-[9px] text-gray-400 hover:text-white transition-colors cursor-pointer text-center block mt-2"
                    >
                      ← Retour au quartier
                    </button>
                  </div>
                )}

                {simStep === 3 && (
                  <form 
                    onSubmit={(e) => { e.preventDefault(); if (simName.trim()) setSimStep(4); }}
                    className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300 flex-1 flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="text-[#E8DCC8] font-display font-bold text-xs mb-1">Étape 3 : Qui mène l'équipe ?</h4>
                      <p className="text-[10px] text-gray-400">Entrez votre nom complet pour personnaliser votre ticket.</p>
                    </div>
                    <div className="my-auto space-y-3">
                      <input 
                        type="text" 
                        required
                        value={simName}
                        onChange={(e) => setSimName(e.target.value)}
                        placeholder="Prénom Nom"
                        className="w-full bg-[#0A1810]/80 border border-white/10 focus:border-primary rounded-xl px-4 py-3 text-[11px] text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <button 
                        type="submit"
                        className="w-full btn-primary py-3 rounded-xl font-bold text-xs cursor-pointer shadow-glow"
                      >
                        Générer mon ticket ⚡
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSimStep(2)}
                        className="w-full text-center text-[9px] text-gray-400 hover:text-white transition-colors cursor-pointer"
                      >
                        ← Retour à l'heure
                      </button>
                    </div>
                  </form>
                )}

                {simStep === 4 && (
                  <div className="space-y-4 animate-in zoom-in-95 duration-300 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="px-2 py-0.5 bg-secondary text-white text-[8px] font-bold uppercase tracking-widest rounded-full">Prêt</span>
                      <h4 className="text-[#E8DCC8] font-display font-bold text-xs mt-2">Votre Ticket de Capitaine ! 🏆</h4>
                    </div>
                    
                    {/* Ticket visual */}
                    <div className="bg-white p-4 rounded-2xl text-gray-800 space-y-3 shadow-lg relative border-l-4 border-primary">
                      <div className="border-b border-gray-100 pb-2">
                        <p className="text-[8px] text-gray-400 uppercase font-black">Complexe Soccer Club</p>
                        <p className="text-xs font-bold text-primary-dark">{simQuartier} Pitch</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[9px]">
                        <div>
                          <p className="text-gray-400 uppercase font-bold text-[8px]">Capitaine</p>
                          <p className="font-bold truncate text-[#0F2318]">{simName}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 uppercase font-bold text-[8px]">Horaire</p>
                          <p className="font-bold text-[#0F2318]">{simSlot}</p>
                        </div>
                      </div>

                      <div className="bg-neutral-100 p-2 rounded-xl flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">Code de validation</p>
                          <p className="font-mono text-[8px] font-bold text-primary-dark">DKR-CAPT-{simSlot.replace(':','')}</p>
                        </div>
                        <div className="w-8 h-8 bg-neutral-800 rounded flex items-center justify-center text-white text-[9px] font-black shrink-0">QR</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button 
                        onClick={() => {
                          setView('register');
                        }}
                        className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary-dark transition-all text-xs cursor-pointer shadow-glow text-center block animate-pulse"
                      >
                        Bloquer ce créneau réel ⚽
                      </button>
                      <button 
                        onClick={() => {
                          setSimStep(1);
                          setSimQuartier('Almadies');
                          setSimSlot('18:00');
                          setSimName('');
                        }}
                        className="w-full text-center text-[9px] text-gray-500 hover:text-white transition-colors cursor-pointer"
                      >
                        Recommencer la simulation
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* PROBLEM SECTION */}
      <section className="py-24 bg-white px-4">
        <div class="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-bold uppercase tracking-widest text-red-500 bg-red-50 px-4 py-1.5 rounded-full border border-red-100">Le problème</span>
            <h2 className="mt-6 text-3xl md:text-4xl font-display font-bold text-[#0F2318]">L'organisation d'un match à Dakar,<br className="hidden md:block"/> c'est un parcours du combattant.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100 hover:-translate-y-1 transition-transform shadow-subtle">
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-red-500 mb-6 border border-black/5">
                <IconMessageCircle size={28} />
              </div>
              <h3 className="text-xl font-bold text-[#0F2318] mb-3">Groupes WhatsApp saturés</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Passer des heures à envoyer des messages vocaux à 5 gérants différents juste pour trouver un créneau libre à 18h.</p>
            </div>
            
            {/* Card 2 */}
            <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100 hover:-translate-y-1 transition-transform shadow-subtle">
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-amber-500 mb-6 border border-black/5">
                <IconCreditCard size={28} />
              </div>
              <h3 className="text-xl font-bold text-[#0F2318] mb-3">Galère de paiement</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Collecter l'argent en cash au bord du terrain, avec la monnaie qui manque toujours et les retards qui s'accumulent.</p>
            </div>

            {/* Card 3 */}
            <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100 hover:-translate-y-1 transition-transform shadow-subtle">
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-[#0F2318] mb-6 border border-black/5">
                <IconBuildingStore size={28} />
              </div>
              <h3 className="text-xl font-bold text-[#0F2318] mb-3">Gestion archaïque</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Pour les gérants : un cahier d'écolier raturé pour gérer un business qui brasse des millions, source d'erreurs et de double-réservations.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" class="py-24 bg-[#FAFAFA] px-4 border-t border-gray-100 scroll-mt-28">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 text-center flex flex-col items-center">
            <span className="text-sm font-bold uppercase tracking-widest text-primary bg-primary/10 px-4 py-1.5 rounded-full inline-block">La Solution</span>
            <h2 className="mt-6 text-3xl md:text-4xl font-display font-bold text-[#0F2318]">Tout ce qu'il faut pour jouer,<br className="hidden md:block"/> dans votre poche.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Feature 1 */}
            <div className="bg-white rounded-[2rem] p-8 shadow-subtle border border-black/5 flex gap-6 hover:-translate-y-1 hover:shadow-md transition-all group">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                <IconMapPin size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0F2318] mb-2">Carte interactive en direct</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Visualisez tous les terrains de Dakar avec leurs disponibilités en temps réel. Filtrez par quartier, surface ou prix.</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-[2rem] p-8 shadow-subtle border border-black/5 flex gap-6 hover:-translate-y-1 hover:shadow-md transition-all group">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                <IconCreditCard size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0F2318] mb-2">Paiement Mobile Money</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Réservez en 2 clics et payez instantanément via <span className="font-bold text-[#1a56db]">Wave (propulsé par Unitech Pay)</span> ou <span className="font-bold text-[#ff6600]">Orange Money</span>. Fini la collecte de cash.</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-[2rem] p-8 shadow-subtle border border-black/5 flex gap-6 hover:-translate-y-1 hover:shadow-md transition-all group">
              <div className="w-16 h-16 rounded-2xl bg-[#E8DCC8]/30 flex items-center justify-center text-[#0F2318] shrink-0 group-hover:bg-[#E8DCC8] group-hover:text-[#0F2318] transition-colors">
                <IconQrcode size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#0F2318] mb-2">QR Code d'accès unique</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Recevez un QR code scannable par le gérant. Votre téléphone est votre ticket d'entrée sur le terrain.</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-[#0F2318] text-white rounded-[2rem] p-8 shadow-subtle flex gap-6 hover:-translate-y-1 transition-all group relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-primary/20 blur-2xl rounded-full"></div>
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-[#E8DCC8] shrink-0 backdrop-blur-md">
                <IconChartBar size={28} />
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-bold text-white mb-2">Dashboard Gérant Complet</h3>
                <p className="text-gray-400 text-sm leading-relaxed">Une interface d'administration ultra-puissante pour gérer le planning, bloquer des créneaux et analyser les revenus.</p>
                <span className="inline-block mt-3 text-[10px] font-bold bg-[#E8DCC8] text-[#0F2318] px-2.5 py-1 rounded-md uppercase tracking-wider">Inclus</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" class="py-24 bg-white px-4 scroll-mt-28">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-[#0F2318]">Comment ça marche ?</h2>
            <p className="mt-4 text-gray-500">Un processus fluide, que vous soyez sur le terrain ou dans le bureau.</p>
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-gray-100 rounded-2xl mb-12 max-w-sm mx-auto">
            <button 
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'joueur' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-[#0F2318]'
              }`}
              onClick={() => setActiveTab('joueur')}
            >
              Joueur
            </button>
            <button 
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'gerant' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-[#0F2318]'
              }`}
              onClick={() => setActiveTab('gerant')}
            >
              Gérant
            </button>
          </div>

          {/* Tab Content: Joueur */}
          {activeTab === 'joueur' && (
            <div className="space-y-12 relative before:absolute before:inset-y-0 before:left-[23px] md:before:left-1/2 before:w-0.5 before:bg-gray-100">
              
              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                <div className="hidden md:block w-[45%] text-right pr-12">
                  <h3 className="text-xl font-bold text-[#0F2318]">Cherche</h3>
                  <p className="text-sm text-gray-500 mt-2">Ouvre l'application et découvre les terrains disponibles autour de toi sur la carte interactive.</p>
                </div>
                <div className="absolute left-0 md:left-1/2 -translate-x-0 md:-translate-x-1/2 w-12 h-12 rounded-2xl bg-white border-2 border-primary flex items-center justify-center text-primary font-bold shadow-sm z-10 group-hover:bg-primary group-hover:text-white transition-colors">1</div>
                <div className="md:hidden pl-16 pt-2 pb-8">
                  <h3 class="text-xl font-bold text-[#0F2318]">Cherche</h3>
                  <p className="text-sm text-gray-500 mt-2">Ouvre l'application et découvre les terrains disponibles autour de toi sur la carte interactive.</p>
                </div>
                <div className="hidden md:block w-[45%] pl-12">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80" alt="Map step" className="rounded-xl h-24 w-full object-cover grayscale opacity-50" />
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                <div className="hidden md:block w-[45%] pr-12 text-right">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden text-left max-w-sm ml-auto">
                    <div className="bg-[#0F2318] px-5 py-3 flex items-center justify-between">
                      <span className="text-white text-[10px] font-bold uppercase tracking-widest">Paiement Sécurisé</span>
                      <span className="text-emerald-400 text-[10px] font-bold">● En Ligne</span>
                    </div>
                    <div className="px-5 py-3 border-b border-gray-50 flex justify-between">
                      <div className="text-xs font-bold">Arena Plateau</div>
                      <div className="text-xs text-primary font-bold">15.000 FCFA</div>
                    </div>
                    <div className="p-3 bg-gray-50 flex gap-1.5">
                      <div className="flex-1 bg-white border border-[#1a56db] rounded-lg p-1.5 flex items-center justify-center">
                        <span className="text-[#1a56db] text-[9px] font-bold">Wave</span>
                      </div>
                      <div className="flex-1 bg-white border border-gray-200 rounded-lg p-1.5 flex items-center justify-center">
                        <span className="text-gray-400 text-[9px] font-bold">OM</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute left-0 md:left-1/2 -translate-x-0 md:-translate-x-1/2 w-12 h-12 rounded-2xl bg-white border-2 border-primary flex items-center justify-center text-primary font-bold shadow-sm z-10 group-hover:bg-primary group-hover:text-white transition-colors">2</div>
                <div className="pl-16 md:pl-12 pt-2 pb-8 w-full md:w-[45%]">
                  <h3 className="text-xl font-bold text-[#0F2318]">Réserve & Paie</h3>
                  <p className="text-sm text-gray-500 mt-2">Choisis ton créneau et valide le paiement de manière sécurisée via Wave (grâce à Unitech Pay) ou Orange Money.</p>
                </div>
              </div>

              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                <div className="hidden md:block w-[45%] text-right pr-12">
                  <h3 className="text-xl font-bold text-[#0F2318]">Joue</h3>
                  <p className="text-sm text-gray-500 mt-2">Reçois ton QR Code numérique. Présente-le au gérant du terrain à ton arrivée et profite de ton match.</p>
                </div>
                <div className="absolute left-0 md:left-1/2 -translate-x-0 md:-translate-x-1/2 w-12 h-12 rounded-2xl bg-white border-2 border-primary flex items-center justify-center text-primary font-bold shadow-sm z-10 group-hover:bg-primary group-hover:text-white transition-colors">3</div>
                <div className="md:hidden pl-16 pt-2">
                  <h3 className="text-xl font-bold text-[#0F2318]">Joue</h3>
                  <p className="text-sm text-gray-500 mt-2">Reçois ton QR Code numérique. Présente-le au gérant du terrain à ton arrivée et profite de ton match.</p>
                </div>
                <div className="hidden md:block w-[45%] pl-12">
                  <div className="bg-[#0F2318] p-5 rounded-2xl text-white border border-white/10 text-left max-w-sm shadow-xl">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-bold text-[#E8DCC8] tracking-widest">TICKET COMPLET</span>
                      <span className="bg-primary/20 text-[#4ade80] text-[9px] font-bold px-2 py-0.5 rounded">Validé</span>
                    </div>
                    <div className="text-sm font-bold mb-1">City Foot Almadies</div>
                    <div className="text-[10px] text-gray-400">Sam. 22 Mai — 20:00</div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Tab Content: Gérant */}
          {activeTab === 'gerant' && (
            <div className="space-y-12 relative before:absolute before:inset-y-0 before:left-[23px] md:before:left-1/2 before:w-0.5 before:bg-gray-100">
              
              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                <div className="hidden md:block w-[45%] text-right pr-12">
                  <h3 className="text-xl font-bold text-[#0F2318]">Inscris ton infrastructure</h3>
                  <p className="text-sm text-gray-500 mt-2">Crée ton profil terrain, définis tes tarifs, tes horaires d'ouverture et ajoute tes photos en 5 min.</p>
                </div>
                <div className="absolute left-0 md:left-1/2 -translate-x-0 md:-translate-x-1/2 w-12 h-12 rounded-2xl bg-white border-2 border-primary flex items-center justify-center text-primary font-bold shadow-sm z-10 group-hover:bg-primary group-hover:text-white transition-colors">1</div>
                <div className="md:hidden pl-16 pt-2 pb-8">
                  <h3 className="text-xl font-bold text-[#0F2318]">Inscris ton infrastructure</h3>
                  <p className="text-sm text-gray-500 mt-2">Crée ton profil terrain, définis tes tarifs, tes horaires d'ouverture et ajoute tes photos en 5 min.</p>
                </div>
                <div className="hidden md:block w-[45%] pl-12">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <img src="https://images.unsplash.com/photo-1543351611-58f69d7c1781?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80" alt="SaaS mock setup" className="rounded-xl h-24 w-full object-cover grayscale-[0.5] opacity-80" />
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                <div className="hidden md:block w-[45%] pr-12 text-right">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4 text-left max-w-sm ml-auto">
                    <div className="text-[10px] text-gray-400 font-bold uppercase mb-2">Planning Connecté</div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-primary/10 border border-primary/20 p-2 rounded text-center text-primary text-xs font-bold">18:00</div>
                      <div className="bg-primary/10 border border-primary/20 p-2 rounded text-center text-primary text-xs font-bold">19:00</div>
                      <div className="bg-red-50 border border-red-100 p-2 rounded text-center text-red-500 text-xs font-bold">20:00</div>
                      <div className="bg-primary/10 border border-primary/20 p-2 rounded text-center text-primary text-xs font-bold">21:00</div>
                    </div>
                  </div>
                </div>
                <div className="absolute left-0 md:left-1/2 -translate-x-0 md:-translate-x-1/2 w-12 h-12 rounded-2xl bg-white border-2 border-primary flex items-center justify-center text-primary font-bold shadow-sm z-10 group-hover:bg-primary group-hover:text-white transition-colors">2</div>
                <div className="pl-16 md:pl-12 pt-2 pb-8 w-full md:w-[45%]">
                  <h3 className="text-xl font-bold text-[#0F2318]">Gère en temps réel</h3>
                  <p className="text-sm text-gray-500 mt-2">Validez les créneaux, bloquez des plages pour maintenance, et contactez directement les joueurs par WhatsApp.</p>
                </div>
              </div>

              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                <div className="hidden md:block w-[45%] text-right pr-12">
                  <h3 className="text-xl font-bold text-[#0F2318]">Optimise ton chiffre d'affaires</h3>
                  <p className="text-sm text-gray-500 mt-2">Suivez vos statistiques d'occupation hebdomadaires et encaissez vos gains cumulés automatiquement.</p>
                </div>
                <div className="absolute left-0 md:left-1/2 -translate-x-0 md:-translate-x-1/2 w-12 h-12 rounded-2xl bg-white border-2 border-primary flex items-center justify-center text-primary font-bold shadow-sm z-10 group-hover:bg-primary group-hover:text-white transition-colors">3</div>
                <div className="md:hidden pl-16 pt-2">
                  <h3 className="text-xl font-bold text-[#0F2318]">Optimise ton chiffre d'affaires</h3>
                  <p className="text-sm text-gray-500 mt-2">Suivez vos statistiques d'occupation hebdomadaires et encaissez vos gains cumulés automatiquement.</p>
                </div>
                <div className="hidden md:block w-[45%] pl-12">
                  <div className="bg-[#0F2318] p-5 rounded-2xl text-white border border-white/10 text-left max-w-sm shadow-xl flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-gray-400">Revenus de la semaine</div>
                      <div className="text-lg font-black text-[#E8DCC8]">425.000 FCFA</div>
                    </div>
                    <div className="text-emerald-400 font-bold flex items-center gap-0.5 text-xs"><IconTrendingUp size={14} /> +18%</div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </section>

      {/* TERRAINS SLIDER SECTION */}
      {(!loadingTerrains && popularTerrains.length === 0) ? (
        <section id="terrains" className="py-16 bg-[#0F2318] text-white px-4 scroll-mt-28 border-t border-white/5 text-center">
          <div className="max-w-xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-widest text-[#E8DCC8] bg-white/10 px-4 py-1.5 rounded-full inline-block">Terrains à Dakar</span>
            <h3 className="text-2xl font-display font-bold text-white">Bientôt de nouveaux terrains homologués à Dakar !</h3>
            <p className="text-sm text-gray-400">
              Nos équipes valident actuellement de nouveaux complexes sportifs. Restez à l'affût !
            </p>
          </div>
        </section>
      ) : (
        <section id="terrains" className="py-24 bg-[#0F2318] text-white px-4 scroll-mt-28">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <span className="text-sm font-bold uppercase tracking-widest text-[#E8DCC8] bg-white/10 px-4 py-1.5 rounded-full inline-block">Terrains Populaires</span>
              <h2 className="mt-6 text-3xl md:text-4xl font-display font-bold text-white">Les complexes qui font vibrer Dakar.</h2>
            </div>

            <div className={`grid gap-8 ${
              popularTerrains.length === 1 
                ? 'max-w-md mx-auto grid-cols-1' 
                : popularTerrains.length === 2 
                ? 'max-w-3xl mx-auto md:grid-cols-2' 
                : 'md:grid-cols-3'
            }`}>
              {popularTerrains.map((terrain) => (
                <div 
                  key={terrain.id}
                  onClick={() => handleGoToApp('joueur', 'discovery')}
                  className="bg-[#162D20] rounded-[2rem] overflow-hidden border border-[#E8DCC8]/20 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/20 transition-all group cursor-pointer relative flex flex-col justify-between"
                >
                  <div className="relative h-48 overflow-hidden bg-[#0A1810] flex items-center justify-center">
                    <TerrainImage 
                      terrainId={terrain.id} 
                      fallbackUrl={terrain.principalPhotoUrl || terrain.image || terrain.image_url} 
                      alt={terrain.nom || terrain.name} 
                      iconSize={36} 
                      className="w-full h-full group-hover:scale-105 transition-transform duration-500" 
                    />
                    <div className="absolute top-4 right-4 bg-emerald-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 z-10">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Disponible
                    </div>
                    {terrain.boost_actif && (
                      <div className="absolute top-4 left-4 bg-purple-600/90 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg z-10">
                        ⚡ En vedette
                      </div>
                    )}
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-xl font-bold font-display text-white">{terrain.nom}</h3>
                          <p className="text-[#E8DCC8]/70 text-sm flex items-center gap-1 mt-1">
                            <IconMapPin size={14} /> {terrain.quartier || 'Dakar'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg">
                          <IconStar size={14} className="text-[#E8DCC8] fill-[#E8DCC8]" />
                          <span className="text-xs font-bold text-[#E8DCC8]">
                            {terrain.rating ? Number(terrain.rating).toFixed(1) : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                      <div>
                        <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Tarif horaire</p>
                        <p className="text-lg font-bold text-emerald-400">
                          {terrain.price ? Number(terrain.price).toLocaleString('fr-FR') : '—'} FCFA <span className="text-xs text-white/50 font-normal">/h</span>
                        </p>
                      </div>
                      <button className="bg-primary text-white p-3 rounded-xl hover:bg-primary-dark transition-colors shadow-glow">
                        <IconChevronRight size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS SECTION */}
      <section className="py-24 bg-white px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-[#0F2318]">Ce qu'ils en pensent</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white rounded-3xl p-8 shadow-subtle border border-black/5">
              <div className="flex gap-0.5 mb-6 text-amber-400">
                <IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" />
              </div>
              <p className="text-gray-600 italic mb-8 leading-relaxed text-sm">"Avant c'était la croix et la bannière pour trouver un terrain le vendredi soir. Maintenant, j'ouvre l'app, je paie par Wave et c'est réglé. Le top !"</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">M</div>
                <div>
                  <h4 className="font-bold text-[#0F2318] text-sm">Moussa Diop</h4>
                  <p className="text-xs text-gray-500">Joueur régulier</p>
                </div>
              </div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-[#0F2318] text-white rounded-3xl p-8 shadow-subtle border border-white/5 relative overflow-hidden transform md:-translate-y-4">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/20 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex gap-0.5 mb-6 relative z-10 text-[#E8DCC8]">
                <IconStar size={16} className="fill-[#E8DCC8]" /><IconStar size={16} className="fill-[#E8DCC8]" /><IconStar size={16} className="fill-[#E8DCC8]" /><IconStar size={16} className="fill-[#E8DCC8]" /><IconStar size={16} className="fill-[#E8DCC8]" />
              </div>
              <p className="text-gray-300 italic mb-8 leading-relaxed text-sm relative z-10">"Le dashboard a changé ma vie. Fini le cahier perdu, j'ai une vue claire sur mon planning et mes revenus ont augmenté de 30% grâce au paiement en ligne."</p>
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 border border-[#E8DCC8] rounded-full flex items-center justify-center text-[#E8DCC8] font-bold">IF</div>
                <div>
                  <h4 className="font-bold text-white text-sm">Ibrahima Fall</h4>
                  <p className="text-xs text-[#E8DCC8]/70">Gérant, Arena Plateau</p>
                </div>
              </div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-white rounded-3xl p-8 shadow-subtle border border-black/5">
              <div className="flex gap-0.5 mb-6 text-amber-400">
                <IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" /><IconStar size={16} className="fill-amber-400" />
              </div>
              <p className="text-gray-600 italic mb-8 leading-relaxed text-sm">"Super appli ! Pouvoir scanner le QR code à l'entrée sans discuter du paiement avec le gardien, c'est vraiment classe et rapide."</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">F</div>
                <div>
                  <h4 className="font-bold text-[#0F2318] text-sm">Fatou Sow</h4>
                  <p className="text-xs text-gray-500">Capitaine équipe féminine</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="cta" className="py-24 bg-[#0F2318] text-white px-4 relative overflow-hidden scroll-mt-28">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#E8DCC8 1px, transparent 1px), linear-gradient(90deg, #E8DCC8 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-primary/30">
            <IconBallFootball size={32} className="text-primary animate-pulse" />
          </div>
          
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">Ton prochain match <br className="hidden sm:block"/> commence ici.</h2>
          <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">Rejoins la plus grande communauté de footballeurs de Dakar. Cherche, réserve, joue.</p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <button 
              onClick={() => handleGoToApp('joueur', 'discovery')} 
              className="w-full sm:w-auto bg-primary text-white font-bold text-lg px-8 py-4 min-h-[48px] rounded-2xl flex items-center justify-center shadow-glow hover:-translate-y-1 hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer"
            >
              Trouver un terrain
            </button>
            <button 
              onClick={() => { setActiveModal('gerant'); setGerantFormSubmitted(false); }} 
              className="w-full sm:w-auto bg-transparent border-2 border-[#E8DCC8] text-[#E8DCC8] hover:bg-[#E8DCC8]/10 font-bold text-lg px-8 py-4 min-h-[48px] rounded-2xl flex items-center justify-center transition-all active:scale-[0.98] cursor-pointer"
            >
              Inscrire mon terrain
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0a1810] text-gray-400 py-12 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="md:col-span-1">
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-2 mb-4 cursor-pointer group w-fit">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                <IconBallFootball size={18} />
              </div>
              <span className="font-display font-bold text-lg tracking-tight text-white">Playground<span class="text-primary">Spot</span></span>
            </a>
            <p className="text-sm">La plateforme n°1 de réservation de terrains de football à Dakar.</p>
          </div>
          
          <div>
            <h4 className="text-white font-bold mb-4 font-display">Liens rapides</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-primary transition-colors">Accueil</a></li>
              <li><a href="#terrains" className="hover:text-primary transition-colors">Terrains</a></li>
              <li><a href="#how-it-works" className="hover:text-primary transition-colors">Comment ça marche</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 font-display">Légal</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => setActiveModal('cgu')} className="hover:text-primary transition-colors cursor-pointer text-left focus:outline-none">CGU</button></li>
              <li><button onClick={() => setActiveModal('privacy')} className="hover:text-primary transition-colors cursor-pointer text-left focus:outline-none">Confidentialité</button></li>
              <li><button onClick={() => { setActiveModal('gerant'); setGerantFormSubmitted(false); }} className="hover:text-primary transition-colors cursor-pointer text-left focus:outline-none">Espace Gérant</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 font-display">Paiements acceptés</h4>
            <div className="flex flex-wrap gap-3">
              <div className="w-11 h-11 bg-white rounded-xl p-0.5 flex items-center justify-center overflow-hidden shadow-sm border border-white/10">
                <img src={waveLogo} alt="Wave" className="w-full h-full object-cover rounded-lg" />
              </div>
              <div className="w-11 h-11 bg-black rounded-xl p-0.5 flex items-center justify-center overflow-hidden shadow-sm border border-white/10">
                <img src={omLogo} alt="Orange Money" className="w-full h-full object-cover rounded-lg" />
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <p>&copy; 2026 PlaygroundSpot · Dakar, Sénégal</p>
          <p>Fait avec fierté au Sénégal 🇸🇳</p>
        </div>
      </footer>

      {/* CGU MODAL */}
      {activeModal === 'cgu' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-white text-gray-800 w-full max-w-2xl max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-2xl text-[#0F2318]">Conditions Générales d'Utilisation</h3>
              <button onClick={() => setActiveModal(null)} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition-colors cursor-pointer">
                <IconX size={20} />
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-gray-600 text-sm">
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">1. Objet</h4>
                <p className="leading-relaxed">Les présentes Conditions Générales d'Utilisation ont pour objet de définir les modalités de mise à disposition des services du site PlaygroundSpot et les conditions d'utilisation par l'Utilisateur.</p>
              </div>
              <div>
                <h4 class="font-bold text-[#0F2318] mb-2">2. Services proposés</h4>
                <p className="leading-relaxed">PlaygroundSpot met en relation des joueurs amateurs et des gérants d'infrastructures sportives privées à Dakar. Nous agissons en tant qu'intermédiaire technologique pour faciliter la réservation et le paiement.</p>
              </div>
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">3. Paiement et Annulation</h4>
                <p className="leading-relaxed">Tout paiement (dont les paiements Wave possibles grâce à Unitech Pay) est définitif. L'annulation d'une réservation dépend des conditions propres fixées par le gérant du terrain concerné.</p>
              </div>
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">4. Responsabilité</h4>
                <p className="leading-relaxed">PlaygroundSpot décline toute responsabilité en cas de blessure ou d'incident survenu sur le lieu de l'infrastructure réservée. Les gérants restent seuls responsables de l'entretien de leurs terrains.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRIVACY MODAL */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-white text-gray-800 w-full max-w-2xl max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-2xl text-[#0F2318]">Politique de Confidentialité</h3>
              <button onClick={() => setActiveModal(null)} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition-colors cursor-pointer">
                <IconX size={20} />
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-gray-600 text-sm">
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">1. Collecte des données</h4>
                <p className="leading-relaxed">Dans le cadre de votre utilisation de PlaygroundSpot, nous collectons les données strictly nécessaires à la réservation de votre terrain : nom, prénom, numéro de téléphone et données de transaction.</p>
              </div>
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">2. Traitement des paiements</h4>
                <p className="leading-relaxed">Les paiements, notamment les règlements par Wave qui sont rendus possibles grâce à notre partenaire Unitech Pay, sont traités de manière sécurisée. Nous ne stockons aucune information bancaire ou code secret sur nos serveurs.</p>
              </div>
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">3. Partage d'informations</h4>
                <p className="leading-relaxed">Vos informations de contact sont uniquement partagées avec le gérant du terrain que vous avez réservé afin d'assurer le bon déroulement de votre match.</p>
              </div>
              <div>
                <h4 className="font-bold text-[#0F2318] mb-2">4. Vos droits</h4>
                <p className="leading-relaxed">Conformément à la réglementation sénégalaise en vigueur (CDP), vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GERANT SPACE MODAL */}
      {activeModal === 'gerant' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="relative bg-white text-gray-800 w-full max-w-2xl max-h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col scale-100 opacity-100 transition-all duration-300 animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-[#0F2318] text-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
                  <IconBuildingStore size={18} />
                </div>
                <h3 className="font-display font-bold text-xl text-white">Espace Gérant Partenaire</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white/80 transition-colors cursor-pointer">
                <IconX size={20} />
              </button>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto space-y-8 text-gray-600">
              {/* Top Section */}
              <div className="grid md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                {/* Connexion Link */}
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-between shadow-subtle">
                  <div>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full uppercase tracking-wider">Déjà Membre ?</span>
                    <h4 className="font-bold text-[#0F2318] text-lg mt-3 mb-2">Se connecter</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mb-4">Accédez à votre tableau de bord interactif pour suivre vos plannings et vos revenus en temps réel.</p>
                  </div>
                  <button 
                    onClick={() => { setActiveModal(null); handleGoToApp('gerant', 'gerant-dashboard'); }}
                    className="w-full bg-[#0F2318] text-white font-bold text-sm py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#1a3826] transition-all active:scale-[0.98] text-center cursor-pointer shadow-subtle"
                  >
                    Mon Tableau de Bord 📊
                  </button>
                </div>
                
                {/* Configuration Clé en main (Offre Irrésistible Gérant) */}
                <div className="bg-[#1A7A4A]/10 p-6 rounded-2xl border border-primary/20 flex flex-col justify-between shadow-subtle">
                  <div>
                    <span className="text-[10px] font-bold text-white bg-secondary px-2.5 py-1 rounded-full uppercase tracking-wider">Offre Clé en Main</span>
                    <h4 className="font-bold text-[#0F2318] text-lg mt-3 mb-2">Zéro Saisie : On fait tout !</h4>
                    <p className="text-xs text-gray-600 leading-relaxed mb-3 font-medium">
                      Pas le temps de remplir le formulaire ? Envoyez-nous une simple photo de votre planning papier par email à{' '}
                      <a href="mailto:drixoftm@gmail.com?subject=Configuration%20terrain" className="text-primary font-bold hover:underline">
                        drixoftm@gmail.com
                      </a>{' '}
                      (objet : "Configuration terrain").
                    </p>
                    <p className="text-[11px] text-gray-500 font-semibold italic">Notre équipe configure et publie vos terrains sous 2 heures gratuitement.</p>
                  </div>
                </div>
              </div>

              {/* Registration Form or Success Screen */}
              {!gerantFormSubmitted ? (
                <div>
                  <h4 className="font-display font-bold text-lg text-[#0F2318] mb-4">Inscrire mon infrastructure (Gratuit)</h4>
                  <form onSubmit={handleGerantFormSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nom Complet</label>
                        <input 
                          type="text" 
                          required 
                          value={gerantName}
                          onChange={(e) => setGerantName(e.target.value)}
                          placeholder="ex: Ibrahima Fall" 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Téléphone (WhatsApp)</label>
                        <input 
                          type="tel" 
                          required 
                          value={gerantPhone}
                          onChange={(e) => setGerantPhone(e.target.value)}
                          placeholder="ex: 77 123 45 67" 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nom du Complexe</label>
                        <input 
                          type="text" 
                          required 
                          value={gerantComplex}
                          onChange={(e) => setGerantComplex(e.target.value)}
                          placeholder="ex: Les Champions Almadies" 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Quartier (Dakar)</label>
                        <input 
                          type="text" 
                          required 
                          value={gerantQuartier}
                          onChange={(e) => setGerantQuartier(e.target.value)}
                          placeholder="ex: Almadies" 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Nombre de terrains de football</label>
                      <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-white min-h-[48px] flex items-center">
                        <CustomSelect
                          value={gerantTerrains}
                          onChange={(val) => setGerantTerrains(val)}
                          options={[
                            { label: "1 Terrain", value: "1" },
                            { label: "2 Terrains", value: "2" },
                            { label: "3 Terrains ou plus", value: "3" }
                          ]}
                          theme="light"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={gerantFormLoading}
                      className="w-full bg-primary text-white font-bold py-3.5 rounded-xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-glow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                    >
                      {gerantFormLoading ? (
                        <>
                          <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                          Traitement en cours...
                        </>
                      ) : "Soumettre ma demande d'inscription ⚽"}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="text-center py-8 space-y-6 animate-in zoom-in-95 duration-300">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary animate-bounce">
                    <IconCheck size={40} className="stroke-[2.5]" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-display font-bold text-2xl text-[#0F2318]">Félicitations ! 🇸🇳</h4>
                    <p className="text-gray-500 max-w-md mx-auto text-sm leading-relaxed">Votre demande d'inscription a bien été reçue. Notre équipe commerciale vous contactera sur votre WhatsApp sous 24 heures pour valider votre espace gérant et configurer votre premier terrain.</p>
                  </div>
                  <button 
                    onClick={() => setActiveModal(null)} 
                    className="bg-[#0F2318] text-white font-bold text-sm px-8 py-3 rounded-xl hover:bg-[#1a3826] transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Fermer la fenêtre
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
