import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { validateAmount } from '../lib/validators';
import { useReservationPaymentPolling } from '../hooks/useReservationPaymentPolling';
import { 
  IconMapPin, 
  IconClock, 
  IconUsers, 
  IconChevronLeft, 
  IconPlus, 
  IconMinus, 
  IconShieldCheck,
  IconDownload,
  IconCircleCheckFilled,
  IconTicket,
  IconCalendar,
  IconLoader2,
  IconExternalLink
} from '@tabler/icons-react';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { StepperHeader } from './StepperHeader';
import { PaymentFlow } from './PaymentFlow';
import { CustomAlertModal } from './CustomAlertModal';
import { createReservation, createPaiement } from '../services/reservations';
import waveLogo from '../assets/wave.png';
import orangeMoneyLogo from '../assets/orange_money.png';
import * as amplitude from '@amplitude/unified';

const IconCaptainArmband = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
  >
    <rect x="3" y="6" width="18" height="12" rx="2" fill="currentColor" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="#E8DCC8" strokeWidth="1.5" />
    <line x1="3" y1="15" x2="21" y2="15" stroke="#E8DCC8" strokeWidth="1.5" />
    <path 
      d="M14 10.5C13.5 10 12.8 9.7 12 9.7C10.5 9.7 9.5 10.7 9.5 12C9.5 13.3 10.5 14.3 12 14.3C12.8 14.3 13.5 14 14 13.5" 
      stroke="white" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
  </svg>
);

const DetailItem = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
    <p className="text-lg font-bold text-primary-dark">{value}</p>
  </div>
);

const PaymentCard = ({ name, selected, onClick, icon }) => (
  <button 
    onClick={onClick}
    className={`relative p-6 rounded-card border-2 transition-all text-center group h-32 flex flex-col items-center justify-center gap-3 ${
      selected ? 'border-primary bg-primary/5 shadow-md scale-105' : 'border-gray-100 bg-white hover:border-primary/20'
    }`}
  >
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden">
      {icon}
    </div>
    <span className={`font-bold transition-colors ${selected ? 'text-primary' : 'text-gray-500 group-hover:text-primary-dark'}`}>
      {name}
    </span>
    {selected && (
      <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white border-4 border-white">
        <IconCircleCheckFilled size={20} />
      </div>
    )}
  </button>
);

export const BookingFlow = ({ terrain, onBack, onComplete }) => {
  const { currentUser } = useUser();
  const [step, setStep] = useState(1);
  const [duration, setDuration] = useState(1);
  const [players, setPlayers] = useState(10);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [bookedSlots, setBookedSlots] = useState([]);
  const qrCanvasRef = useRef(null);

  // The real token will be set after successful backend creation
  const [verifyToken, setVerifyToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [wantedSlots, setWantedSlots] = useState([]);
  const wantedSlotsRef = useRef([]);
  const [alertConfig, setAlertConfig] = useState(null);
  const { status: paymentPollStatus, error: paymentPollError, startPolling: startPaymentPolling, stopPolling: stopPaymentPolling } = useReservationPaymentPolling();
  const [activePaymentRef, setActivePaymentRef] = useState(null);

  useEffect(() => {
    if (paymentPollStatus === 'success') {
      nextStep();
    }
  }, [paymentPollStatus]);

  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    wantedSlotsRef.current = wantedSlots;
  }, [wantedSlots]);

  const totalPrice = (terrain?.price || 0) * duration;
  const resNumber = verifyToken || '...'; // Using the token as resNumber for consistency

  // ── Règle 1.1 — Validation du montant ──
  const amountCheck = validateAmount(totalPrice);

  // ── Règle 1.3 — Vérifier l'authentification AVANT toute transaction ──
  if (!currentUser) {
    return (
      <div className="flex-1 bg-background flex items-center justify-center px-4">
        <div className="bg-white p-8 rounded-card shadow-subtle text-center max-w-sm">
          <p className="text-lg font-bold text-primary-dark mb-4">Connexion requise</p>
          <p className="text-gray-500 text-sm mb-6">Vous devez être connecté pour effectuer une réservation.</p>
          <button onClick={onBack} className="btn-primary px-8 h-12">Retour</button>
        </div>
      </div>
    );
  }

  // ── Règle Anti-Double Réservation : Récupération des créneaux occupés ──
  useEffect(() => {
    const fetchBookedSlots = async () => {
      if (!terrain?.id) return;
      const today = new Date().toISOString().split('T')[0];
      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('heure_slot')
          .eq('terrain_id', terrain.id)
          .eq('date_slot', today)
          .in('statut', ['en_attente', 'confirmee', 'terminee']);
          
        if (data && !error) {
          // On extrait l'heure au format 'HH:mm'
          const booked = data.map(r => r.heure_slot.slice(0, 5));
          setBookedSlots(booked);
        }
      } catch (err) {
        console.error('Erreur récupération slots occupés:', err);
      }
    };

    fetchBookedSlots();

    // ── Temps Réel : Notification de libération de créneau ──
    if (!terrain?.id) return;
    const today = new Date().toISOString().split('T')[0];

    const channel = supabase
      .channel(`reservations_flow_${terrain.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `terrain_id=eq.${terrain.id}`
        },
        (payload) => {
          const isToday = payload.new?.date_slot === today || payload.old?.date_slot === today;
          if (!isToday) return;

          const oldStatus = payload.old?.statut;
          const newStatus = payload.new?.statut;
          const timeSlot = (payload.new?.heure_slot || payload.old?.heure_slot)?.slice(0, 5);

          if (!timeSlot) return;

          const isNowFree = newStatus === 'annulee' || payload.eventType === 'DELETE';

          if (isNowFree) {
            setBookedSlots(prev => prev.filter(t => t !== timeSlot));

            if (wantedSlotsRef.current.includes(timeSlot)) {
              showToast(`🎉 Le créneau de ${timeSlot} que vous vouliez s'est libéré !`);
              setWantedSlots(prev => prev.filter(t => t !== timeSlot));
            } else {
              showToast(`💡 Le créneau de ${timeSlot} vient de se libérer !`);
            }
          } else if (['en_attente', 'confirmee', 'terminee'].includes(newStatus)) {
            setBookedSlots(prev => {
              if (!prev.includes(timeSlot)) {
                return [...prev, timeSlot];
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [terrain]);

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handlePaymentConfirm = async (confirmedPhone) => {
    setIsPaymentModalOpen(false);
    if (confirmedPhone) setPhoneNumber(confirmedPhone);
    
    setIsSubmitting(true);
    try {
      // Pour la démo, on utilise la date d'aujourd'hui, mais en vrai on prendrait une date sélectionnée
      const date_slot = new Date().toISOString().split('T')[0];
      
      const result = await createReservation({
        terrain_id: terrain?.id,
        terrain_nom: terrain?.name || 'Terrain',
        joueur_id: currentUser?.id,
        joueur_nom: currentUser?.user_metadata?.nom || currentUser?.email || currentUser?.nom || 'Joueur',
        date_slot,
        heure_slot: selectedSlot + ':00',
        montant: totalPrice,
        duree_heures: duration
      });
      
      const paymentModeMap = {
        'Wave': 'wave',
        'Orange Money': 'orange_money',
        'Pay Unitech': 'pay_unitech',
        'Sur place': 'sur_place'
      };

      const paymentResult = await createPaiement({
        reservation_id: result.id,
        montant: totalPrice,
        mode: paymentModeMap[paymentMethod] || 'sur_place',
        numero_tel: confirmedPhone || null
      });

      // Amplitude Event: Reservation Created
      amplitude.track('Réservation Effectuée', {
        terrain: terrain?.name,
        montant: totalPrice,
        duree: duration,
        moyenPaiement: paymentMethod
      });

      // Paiement mobile réel (Wave / Orange Money) — uniquement si le paiement en BDD est valide
      const isMobilePayment = paymentMethod === 'Wave' || paymentMethod === 'Orange Money';
      const isMockPayment = String(paymentResult.id).startsWith('mock-');

      if (isMobilePayment && !isMockPayment) {
        try {
          const apiUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3000');
          const initRes = await fetch(`${apiUrl}/api/payments/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paiement_id: paymentResult.id,
              customer: {
                name: currentUser?.user_metadata?.nom || currentUser?.nom || 'Joueur',
                phone: confirmedPhone,
                email: currentUser?.email || ''
              }
            })
          });
          if (initRes.ok) {
            const initData = await initRes.json();
            if (initData.payment_url) {
              setVerifyToken(result.qr_token || result.id);
              // Ouvrir l'application de paiement dans un nouvel onglet
              window.open(initData.payment_url, '_blank');
              // Lancer le polling sur la référence externe de transaction
              const refToPoll = initData.transaction_ref || paymentResult.id;
              setActivePaymentRef(refToPoll);
              startPaymentPolling(refToPoll);
              return;
            } else {
              throw new Error("L'API de paiement n'a pas renvoyé de lien.");
            }
          } else {
            const errData = await initRes.json().catch(() => ({}));
            throw new Error(errData.error || "Impossible d'initier la transaction.");
          }
        } catch (e) {
          console.error('Erreur initiation paiement:', e);
          showAlert("Erreur de paiement", e.message, "error");
          return;
        }
      }
      
      setVerifyToken(result.qr_token || result.id);
      nextStep();
    } catch (error) {
      console.error(error);
      showAlert("Erreur de réservation", error.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = (format) => {
    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });
      doc.setFillColor(26, 122, 74);
      doc.rect(0, 0, 105, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('PLAYGROUNDSPOT', 52.5, 12, { align: 'center' });
      doc.setFontSize(8);
      doc.text('REÇU DE RÉSERVATION OFFICIEL', 52.5, 18, { align: 'center' });
      
      doc.setTextColor(15, 35, 24);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DÉTAILS DU TERRAIN', 10, 40);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nom: ${terrain?.name}`, 10, 46);
      doc.text(`Lieu: ${terrain?.quartier}`, 10, 51);
      
      doc.setFont('helvetica', 'bold');
      doc.text('DÉTAILS DU MATCH', 10, 65);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: 15 Mai 2026`, 10, 71);
      doc.text(`Heure: ${selectedSlot}`, 10, 76);
      doc.text(`ID: ${resNumber}`, 10, 81);
      
      doc.save(`Recu-${resNumber}.pdf`);
    } else {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 400;
      canvas.height = 700;
      
      // Fond Sable
      ctx.fillStyle = '#E8DCC8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Carte blanche
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(20, 20, 360, 660, 24);
      ctx.fill();

      // Header vert
      ctx.fillStyle = '#1A7A4A';
      ctx.beginPath();
      ctx.roundRect(20, 20, 360, 100, [24, 24, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PLAYGROUNDSPOT', 200, 75);

      // QR Code
      const qrCanvas = document.getElementById(`qr-canvas-${verifyToken}`) || qrCanvasRef.current;
      if (qrCanvas) {
        ctx.drawImage(qrCanvas, 100, 150, 200, 200);
      }

      // Ligne de séparation pointillée
      ctx.strokeStyle = '#E8DCC8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.setLineDash([8, 8]);
      ctx.moveTo(40, 400);
      ctx.lineTo(360, 400);
      ctx.stroke();
      ctx.setLineDash([]);

      // Section Infos
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0F2318';
      ctx.font = '800 18px sans-serif';
      ctx.fillText('DÉTAILS DU MATCH', 40, 450);

      // Lignes de détails
      const drawRow = (label, value, y) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#888888';
        ctx.font = '600 15px sans-serif';
        ctx.fillText(label, 40, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F2318';
        ctx.font = '800 15px sans-serif';
        ctx.fillText(value, 360, y);
      };

      drawRow('Terrain', terrain?.name || 'Inconnu', 490);
      drawRow('Lieu', terrain?.quartier || 'Dakar', 530);
      // Pour l'instant, c'est la date de démo dans ce composant
      drawRow('Date', '15 Mai 2026', 570);
      drawRow('Heure', selectedSlot || '--:--', 610);

      // Footer avec le code
      ctx.fillStyle = '#F4F4F4';
      ctx.beginPath();
      ctx.roundRect(20, 620, 360, 60, [0, 0, 24, 24]);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#1A7A4A';
      ctx.font = '800 16px monospace';
      ctx.fillText(resNumber, 200, 655);
      
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `Ticket-${resNumber}.png`;
      link.click();
    }
    setShowDownloadOptions(false);
  };

  if (!terrain) return null;

  return (
    <div className="flex-1 bg-background overflow-y-auto px-4 lg:px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <StepperHeader currentStep={step} />

        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-card shadow-subtle border border-black/5 flex gap-6 items-center">
              <img src={terrain?.image} className="w-24 h-24 rounded-2xl object-cover" alt={terrain?.name} />
              <div>
                <h2 className="text-xl font-bold text-primary-dark">{terrain?.name}</h2>
                <div className="flex items-center gap-1 text-gray-400 text-sm font-medium">
                  <IconMapPin size={16} />
                  {terrain?.quartier}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-card shadow-subtle border border-black/5 space-y-8">
                <div>
                  <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider mb-4 flex items-center gap-2">
                    <IconClock size={18} className="text-primary" />
                    Durée du match
                  </h3>
                  <div className="flex bg-background p-1 rounded-2xl border border-gray-100">
                    {[1, 2].map((h) => (
                      <button key={h} onClick={() => setDuration(h)} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${duration === h ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider mb-4 flex items-center gap-2">
                    <IconUsers size={18} className="text-primary" />
                    Joueurs
                  </h3>
                  <div className="flex items-center justify-between bg-background p-4 rounded-2xl border border-gray-100">
                    <button onClick={() => setPlayers(Math.max(2, players - 1))} className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center"><IconMinus size={20} /></button>
                    <span className="text-2xl font-bold text-primary-dark">{players}</span>
                    <button onClick={() => setPlayers(Math.min(22, players + 1))} className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center"><IconPlus size={20} /></button>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-card shadow-subtle border border-black/5">
                <h3 className="text-sm font-bold text-primary-dark uppercase tracking-wider mb-4">Créneaux</h3>
                <div className="grid grid-cols-3 gap-2">
                  {['08:00', '10:00', '12:00', '16:00', '18:00', '20:00', '21:00', '22:00', '23:00'].map(t => {
                    const isBooked = bookedSlots.includes(t);
                    return (
                      <button 
                        key={t} 
                        onClick={() => {
                          if (isBooked) {
                            if (!wantedSlots.includes(t)) {
                              setWantedSlots(prev => [...prev, t]);
                              showToast(`🔔 Vous serez notifié si le créneau de ${t} se libère !`);
                            } else {
                              showToast(`🔔 Déjà abonné aux alertes pour le créneau de ${t}.`);
                            }
                          } else {
                            setSelectedSlot(t);
                          }
                        }}
                        className={`py-3 rounded-xl font-bold text-xs border-2 transition-all ${
                          isBooked 
                            ? 'bg-gray-100 border-gray-100 text-gray-400 opacity-50 cursor-pointer line-through' 
                            : selectedSlot === t 
                              ? 'bg-secondary border-secondary text-white shadow-lg' 
                              : 'bg-white border-gray-100 text-gray-700 hover:border-secondary/30'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button onClick={onBack} className="text-gray-400 font-bold hover:text-gray-600 flex items-center gap-2"><IconChevronLeft size={20} /> Retour</button>
              <button disabled={!selectedSlot} onClick={nextStep} className="btn-primary px-12 h-14 disabled:opacity-50">Suivant</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
              <div className="bg-primary/5 p-6 border-b border-primary/10 text-center">
                <h2 className="text-xl font-bold text-primary-dark">Résumé de la réservation</h2>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-8 text-center">
                  <DetailItem label="Terrain" value={terrain?.name} />
                  <DetailItem label="Heure" value={selectedSlot} />
                  <DetailItem label="Date" value="15 Mai 2026" />
                  <DetailItem label="Total" value={`${totalPrice.toLocaleString()} FCFA`} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-4">
              <button onClick={prevStep} className="font-bold text-gray-400">Précédent</button>
              <button onClick={nextStep} className="btn-primary px-12 h-14">Confirmer</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-primary-dark text-center mb-8">Paiement</h2>
            <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
              <PaymentCard 
                name="Wave" 
                selected={paymentMethod === 'Wave'} 
                onClick={() => setPaymentMethod('Wave')} 
                icon={<img src={waveLogo} alt="Wave Logo" className="w-full h-full object-cover" />} 
              />
              <PaymentCard 
                name="Orange Money" 
                selected={paymentMethod === 'Orange Money'} 
                onClick={() => setPaymentMethod('Orange Money')} 
                icon={<img src={orangeMoneyLogo} alt="Orange Money Logo" className="w-full h-full object-cover" />} 
              />
            </div>
            <div className="flex flex-col items-center gap-4 pt-10">
              {!amountCheck.valid && (
                <p className="text-red-500 text-xs font-bold text-center mb-2">{amountCheck.error}</p>
              )}
              <button 
                disabled={!paymentMethod || isSubmitting} 
                onClick={() => setIsPaymentModalOpen(true)} 
                className="btn-primary w-full max-w-sm h-14 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <IconLoader2 className="animate-spin" size={20} />
                    <span>Traitement en cours...</span>
                  </>
                ) : (
                  'Confirmer le paiement'
                )}
              </button>
              <button onClick={prevStep} className="font-bold text-gray-400">Retour</button>
            </div>
            <PaymentFlow
              isOpen={isPaymentModalOpen}
              onClose={() => setIsPaymentModalOpen(false)}
              type_flux="reservation"
              terrain_id={terrain?.id}
              amount={totalPrice}
              title={`Réservation ${terrain?.name || ''}`}
              onSuccess={async () => {
                setIsPaymentModalOpen(false);
                const date_slot = new Date().toISOString().split('T')[0];
                const resObj = await createReservation({
                  terrain_id: terrain?.id,
                  terrain_nom: terrain?.name || 'Terrain',
                  joueur_id: currentUser?.id,
                  joueur_nom: currentUser?.user_metadata?.nom || currentUser?.email || currentUser?.nom || 'Joueur',
                  date_slot,
                  heure_slot: selectedSlot + ':00',
                  montant: totalPrice,
                  duree_heures: duration
                });
                if (resObj?.id) {
                  setVerifyToken(resObj.qr_token || resObj.id);
                  setStep(4);
                }
              }}
            />
          </div>
        )}

        {step === 4 && (
          <div className="bg-white p-8 rounded-card shadow-subtle border border-black/5 text-center animate-in zoom-in duration-500">
            <div className="flex justify-center mb-6 relative">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                <IconCaptainArmband size={44} className="text-primary" />
              </div>
              <div className="absolute -top-1 left-[54%] bg-secondary text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-md">
                Capitaine
              </div>
            </div>
            <h2 className="text-3xl font-display font-bold text-primary-dark mb-2">Bien joué, Capitaine ! ⚽</h2>
            <p className="text-gray-500 font-medium mb-8">
              Brassard enfilé, terrain réservé. Sans vous, pas de match !<br />
              Votre ticket est prêt et disponible dans votre portefeuille.
            </p>
            
            <div className="max-w-xs mx-auto bg-white p-6 rounded-3xl border-2 border-dashed border-gray-100 mb-8 relative">
              <div className="flex justify-center mb-6">
                <QRCodeCanvas 
                  id={`qr-canvas-${verifyToken}`}
                  ref={qrCanvasRef}
                  value={`${window.location.origin}/verify/${verifyToken}`} 
                  size={160} 
                  includeMargin={true} 
                />
              </div>
              <p className="text-xl font-bold text-primary-dark tracking-widest">{verifyToken}</p>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={() => handleDownload('png')} className="w-full btn-primary h-14 flex items-center justify-center gap-2">
                <IconDownload size={20} /> Télécharger le ticket
              </button>
              <button onClick={onComplete} className="w-full py-4 text-gray-400 font-bold hover:text-primary">Voir mes tickets</button>
            </div>
          </div>
        )}
      </div>
      {/* Modal de suivi de paiement en direct (Wave / Orange Money) */}
      {paymentPollStatus !== 'idle' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0F2318] text-white rounded-3xl border border-white/20 p-8 max-w-md w-full text-center shadow-2xl animate-in zoom-in duration-300">
            {paymentPollStatus === 'polling' && (
              <>
                <div className="w-16 h-16 bg-[#1A7A4A]/20 rounded-full flex items-center justify-center text-[#1A7A4A] mx-auto mb-6">
                  <IconLoader2 className="animate-spin" size={36} />
                </div>
                <h3 className="text-2xl font-display font-bold mb-2">Attente de confirmation...</h3>
                <p className="text-[#E8DCC8]/80 text-sm mb-6">
                  Veuillez valider la transaction sur votre application de paiement (Wave / Orange Money).
                </p>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-xs text-gray-300 text-left space-y-1">
                  <p><span className="text-gray-400">Référence :</span> <strong className="text-white">{activePaymentRef || '...' }</strong></p>
                  <p><span className="text-gray-400">Montant :</span> <strong className="text-white">{totalPrice?.toLocaleString()} FCFA</strong></p>
                </div>
                <button
                  onClick={() => stopPaymentPolling()}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-6 rounded-2xl text-sm transition-all"
                >
                  Annuler le suivi
                </button>
              </>
            )}

            {paymentPollStatus === 'failed' && (
              <>
                <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-2xl">✕</span>
                </div>
                <h3 className="text-2xl font-display font-bold mb-2 text-red-400">Paiement non confirmé</h3>
                <p className="text-[#E8DCC8]/80 text-sm mb-6">
                  {paymentPollError || "La transaction a été refusée ou annulée."}
                </p>
                <button
                  onClick={() => stopPaymentPolling()}
                  className="w-full bg-[#1A7A4A] hover:bg-[#15633b] text-white font-semibold py-3.5 px-6 rounded-2xl text-sm transition-all"
                >
                  Réessayer
                </button>
              </>
            )}

            {paymentPollStatus === 'timeout' && (
              <>
                <div className="w-16 h-16 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-2xl">⏱</span>
                </div>
                <h3 className="text-2xl font-display font-bold mb-2 text-amber-400">Délai dépassé</h3>
                <p className="text-[#E8DCC8]/80 text-sm mb-6">
                  {paymentPollError || "Le délai de confirmation est dépassé."}
                </p>
                <button
                  onClick={() => stopPaymentPolling()}
                  className="w-full bg-[#1A7A4A] hover:bg-[#15633b] text-white font-semibold py-3.5 px-6 rounded-2xl text-sm transition-all"
                >
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-36 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[9999]">
          <IconCircleCheckFilled size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};
