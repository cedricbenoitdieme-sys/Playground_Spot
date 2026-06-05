import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconChevronLeft, 
  IconMapPin, 
  IconClock, 
  IconCalendar, 
  IconUsers, 
  IconDownload, 
  IconTrash, 
  IconCircleCheckFilled,
  IconClockHour4,
  IconChecks,
  IconTicket,
  IconX
} from '@tabler/icons-react';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { useUser } from '../context/UserContext';

export const ReservationDetail = ({ reservation, onBack, onCancel }) => {
  const { currentUser } = useUser();
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);

  if (!reservation) return null;

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
      doc.text(`Nom: ${reservation.terrain}`, 10, 46);
      doc.text(`Lieu: ${reservation.quartier}`, 10, 51);
      
      doc.setFont('helvetica', 'bold');
      doc.text('DÉTAILS DU MATCH', 10, 65);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${reservation.date}`, 10, 71);
      doc.text(`Heure: ${reservation.slot}`, 10, 76);
      doc.text(`ID: ${reservation.id}`, 10, 81);
      
      doc.save(`Recu-${reservation.id}.pdf`);
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
      ctx.fillText(`Terrain: ${reservation.terrain}`, 50, 120);
      ctx.fillText(`Lieu: ${reservation.quartier}`, 50, 160);
      ctx.fillText(`Date: ${reservation.date}`, 50, 200);
      ctx.fillText(`Heure: ${reservation.slot}`, 50, 240);
      ctx.font = 'bold 35px Inter';
      ctx.fillText(`CODE: ${reservation.qr_token || reservation.id}`, 50, 320);
      
      const qrCanvas = document.getElementById('qr-code-canvas');
      if (qrCanvas) {
        ctx.drawImage(qrCanvas, 380, 100, 160, 160);
      }
      
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `Ticket-${reservation.id}.png`;
      link.click();
    }
    setShowDownloadOptions(false);
  };

  const getStepsForStatus = (status) => {
    const isCompleted = status === 'Passée' || status === 'Terminée' || status === 'utilise';
    const isCancelled = status === 'Annulée' || status === 'annule';
    const isPending = status === 'En attente';
    
    if (isCancelled) {
      return [
        { label: 'En attente', icon: IconClockHour4, active: false, done: true },
        { label: 'Annulé', icon: IconX, active: true, done: false, isError: true },
        { label: 'Terminée', icon: IconChecks, active: false, done: false },
      ];
    }
    
    return [
      { label: 'En attente', icon: IconClockHour4, active: isPending, done: true },
      { label: 'Confirmée', icon: IconCircleCheckFilled, active: !isCompleted && !isPending, done: !isPending },
      { label: 'Terminée', icon: IconChecks, active: isCompleted, done: isCompleted },
    ];
  };

  const steps = getStepsForStatus(reservation.status);
  const backLabel = currentUser?.role === 'joueur' ? 'Mes tickets' : 'Retour';

  return (
    <div className="flex-1 bg-background overflow-y-auto px-6 lg:px-8 py-8 pb-24 lg:pb-12 text-center lg:text-left">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-primary-dark font-bold hover:text-primary transition-colors">
            <IconChevronLeft size={20} />
            {backLabel}
          </button>
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${reservation.statusColor}`}>
            {reservation.status}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden text-left">
              <div className="h-48 relative">
                <img src={reservation.image} className="w-full h-full object-cover" alt={reservation.terrain} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-6 left-6 text-white">
                  <h1 className="text-2xl font-bold font-display">{reservation.terrain}</h1>
                  <p className="flex items-center gap-1 text-sm font-medium opacity-80">
                    <IconMapPin size={14} /> {reservation.quartier}
                  </p>
                </div>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                  <DetailItem icon={IconCalendar} label="Date" value={reservation.date} />
                  <DetailItem icon={IconClock} label="Heure" value={reservation.slot} />
                  <DetailItem icon={IconUsers} label="Joueurs" value="10 Joueurs" />
                  <DetailItem icon={IconClockHour4} label="Durée" value="1 Heure" />
                  <DetailItem icon={IconCircleCheckFilled} label="Montant" value={reservation.amount} />
                  <DetailItem icon={IconTicket} label="Code ID" value={reservation.id} />
                </div>

                <div className="mt-10 pt-10 border-t border-gray-50">
                  <h3 className="font-bold text-primary-dark mb-6">Suivi du ticket</h3>
                  <div className="flex items-center justify-between relative px-4">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-100 -translate-y-1/2 -z-10"></div>
                    {steps.map((step, i) => (
                      <div key={i} className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-all ${
                          step.isError 
                            ? 'bg-red-500 text-white' 
                            : step.done 
                              ? 'bg-primary text-white' 
                              : step.active 
                                ? 'bg-secondary text-white' 
                                : 'bg-gray-200 text-gray-500'
                        }`}>
                          <step.icon size={20} />
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          step.isError 
                            ? 'text-red-500' 
                            : step.done || step.active 
                              ? 'text-primary' 
                              : 'text-gray-300'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {reservation.status === 'À venir' && (
              <div className="bg-red-50 p-6 rounded-card border border-red-100 text-left">
                <h3 className="text-red-800 font-bold mb-2">Besoin d'annuler ?</h3>
                <p className="text-red-600 text-sm mb-4">L'annulation est gratuite jusqu'à 24h avant le match.</p>
                <button onClick={() => setIsCancelModalOpen(true)} className="flex items-center gap-2 text-red-700 font-bold text-sm hover:underline">
                  <IconTrash size={18} /> Annuler le ticket
                </button>
              </div>
            )}
          </div>

          {/* Visual Ticket Sidebar */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-card shadow-subtle border border-black/5 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Aperçu du Ticket</p>
              
              <div className="bg-white p-4 rounded-3xl border-2 border-dashed border-gray-100 inline-block mb-6 relative">
                <QRCodeCanvas 
                  id="qr-code-canvas"
                  value={`${window.location.origin}/verify/${reservation.qr_token || reservation.id}`} 
                  size={150} 
                  includeMargin={true} 
                />
              </div>
              <p className="text-sm font-bold text-primary-dark mb-1">Scannez pour valider</p>
              <p className="text-xs text-gray-400 font-medium mb-8">N° {reservation.id}</p>

              <div className="relative">
                <button onClick={() => handleDownload('png')} className="w-full btn-primary h-12 flex items-center justify-center gap-2 mb-3">
                  <IconDownload size={18} /> Télécharger
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isCancelModalOpen && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm" onClick={() => setIsCancelModalOpen(false)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-sm mx-auto rounded-modal shadow-2xl p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 no-scrollbar">
            <h3 className="text-xl font-bold text-primary-dark mb-2 text-center">Annuler ce ticket ?</h3>
            <p className="text-gray-500 text-center text-sm mb-8">Cette action est irréversible.</p>
            <div className="space-y-3">
              <button onClick={() => { onCancel(reservation.id); setIsCancelModalOpen(false); }} className="w-full py-4 bg-red-600 text-white font-bold rounded-2xl shadow-lg shadow-red-200">Confirmer l'annulation</button>
              <button onClick={() => setIsCancelModalOpen(false)} className="w-full py-4 text-gray-400 font-bold">Garder le ticket</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

const DetailItem = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary"><Icon size={20} /></div>
    <div>
      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{label}</p>
      <p className="font-bold text-sm text-primary-dark">{value}</p>
    </div>
  </div>
);
