import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatFCFA } from '../services/payment';
import { 
  IconLoader2, 
  IconClock, 
  IconRefresh, 
  IconAlertCircle, 
  IconMapPin, 
  IconCalendar,
  IconShieldCheck,
  IconChevronLeft
} from '@tabler/icons-react';

/**
 * Page PaiementAttente
 * Route: /paiement/attente?resa=<uuid>
 * 
 * Principes & Sécurité :
 * 1. N'accorde JAMAIS la confirmation au montage ou sur l'URL de retour sans relecture DB / Realtime.
 * 2. Relecture DB initiale au montage (`select statut from reservations where id = resa`).
 * 3. Abonnement `supabase.channel` Realtime sur les modifications de la réservation.
 * 4. Désabonnement propre au démontage (`supabase.removeChannel`).
 * 5. Bouton de sécurité "Vérifier maintenant" après 3 minutes d'attente.
 * 6. Décompte de 15 minutes (`expire_dans`).
 */
export const PaiementAttente = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const resaIdFromUrl = queryParams.get('resa');
  const resaId = resaIdFromUrl || sessionStorage.getItem('pending_reservation_id');

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  
  // Timer d'expiration (15 minutes = 900 secondes par défaut)
  const [secondsLeft, setSecondsLeft] = useState(900);
  const [showManualVerify, setShowManualVerify] = useState(false);
  const [manualVerifying, setManualVerifying] = useState(false);

  const channelRef = useRef(null);
  const isMountedRef = useRef(true);

  // Router interne selon statut de réservation
  const handleStatutRoute = (statut, resId = resaId) => {
    if (statut === 'confirmee') {
      window.location.href = `/reservation/${resId}/ticket`;
    } else if (statut === 'annulee') {
      window.location.href = `/reservation/echec?resa=${resId}`;
    }
  };

  // Lecture manuelle DB
  const checkReservationDb = async (quiet = false) => {
    if (!resaId) return;
    if (!quiet) setManualVerifying(true);

    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id,
          statut,
          montant,
          date_slot,
          heure_slot,
          terrain_nom,
          created_at,
          terrains ( nom, quartier )
        `)
        .eq('id', resaId)
        .single();

      if (!isMountedRef.current) return;

      if (error) {
        console.error('[PaiementAttente] Erreur relecture DB:', error);
        setErrorMsg('Impossible de retrouver cette réservation.');
        setLoading(false);
        setManualVerifying(false);
        return;
      }

      setReservation(data);
      setLoading(false);
      setManualVerifying(false);

      // Calcul dynamique du temps restant par rapport au created_at (15 min)
      if (data.created_at) {
        const createdMs = new Date(data.created_at).getTime();
        const nowMs = Date.now();
        const elapsedSec = Math.floor((nowMs - createdMs) / 1000);
        const remaining = Math.max(0, 900 - elapsedSec);
        setSecondsLeft(remaining);
      }

      // Si le webhook a déjà confirmé ou annulé la réservation
      if (data.statut !== 'en_attente') {
        handleStatutRoute(data.statut, data.id);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setErrorMsg('Erreur lors de la vérification de la réservation.');
        setLoading(false);
        setManualVerifying(false);
      }
    }
  };

  // Montage initial & Abonnement Realtime
  useEffect(() => {
    isMountedRef.current = true;

    if (!resaId) {
      setErrorMsg('Aucun identifiant de réservation n’a été fourni.');
      setLoading(false);
      return;
    }

    // 1. Montage : Lecture DB immédiate
    checkReservationDb(true);

    // 2. S'abonner aux changements Realtime
    const canal = supabase
      .channel(`resa-${resaId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
          filter: `id=eq.${resaId}`,
        },
        ({ new: r }) => {
          if (!isMountedRef.current) return;
          if (r && r.statut) {
            setReservation(prev => ({ ...prev, statut: r.statut }));
            handleStatutRoute(r.statut, r.id);
          }
        }
      )
      .subscribe();

    channelRef.current = canal;

    // 3. Filet de sécurité 3 minutes
    const verifyTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        setShowManualVerify(true);
      }
    }, 180000); // 3 minutes

    // 4. Décompte d'expiration (15 min)
    const intervalTimer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalTimer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Clean-up propre
    return () => {
      isMountedRef.current = false;
      clearTimeout(verifyTimeout);
      clearInterval(intervalTimer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [resaId]);

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <IconLoader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-bold text-primary-dark">Vérification de la réservation...</h2>
        <p className="text-sm text-gray-400 mt-1">Connexion sécurisée aux serveurs Supabase</p>
      </div>
    );
  }

  if (errorMsg || !reservation) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-card shadow-subtle border border-gray-100 text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <IconAlertCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-primary-dark">Réservation introuvable</h2>
        <p className="text-sm text-gray-500">{errorMsg || 'Aucune réservation trouvée.'}</p>
        <button
          onClick={() => window.location.href = '/joueur-home'}
          className="w-full py-3 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 mt-4"
        >
          <IconChevronLeft size={18} /> Retour à l'accueil
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto my-8 px-4 sm:px-6">
      <div className="bg-white rounded-card shadow-xl border border-black/5 p-6 sm:p-8 text-center space-y-6">
        
        {/* Pulsing Loading Spinner */}
        <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-75"></div>
          <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center relative z-10">
            <IconLoader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        </div>

        <div>
          <span className="text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60 px-3 py-1 rounded-full inline-block mb-3">
            Paiement en cours de confirmation
          </span>
          <h1 className="text-2xl font-bold font-display text-primary-dark">
            Attente du signal de paiement...
          </h1>
          <p className="text-xs text-gray-500 font-medium max-w-sm mx-auto mt-2 leading-relaxed">
            La validation automatique par webhook peut prendre quelques secondes après l'exécution du paiement dans votre application mobile (Wave ou Orange Money).
          </p>
        </div>

        {/* Détails Réservation */}
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-left space-y-2 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-gray-200">
            <span className="font-bold text-gray-400 uppercase">Terrain</span>
            <span className="font-bold text-primary-dark">{reservation.terrains?.nom || reservation.terrain_nom}</span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-gray-200">
            <span className="font-bold text-gray-400 uppercase">Créneau</span>
            <span className="font-bold text-primary-dark">
              {reservation.date_slot ? new Date(reservation.date_slot).toLocaleDateString('fr-FR') : ''} • {reservation.heure_slot?.slice(0, 5)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-gray-400 uppercase">Montant</span>
            <span className="font-bold text-primary text-sm font-display">{formatFCFA(reservation.montant)}</span>
          </div>
        </div>

        {/* Compte à rebours d'expiration */}
        <div className="p-4 bg-orange-50/60 border border-orange-100 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-orange-800 font-bold">
            <IconClock size={18} />
            <span>Temps restant avant expiration :</span>
          </div>
          <span className="font-black text-orange-900 font-mono text-sm">
            {formatTimer(secondsLeft)}
          </span>
        </div>

        {secondsLeft <= 0 && (
          <p className="text-xs text-red-500 font-bold">
            Le délai de réservation a expiré. Le créneau a été libéré.
          </p>
        )}

        {/* Filet de sécurité : Bouton de relecture manuelle après 3 minutes */}
        {showManualVerify && (
          <div className="pt-2 animate-in fade-in duration-300 space-y-2">
            <button
              onClick={() => checkReservationDb(false)}
              disabled={manualVerifying}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-primary-dark font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-colors"
            >
              {manualVerifying ? (
                <>
                  <IconLoader2 className="animate-spin" size={16} />
                  <span>Vérification en cours...</span>
                </>
              ) : (
                <>
                  <IconRefresh size={16} />
                  <span>Vérifier maintenant</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-gray-400">
              Si le paiement a déjà été débité mais que l'écran reste bloqué, cliquez ci-dessus.
            </p>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
          <IconShieldCheck size={16} className="text-primary" />
          <span>Observation Realtime Supabase active</span>
        </div>
      </div>
    </div>
  );
};
