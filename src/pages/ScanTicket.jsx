import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import * as amplitude from '@amplitude/unified';
import { 
  IconChevronLeft, 
  IconScan, 
  IconAlertTriangle, 
  IconCircleCheckFilled, 
  IconCalendar, 
  IconClock, 
  IconMapPin, 
  IconUser,
  IconUpload
} from '@tabler/icons-react';

const playSuccessSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playNote = (frequency, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    playNote(659.25, now, 0.15); // E5
    playNote(987.77, now + 0.08, 0.3); // B5
  } catch (err) {
    console.warn("Impossible de jouer le son de succès :", err);
  }
};

export const ScanTicket = ({ onBack }) => {
  const [scanResult, setScanResult] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(true);
  const html5QrCodeRef = useRef(null);

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      if (html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (err) {
          console.error("Erreur lors de l'arrêt du scanner:", err);
        }
      }
      html5QrCodeRef.current = null;
    }
  };

  const handleScanSuccess = async (decodedText) => {
    try {
      setLoading(true);
      await stopScanner();

      // Extraire le token si le texte scanné est un JSON ou une URL
      let token = decodedText;
      try {
        const parsed = JSON.parse(decodedText);
        if (parsed.qr_token) token = parsed.qr_token;
      } catch (e) {
        if (decodedText.includes('/verify/')) {
          token = decodedText.split('/verify/').pop();
        } else if (decodedText.includes('token=')) {
          token = decodedText.split('token=').pop();
        }
      }

      let validationData;

      // Recherche directe sur la table reservations
      const { data: resData, error: selectError } = await supabase
        .from('reservations')
        .select('*')
        .eq('qr_token', token)
        .single();

      const res = resData;

      if (selectError || !res) {
        validationData = { success: false, message: 'Ticket introuvable' };
      } else if (res.scan_at) {
        validationData = { success: false, message: 'Ticket déjà utilisé', used_at: res.scan_at };
      } else if (res.statut === 'annulee') {
        validationData = { success: false, message: 'Ticket annulé' };
      } else {
        const nowStr = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('reservations')
          .update({ scan_at: nowStr })
          .eq('id', res.id);

        if (updateError) throw updateError;
        validationData = { success: true, message: 'Ticket validé', booking_id: res.id };
        playSuccessSound();

        // Amplitude Event: Ticket Scanned
        amplitude.track('Ticket Scanné', {
          reservationId: res.id,
          terrainId: res.terrain_id,
          joueurId: res.joueur_id
        });
      }

      setScanResult(validationData);

      // Charger les informations complémentaires de la réservation
      if (validationData?.success && validationData.booking_id) {
        const { data: resData } = await supabase
          .from('reservations')
          .select(`
            id,
            joueur_nom,
            date_slot,
            heure_slot,
            duree_heures,
            montant,
            terrains (
              nom,
              quartier
            )
          `)
          .eq('id', validationData.booking_id)
          .single();

        if (resData) {
          setReservation(resData);
        }
      }
    } catch (err) {
      console.error('Erreur lors de la validation du ticket:', err);
      setError(err.message || 'Une erreur est survenue lors de la validation.');
    } finally {
      setLoading(false);
    }
  };

  const startScanner = () => {
    setError(null);
    setScanResult(null);
    setReservation(null);
    setLoading(false);

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('reader');
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' }, // Caméra arrière impérative
          {
            fps: 10,
            qrbox: (width, height) => {
              const minEdge = Math.min(width, height);
              return {
                width: Math.floor(minEdge * 0.7),
                height: Math.floor(minEdge * 0.7)
              };
            },
            aspectRatio: 1.0
          },
          handleScanSuccess,
          (err) => {
            // Ignorer les erreurs continuelles de scan
          }
        );
      } catch (err) {
        console.error('Erreur lors du démarrage du scanner:', err);
        setError("Impossible d'accéder à la caméra arrière. Assurez-vous d'avoir donné les permissions nécessaires ou importez une image de ticket.");
      }
    }, 100);
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setScanResult(null);

    try {
      await stopScanner();
      
      const html5QrCode = new Html5Qrcode('reader-file-helper');
      const decodedText = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();

      await handleScanSuccess(decodedText);
    } catch (err) {
      console.error('Erreur de scan de fichier:', err);
      setError("Aucun code QR valide détecté sur cette image. Assurez-vous que le code QR est bien lisible.");
    } finally {
      setLoading(false);
    }
  };

  const resetAfterResult = () => {
    setScanResult(null);
    setReservation(null);
    setError(null);
    if (isMobile) {
      startScanner();
    }
  };

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    setIsMobile(mobile);

    if (mobile) {
      startScanner();
    }

    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = (e) => {
      if (e.target.tagName !== 'INPUT') {
        e.preventDefault();
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      stopScanner();
    };
  }, []);

  return (
    <div className="flex-1 bg-background overflow-y-auto px-6 py-8 pb-24 font-sans animate-in fade-in duration-300">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={onBack || (() => window.history.back())} 
            className="flex items-center gap-2 text-primary-dark font-bold hover:text-primary transition-colors cursor-pointer"
          >
            <IconChevronLeft size={20} />
            Retour
          </button>
          <span className="px-4 py-1.5 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/20 uppercase tracking-wider">
            {isMobile ? 'Scanner' : 'Importation'}
          </span>
        </div>

        {/* Scanner card */}
        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-black/5 text-center overflow-hidden">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
            <IconScan size={32} />
          </div>
          
          <h2 className="text-2xl font-display font-bold text-primary-dark mb-2">
            {isMobile ? 'Scanner un Ticket' : 'Valider un Ticket'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {isMobile 
              ? 'Cadrez le code QR avec votre caméra arrière pour le valider.' 
              : 'Glissez-déposez ou importez le fichier image du ticket pour le valider.'}
          </p>

          {/* Scanner view */}
          {!scanResult && !error && !loading && (
            <>
              {isMobile ? (
                // Camera Scanner for Mobile
                <div className="rounded-2xl overflow-hidden border-2 border-dashed border-neutral-200 relative bg-neutral-900 p-2 aspect-square flex items-center justify-center">
                  <div id="reader" className="w-full h-full rounded-xl overflow-hidden"></div>
                  <div className="absolute inset-8 border-2 border-dashed border-primary/40 rounded-xl pointer-events-none flex items-center justify-center">
                    <div className="w-full h-0.5 bg-primary/70 absolute animate-pulse"></div>
                  </div>
                </div>
              ) : (
                // File Upload Area for Desktop / PC
                <div className="p-8 border-2 border-dashed border-primary/20 bg-[#0F2318]/5 rounded-3xl flex flex-col items-center justify-center gap-4 text-center">
                  <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                    <IconUpload size={32} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[#0f2318] text-base mb-1">Importez l'image du ticket</h4>
                    <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                      Sélectionnez le fichier image du ticket (format PNG, JPG) pour procéder à la vérification instantanée.
                    </p>
                  </div>
                  <label className="w-full btn-primary h-12 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20 text-sm">
                    Choisir un fichier image
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleFileImport}
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {/* Loading state */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-semibold text-neutral-500">Validation en cours...</p>
            </div>
          )}

          {/* Error view */}
          {error && (
            <div className="mt-4 p-6 bg-red-50 rounded-2xl border border-red-100 flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                <IconAlertTriangle size={24} />
              </div>
              <div>
                <h4 className="font-bold text-red-800 mb-1">Erreur de scan</h4>
                <p className="text-sm text-red-600 leading-relaxed">{error}</p>
              </div>
              <button 
                onClick={resetAfterResult} 
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-2xl transition-all shadow-md shadow-red-200 cursor-pointer"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Success / Failure Result view */}
          {scanResult && (
            <div className="mt-4 text-left">
              {scanResult.success ? (
                // SUCCESS
                <div className="space-y-6">
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center gap-3 text-green-700">
                    <IconCircleCheckFilled size={28} className="text-green-600 shrink-0" />
                    <div>
                      <p className="font-bold text-green-800">Ticket validé avec succès</p>
                      <p className="text-xs text-green-600">Le statut a été mis à jour à "Utilisé".</p>
                    </div>
                  </div>

                  {/* Reservation Card Details */}
                  {reservation && (
                    <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-4 animate-in fade-in duration-500">
                      <h4 className="font-bold text-[#0f2318] text-base border-b border-neutral-200 pb-2">
                        {reservation.terrains?.nom}
                      </h4>
                      
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-neutral-600 text-sm">
                          <IconUser size={18} className="text-neutral-400" />
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Joueur</p>
                            <p className="font-bold text-[#0f2318]">{reservation.joueur_nom}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-neutral-600 text-sm">
                          <IconCalendar size={18} className="text-neutral-400" />
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Date</p>
                            <p className="font-bold text-[#0f2318]">{new Date(reservation.date_slot).toLocaleDateString('fr-FR')}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-neutral-600 text-sm">
                          <IconClock size={18} className="text-neutral-400" />
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Créneau</p>
                            <p className="font-bold text-[#0f2318]">
                              {reservation.heure_slot?.slice(0, 5)} — {String(parseInt(reservation.heure_slot?.slice(0, 2)) + reservation.duree_heures).padStart(2, '0')}:00
                            </p>
                          </div>
                        </div>

                        {reservation.terrains?.quartier && (
                          <div className="flex items-center gap-3 text-neutral-600 text-sm">
                            <IconMapPin size={18} className="text-neutral-400" />
                            <div>
                              <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Adresse</p>
                              <p className="font-bold text-[#0f2318]">{reservation.terrains.quartier}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={resetAfterResult}
                    className="w-full py-4 bg-[#1A7A4A] hover:bg-[#1A7A4A]/90 active:scale-95 text-white font-bold rounded-2xl shadow-lg transition-all text-center block cursor-pointer"
                  >
                    {isMobile ? 'Scanner un autre ticket' : 'Valider un autre ticket'}
                  </button>
                </div>
              ) : (
                // FAILURE
                <div className="space-y-6">
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3 text-red-700">
                    <IconAlertTriangle size={28} className="text-red-600 shrink-0" />
                    <div>
                      <p className="font-bold text-red-800">Échec de validation</p>
                      <p className="text-xs text-red-600">{scanResult.message}</p>
                    </div>
                  </div>

                  {scanResult.used_at && (
                    <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-sm text-neutral-600 text-center font-medium">
                      Déjà scanné le {new Date(scanResult.used_at).toLocaleString('fr-FR')}
                    </div>
                  )}

                  <button 
                    onClick={resetAfterResult}
                    className="w-full py-4 bg-neutral-800 hover:bg-neutral-900 active:scale-95 text-white font-bold rounded-2xl shadow-lg transition-all text-center block cursor-pointer"
                  >
                    {isMobile ? 'Scanner un autre ticket' : 'Valider un autre ticket'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Import Ticket Option for Mobile (as secondary option) */}
          {!scanResult && isMobile && (
            <div className="mt-6 pt-6 border-t border-neutral-100 text-center animate-in fade-in duration-500">
              <p className="text-xs text-neutral-400 font-semibold mb-3">Une erreur de caméra ?</p>
              <label className="inline-flex items-center justify-center gap-2 border-2 border-dashed border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 font-bold px-6 py-3.5 rounded-2xl cursor-pointer transition-all w-full text-sm">
                <IconUpload size={18} />
                Importer une image de ticket
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileImport}
                />
              </label>
            </div>
          )}
        </div>
      </div>
      {/* Hidden helper element for file scanning */}
      <div id="reader-file-helper" className="hidden"></div>
    </div>
  );
};
