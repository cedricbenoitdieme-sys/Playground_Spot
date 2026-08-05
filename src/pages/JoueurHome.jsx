import React, { useState, useEffect } from 'react';
import { 
  IconSearch, 
  IconBallFootball, 
  IconTicket, 
  IconTrendingUp, 
  IconMapPin, 
  IconHeart, 
  IconStar, 
  IconCalendar,
  IconArrowRight,
  IconLoader2
} from '@tabler/icons-react';
import { fetchTopTerrains } from '../services/terrains';
import { fetchReservations } from '../services/reservations';
import { fetchFavorisSet, toggleFavori } from '../services/favoris';
import { getRangClient } from '../lib/loyalty';
import { supabase } from '../lib/supabase';
import { formatAmountAbbreviated } from '../services/stats';
import { useUser } from '../context/UserContext';
import { JoueurHomeSkeleton } from '../components/Skeletons';
import { TerrainImage } from '../components/TerrainImage';

export const JoueurHome = ({ setView, setSelectedTerrain }) => {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredTerrains, setFeaturedTerrains] = useState([]);
  const [nextMatch, setNextMatch] = useState(null);
  const [favorisSet, setFavorisSet] = useState(new Set());
  const [playerRank, setPlayerRank] = useState(null);
  const [activePlayersCount, setActivePlayersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchTopTerrains(3);
        setFeaturedTerrains(data);
      } catch (err) {
        console.error('Erreur chargement terrains:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetchFavorisSet(currentUser.id).then(setFavorisSet).catch(() => {});

    const loadStats = async () => {
      try {
        const { data } = await supabase.rpc('get_joueur_profile_stats');
        if (data?.rang) {
          setPlayerRank(data.rang);
        } else {
          const { count } = await supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('joueur_id', currentUser.id);
          setPlayerRank(getRangClient(count || 0));
        }
      } catch (err) {
        console.error(err);
      }
    };

    const loadPlayerCount = async () => {
      try {
        const { count } = await supabase.from('profiles_public').select('id', { count: 'exact', head: true }).eq('role', 'joueur');
        setActivePlayersCount(count || 0);
      } catch (err) {
        console.error(err);
      }
    };

    loadStats();
    loadPlayerCount();
  }, [currentUser?.id]);

  const handleToggleFav = async (e, terrainId) => {
    e.stopPropagation();
    if (!currentUser?.id) return;
    const isFav = favorisSet.has(terrainId);
    try {
      await toggleFavori(currentUser.id, terrainId, isFav);
      setFavorisSet(prev => {
        const next = new Set(prev);
        if (isFav) next.delete(terrainId);
        else next.add(terrainId);
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    const loadNextMatch = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const data = await fetchReservations({ joueurId: currentUser.id, statut: 'confirmee' });
        const upcoming = data
          .filter(r => r.date_slot >= today)
          .sort((a, b) => new Date(a.date_slot) - new Date(b.date_slot));
        setNextMatch(upcoming[0] || null);
      } catch (err) {
        console.error('Erreur chargement prochain match:', err.message);
      }
    };
    loadNextMatch();
  }, [currentUser?.id]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setView('discovery');
  };

  if (loading) {
    return <JoueurHomeSkeleton />;
  }

  return (
    <div className="flex-1 space-y-6 pb-28 overflow-y-auto overflow-x-hidden px-6 lg:px-8 py-6">

      {/* Prompt "Complétez votre quartier" si quartier non renseigné */}
      {currentUser && !currentUser.quartier && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <IconMapPin size={22} />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Précisez votre quartier</p>
              <p className="text-[11px] text-amber-600/90 dark:text-amber-400">Complétez votre profil pour découvrir en priorité les terrains les plus proches de chez vous.</p>
            </div>
          </div>
          <button 
            onClick={() => setView('joueur-profile')}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 shadow-sm"
          >
            Compléter mon quartier
          </button>
        </div>
      )}

      {/* Welcome & Search Banner */}
      <div 
        className="relative bg-[#0F2318] text-white p-6 md:p-8 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl space-y-6"
        style={{ animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
            {playerRank ? `${playerRank.label} ${playerRank.emoji}` : 'Joueur ⚽'}
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-bold leading-tight">
            Trouve ton terrain <br />
            & réserve à Dakar
          </h2>
          <p className="text-xs text-white/50">
            {activePlayersCount > 0 
              ? `Rejoins les ${activePlayersCount} joueurs actifs sur la plateforme.`
              : 'Rejoins la communauté des passionnés de football à Dakar.'}
          </p>
        </div>

        {/* Search button redirecting to discovery */}
        <button 
          onClick={() => setView('discovery')}
          className="w-full max-w-md bg-primary hover:bg-primary-dark text-white font-bold h-14 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all duration-300 group cursor-pointer"
        >
          <IconSearch size={20} className="group-hover:rotate-12 transition-transform" />
          <span>Chercher mon terrain 🔍</span>
        </button>
      </div>


      {/* Recommended Terrains horizontal cards grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Terrains Recommandés</h3>
          <button onClick={() => setView('discovery')} className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer">
            Voir tout <IconArrowRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredTerrains.map((terrain, index) => (
            <div 
              key={terrain.id} 
              onClick={() => {
                setSelectedTerrain(terrain);
                setView('terrain-detail');
              }}
              className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden group hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col cursor-pointer"
              style={{ 
                animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                animationDelay: `${index * 0.08 + 0.1}s`
              }}
            >
              <div className="h-36 relative overflow-hidden">
                <TerrainImage
                  terrainId={terrain.id}
                  fallbackUrl={terrain.image || terrain.image_url}
                  alt={terrain.name}
                  iconSize={24}
                  className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                />
                <button 
                  onClick={(e) => handleToggleFav(e, terrain.id)}
                  title={favorisSet.has(terrain.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className={`absolute top-3 right-3 p-1.5 rounded-full backdrop-blur-md shadow-sm cursor-pointer hover:scale-110 active:scale-90 transition-all ${
                    favorisSet.has(terrain.id)
                      ? 'bg-red-500 text-white'
                      : 'bg-white/95 text-gray-400 hover:text-red-500'
                  }`}
                >
                  <IconHeart size={16} fill={favorisSet.has(terrain.id) ? "currentColor" : "none"} />
                </button>
                <div className="absolute bottom-3 left-3 bg-primary-dark/80 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-bold text-white flex items-center gap-0.5">
                  <IconMapPin size={10} className="text-primary" /> Dakar
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-primary-dark truncate">{terrain.name}</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 text-secondary">
                      <IconStar size={12} fill="currentColor" />
                      <span className="text-[10px] font-bold text-primary-dark">{terrain.rating || '—'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">À partir de</p>
                    <p className="font-bold text-xs text-primary">{formatAmountAbbreviated(terrain.price)} FCFA/h</p>
                  </div>
                  <button 
                    className="btn-primary py-2 px-3 rounded-lg text-[10px] font-bold transition-transform"
                  >
                    Réserver
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prochains Matchs Active Tickets widget */}
      <div 
        className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-4"
        style={{ animation: 'slideUp 0.4s 0.25s cubic-bezier(.22,1,.36,1) both' }}
      >
        <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider">Mon Prochain Match</h3>

        {nextMatch ? (
          <div
            onClick={() => setView('tickets')}
            className="flex flex-col md:flex-row items-center justify-between p-4 bg-gray-50 hover:bg-primary/5 rounded-2xl border border-gray-100 hover:border-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer gap-4 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                <IconTicket size={24} />
              </div>
              <div>
                <p className="font-bold text-sm text-primary-dark">{nextMatch.terrain}</p>
                <p className="text-xs text-gray-400 font-semibold flex items-center gap-1 mt-0.5">
                  <IconCalendar size={12} /> {new Date(nextMatch.date_slot).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} • {nextMatch.heure_slot?.slice(0, 5)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-gray-400 font-semibold">Statut Ticket</p>
                <span className="text-[10px] font-bold bg-green-50 text-green-500 border border-green-200 px-2 py-0.5 rounded-full">Confirmé</span>
              </div>
              <button className="bg-[#0F2318] text-white hover:bg-primary py-2 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer">
                Voir Billet
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">Aucun match à venir pour le moment.</p>
        )}
      </div>
    </div>
  );
};
