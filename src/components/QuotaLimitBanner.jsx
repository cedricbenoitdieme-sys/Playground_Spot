import React, { useState, useEffect } from 'react';
import { IconAlertTriangle, IconSparkles, IconArrowRight } from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { checkUserQuota } from '../services/subscriptions';

export const QuotaLimitBanner = ({ quotaType = 'reservations', setView }) => {
  const { currentUser } = useUser();
  const [quotaInfo, setQuotaInfo] = useState(null);

  useEffect(() => {
    const checkQuota = async () => {
      if (!currentUser?.id) return;
      const data = await checkUserQuota(currentUser.id, quotaType);
      setQuotaInfo(data);
    };

    checkQuota();
  }, [currentUser, quotaType]);

  if (!quotaInfo || quotaInfo.illimite) return null;

  const { limite, utilise, quota_atteint } = quotaInfo;
  const isNearLimit = limite && utilise >= limite * 0.8;

  if (!isNearLimit && !quota_atteint) return null;

  return (
    <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
      quota_atteint
        ? 'bg-red-500/10 border-red-500/30 text-red-200'
        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          quota_atteint ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
        }`}>
          <IconAlertTriangle size={20} />
        </div>
        <div className="text-xs space-y-1">
          <p className="font-bold text-sm">
            {quota_atteint
              ? `Quota de ${quotaType === 'terrains' ? 'terrains' : 'réservations mensuelles'} atteint (${utilise}/${limite})`
              : `Quota bientôt atteint (${utilise}/${limite} ${quotaType})`}
          </p>
          {/* Loss-Aversion Framing */}
          <p className="text-white/80 leading-relaxed">
            {quota_atteint
              ? 'Vous risquez de perdre des réservations ce mois-ci — passez à Starter pour débloquer l\'illimité et conserver 92% de vos ventes !'
              : 'Ne manquez aucune opportunité de réservation — surpassez vos limites avec le plan supérieur.'}
          </p>
        </div>
      </div>

      <button
        onClick={() => setView ? setView('gerant-tarifs') : window.location.href = '/?view=gerant-tarifs'}
        className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-lg shadow-primary/20"
      >
        <IconSparkles size={14} />
        <span>Passer à Starter</span>
        <IconArrowRight size={14} />
      </button>
    </div>
  );
};
