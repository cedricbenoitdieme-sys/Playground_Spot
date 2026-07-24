import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Composant de Ticket avec QR Code sécurisé.
 * Affiche le QR Code si le token est disponible, sinon affiche un état d'attente.
 */
export default function TicketQR({ reservation }) {
  if (!reservation) return null;

  // Extraction des données de réservation
  const { id, qr_token, terrain_id, terrain_nom, date_slot, heure_slot } = reservation;

  const payload = JSON.stringify({
    bookingId: id,
    qr_token: qr_token,
    terrainId: terrain_id,
    date: date_slot,
    slot: heure_slot,
  });

  // Formater l'heure et la date de manière élégante
  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    return timeStr.slice(0, 5);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-- -- ----';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-3xl shadow-lg border border-black/5 p-6 flex flex-col items-center justify-center gap-6 text-[#0F2318] transition-all hover:shadow-xl duration-300">
      {qr_token ? (
        <>
          {/* QR Code encodant l'URL sécurisée */}
          <div className="bg-[#E8DCC8]/30 p-4 rounded-2xl flex items-center justify-center">
            <QRCodeSVG
              value={payload}
              size={200}
              bgColor="#E8DCC8"
              fgColor="#0F2318"
              level="H"
              includeMargin={true}
            />
          </div>

          {/* Informations sous le QR Code */}
          <div className="text-center space-y-2 font-sans w-full">
            <h3 className="text-lg font-bold tracking-tight text-[#0F2318] break-words">
              {terrain_nom || 'Terrain de Football'}
            </h3>
            <div className="flex items-center justify-center gap-2 text-sm text-[#0F2318]/80 font-medium">
              <span>{formatDate(date_slot)}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A7A4A]" />
              <span className="font-bold">{formatTime(heure_slot)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="py-12 text-center text-gray-400 font-medium text-sm animate-pulse">
          QR code en cours de génération...
        </div>
      )}
    </div>
  );
}
