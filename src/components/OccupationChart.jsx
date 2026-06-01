import React, { useState, useEffect } from 'react';
import { fetchOccupationByQuartier } from '../services/stats';
import { IconChartBar, IconInfoCircle, IconLoader2 } from '@tabler/icons-react';

export const OccupationChart = () => {
  const [quartiers, setQuartiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeQuartier, setActiveQuartier] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchOccupationByQuartier();
        setQuartiers(data);
      } catch (err) {
        console.error('Erreur chargement occupation:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-gray-400 gap-2">
        <IconLoader2 size={16} className="animate-spin" />
        <span className="text-xs">Chargement...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-primary-dark tracking-tight uppercase flex items-center gap-2">
          <IconChartBar size={16} className="text-primary" />
          Occupation par quartier
        </h3>
        <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded animate-pulse">Live</span>
      </div>

      <div className="space-y-4">
        {quartiers.map((item, index) => (
          <button 
            key={item.quartier} 
            onClick={() => setActiveQuartier(activeQuartier === item.quartier ? null : item.quartier)}
            className="w-full text-left space-y-1.5 group outline-none transition-all active:scale-[0.99] cursor-pointer"
            style={{ 
              animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
              animationDelay: `${index * 0.08}s`
            }}
          >
            <div className="flex justify-between text-[11px] font-bold">
              <span className={`transition-colors ${activeQuartier === item.quartier ? 'text-primary font-black scale-105' : 'text-gray-600 group-hover:text-primary-dark'}`}>
                {item.quartier}
              </span>
              <span className="text-primary font-display font-black">{item.percentage}%</span>
            </div>
            <div className={`h-2.5 rounded-full overflow-hidden border transition-all duration-300 ${
              activeQuartier === item.quartier ? 'bg-primary/10 border-primary/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]' : 'bg-secondary-light/30 border-black/5'
            }`}>
              <div 
                className={`h-full transition-all duration-1000 ease-out ${
                  activeQuartier === item.quartier ? 'bg-[#E8DCC8]' : 'bg-[#1A7A4A]'
                } rounded-full shadow-[0_0_8px_rgba(26,122,74,0.3)]`}
                style={{ 
                  width: `${item.percentage}%`,
                  transformOrigin: 'left',
                  animation: 'barGrow 0.8s cubic-bezier(.22,1,.36,1) both',
                  animationDelay: `${index * 0.08 + 0.2}s`
                }}
              ></div>
            </div>
            
            {/* Expanded Info */}
            {activeQuartier === item.quartier && (
              <div className="bg-primary/5 p-3 rounded-xl border border-primary/10 mt-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-start gap-2">
                  <IconInfoCircle size={14} className="text-primary mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold text-primary-dark uppercase mb-1">Détails {item.quartier}</p>
                    <div className="grid grid-cols-2 gap-2 text-[9px] font-medium text-gray-500">
                      <p>Occupation: <span className="text-primary font-bold">{item.percentage}%</span></p>
                      <p>Tendance: <span className="text-primary font-bold">Stable</span></p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </button>
        ))}

        {quartiers.length === 0 && !loading && (
          <p className="text-center text-gray-400 text-xs py-4">Aucune donnée d'occupation disponible.</p>
        )}
      </div>
    </>
  );
};
