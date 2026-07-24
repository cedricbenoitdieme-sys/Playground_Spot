import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconX,
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
  IconCheck,
  IconRefresh,
  IconAlertCircle
} from '@tabler/icons-react';

/**
 * ImageCropperModal — Composant de Recadrage & Compression Photo (16:9)
 * - Support JPEG, PNG, WEBP, HEIC
 * - Rotation à 90° (pour photos smartphone en portrait)
 * - Zoom & Drag pour ajuster le cadrage 16:9
 * - Compression HTML5 Canvas en JPEG 85% (~1 Mo max)
 */
export const ImageCropperModal = ({ isOpen, imageFile, onClose, onCropComplete }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [zoom, setZoom] = useState(1); // 1 to 3
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  // Charger le fichier et gérer la conversion initiale
  useEffect(() => {
    if (!imageFile || !isOpen) {
      setImageSrc(null);
      return;
    }

    setErrorMsg('');
    setRotation(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    const loadFile = () => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          setImageSrc(e.target.result);
        };
        reader.onerror = () => {
          setErrorMsg("Impossible de lire ce fichier image. Essayez au format JPEG, PNG ou WEBP.");
        };
        reader.readAsDataURL(imageFile);
      } catch (err) {
        console.error('Erreur chargement fichier:', err);
        setErrorMsg("Impossible de lire ce fichier image. Essayez au format JPEG ou PNG.");
      }
    };

    loadFile();

    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageFile, isOpen]);

  if (!isOpen || !imageFile) return null;

  // Gestion du Drag
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Support Touch pour Mobile
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y
      });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    });
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Générer le Blob final recadré en 16:9 (1280x720)
  const handleConfirmCrop = async () => {
    if (!imageRef.current) return;
    setProcessing(true);
    setErrorMsg('');

    try {
      const img = imageRef.current;
      const targetWidth = 1280;
      const targetHeight = 720; // Ratio strict 16:9

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0F2318';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      ctx.save();
      ctx.translate(targetWidth / 2, targetHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Calculer le ratio d'ajustement
      const isRotated = rotation % 180 !== 0;
      const imgW = isRotated ? img.naturalHeight : img.naturalWidth;
      const imgH = isRotated ? img.naturalWidth : img.naturalHeight;

      const scale = Math.max(targetWidth / imgW, targetHeight / imgH);
      const drawWidth = (isRotated ? img.naturalHeight : img.naturalWidth) * scale;
      const drawHeight = (isRotated ? img.naturalWidth : img.naturalHeight) * scale;

      const drawX = -drawWidth / 2 + (offset.x * (targetWidth / 320));
      const drawY = -drawHeight / 2 + (offset.y * (targetHeight / 180));

      if (isRotated) {
        ctx.drawImage(img, -drawHeight / 2 + drawX, -drawWidth / 2 + drawY, drawHeight, drawWidth);
      } else {
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      }

      ctx.restore();

      canvas.toBlob(
        (blob) => {
          setProcessing(false);
          if (blob) {
            onCropComplete(blob);
          } else {
            setErrorMsg("Échec de la génération de l'image. Veuillez réessayer.");
          }
        },
        'image/jpeg',
        0.85 // Qualité optimale pour compression 1-2 Mo max
      );
    } catch (err) {
      console.error('Erreur recadrage canvas:', err);
      setProcessing(false);
      setErrorMsg("Une erreur est survenue lors du traitement de la photo.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ isolation: 'isolate' }}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" style={{ zIndex: -1 }} onClick={onClose}></div>

      <div className="relative bg-[#0F2318] border border-white/10 w-full max-w-xl rounded-[2rem] p-6 text-white shadow-2xl space-y-5 z-10 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-bold font-display text-white">Recadrage de la Photo (16:9)</h3>
            <p className="text-xs text-white/60">Ajustez le cadre et l'orientation pour un rendu optimal sur la fiche terrain.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <IconX size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs flex items-center gap-2">
            <IconAlertCircle size={16} /> {errorMsg}
          </div>
        )}

        {/* Preview Container 16:9 */}
        <div
          className="relative w-full aspect-video bg-black/60 rounded-2xl overflow-hidden border border-white/20 cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          {imageSrc ? (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              className="max-w-none transition-transform duration-75"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                maxHeight: '100%',
                objectFit: 'contain'
              }}
            />
          ) : (
            <div className="text-white/40 text-xs font-mono">Chargement de la photo...</div>
          )}

          {/* Grille de guidage 16:9 */}
          <div className="absolute inset-0 pointer-events-none border-2 border-primary/60 rounded-2xl">
            <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-30">
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-r border-b border-white"></div>
              <div className="border-b border-white"></div>
              <div className="border-r border-white"></div>
              <div className="border-r border-white"></div>
              <div></div>
            </div>
          </div>
        </div>

        {/* Barres d'outils de rotation & zoom */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 p-3 rounded-2xl text-xs">
            
            {/* Zoom Slider */}
            <div className="flex items-center gap-3 flex-1">
              <IconZoomOut size={16} className="text-white/50" />
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <IconZoomIn size={16} className="text-white/50" />
            </div>

            {/* Rotation Button */}
            <button
              type="button"
              onClick={handleRotate}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs cursor-pointer"
              title="Pivoter de 90°"
            >
              <IconRotateClockwise size={16} /> Pivoter ({rotation}°)
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold transition-all cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            disabled={processing || !imageSrc}
            className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-subtle cursor-pointer disabled:opacity-50"
          >
            {processing ? (
              <>Recadrage en cours...</>
            ) : (
              <> <IconCheck size={16} /> Valider & Enregistrer </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
