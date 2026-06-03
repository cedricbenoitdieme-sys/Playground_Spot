import React, { useState } from 'react';
import { useUser } from '../context/UserContext';
import { validateAmount } from '../lib/validators';
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
  IconCalendar
} from '@tabler/icons-react';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { StepperHeader } from './StepperHeader';
import { PaymentModal } from './PaymentModal';

const DetailItem = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
    <p className="text-lg font-bold text-primary-dark">{value}</p>
  </div>
);

const PaymentCard = ({ name, selected, onClick, color }) => (
  <button 
    onClick={onClick}
    className={`relative p-6 rounded-card border-2 transition-all text-center group h-32 flex flex-col items-center justify-center gap-3 ${
      selected ? 'border-primary bg-primary/5 shadow-md scale-105' : 'border-gray-100 bg-white hover:border-primary/20'
    }`}
  >
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl`} style={{ backgroundColor: color }}>
      {name[0]}
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

  // Stable token for this booking session
  const [verifyToken] = useState(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'PSPOT-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  });

  const totalPrice = (terrain?.price || 0) * duration;
  const resNumber = verifyToken; // Using the token as resNumber for consistency

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

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const handlePaymentConfirm = (confirmedPhone) => {
    setIsPaymentModalOpen(false);
    if (confirmedPhone) setPhoneNumber(confirmedPhone);
    nextStep();
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
      canvas.width = 600;
      canvas.height = 400;
      ctx.fillStyle = '#F8F7F2';
      ctx.fillRect(0, 0, 600, 400);
      ctx.fillStyle = '#1A7A4A';
      ctx.font = 'bold 30px Inter';
      ctx.fillText('PLAYGROUNDSPOT', 50, 60);
      ctx.fillStyle = '#0F2318';
      ctx.font = '20px Inter';
      ctx.fillText(`Terrain: ${terrain?.name}`, 50, 120);
      ctx.fillText(`Lieu: ${terrain?.quartier}`, 50, 160);
      ctx.fillText(`Date: 15 Mai 2026`, 50, 200);
      ctx.fillText(`Heure: ${selectedSlot}`, 50, 240);
      ctx.font = 'bold 35px Inter';
      ctx.fillText(`CODE: ${resNumber}`, 50, 320);
      
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
                  {['08:00', '10:00', '12:00', '16:00', '18:00', '20:00', '21:00', '22:00', '23:00'].map(t => (
                    <button key={t} onClick={() => setSelectedSlot(t)} className={`py-3 rounded-xl font-bold text-xs border-2 transition-all ${selectedSlot === t ? 'bg-secondary border-secondary text-white shadow-lg' : 'bg-white border-gray-100 text-gray-700'}`}>
                      {t}
                    </button>
                  ))}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PaymentCard name="Wave" selected={paymentMethod === 'Wave'} onClick={() => setPaymentMethod('Wave')} color="#1DB954" />
              <PaymentCard name="Orange Money" selected={paymentMethod === 'Orange Money'} onClick={() => setPaymentMethod('Orange Money')} color="#FF6600" />
              <PaymentCard name="Sur place" selected={paymentMethod === 'Sur place'} onClick={() => setPaymentMethod('Sur place')} color="#1A7A4A" />
            </div>
            <div className="flex flex-col items-center gap-4 pt-10">
              {!amountCheck.valid && (
                <p className="text-red-500 text-xs font-bold text-center mb-2">{amountCheck.error}</p>
              )}
              <button disabled={!paymentMethod || !amountCheck.valid} onClick={() => { if (paymentMethod === 'Sur place') nextStep(); else setIsPaymentModalOpen(true); }} className="btn-primary w-full max-w-sm h-14 disabled:opacity-50">Confirmer</button>
              <button onClick={prevStep} className="font-bold text-gray-400">Retour</button>
            </div>
            <PaymentModal isOpen={isPaymentModalOpen} method={paymentMethod} amount={totalPrice} onClose={() => setIsPaymentModalOpen(false)} onConfirm={handlePaymentConfirm} />
          </div>
        )}

        {step === 4 && (
          <div className="bg-white p-8 rounded-card shadow-subtle border border-black/5 text-center animate-in zoom-in duration-500">
            <IconCircleCheckFilled size={60} className="text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-display font-bold text-primary-dark mb-2">Réservation Terminée !</h2>
            <p className="text-gray-500 font-medium mb-8">Votre ticket est prêt et disponible dans votre portefeuille.</p>
            
            <div className="max-w-xs mx-auto bg-white p-6 rounded-3xl border-2 border-dashed border-gray-100 mb-8 relative">
              <div className="flex justify-center mb-6">
                <QRCodeCanvas 
                  value={`https://playgroundspot.com/verify/${verifyToken}`} 
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
    </div>
  );
};
