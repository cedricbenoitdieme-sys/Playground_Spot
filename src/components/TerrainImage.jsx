import React, { useState, useEffect } from 'react';
import { IconBuildingStore } from '@tabler/icons-react';
import { getTerrainPrincipalPhotoUrl } from '../services/terrains';

/**
 * Affiche la photo principale d'un terrain avec fallback robuste anti-image brisée.
 * Résout une URL signée dynamic à la demande ou utilise le fallback.
 */
export const TerrainImage = ({ terrainId, fallbackUrl, alt = '', className = '', iconSize = 28 }) => {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [hasError, setHasError] = useState(false);

  const isValidUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined' || trimmed === '[object Object]') return false;
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    setHasError(false);

    const cleanFallback = isValidUrl(fallbackUrl) ? fallbackUrl.trim() : null;

    if (terrainId) {
      getTerrainPrincipalPhotoUrl(terrainId).then(url => { 
        if (!cancelled) {
          const validSigned = isValidUrl(url) ? url : null;
          const finalUrl = validSigned || cleanFallback;
          if (finalUrl) {
            setPhotoUrl(finalUrl);
          } else {
            setHasError(true);
          }
        }
      }).catch(() => {
        if (!cancelled) {
          if (cleanFallback) setPhotoUrl(cleanFallback);
          else setHasError(true);
        }
      });
    } else if (cleanFallback) {
      setPhotoUrl(cleanFallback);
    } else {
      setHasError(true);
    }

    return () => { cancelled = true; };
  }, [terrainId, fallbackUrl]);

  if (!photoUrl || hasError) {
    return (
      <div className={`bg-gradient-to-br from-[#0F2318] via-[#162D20] to-[#0A1810] flex flex-col items-center justify-center text-gray-300 gap-1.5 p-4 text-center select-none ${className}`}>
        <IconBuildingStore size={iconSize} className="text-primary/70" />
        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest truncate max-w-full">
          {alt || "Terrain d'élite"}
        </span>
      </div>
    );
  }

  return (
    <img 
      src={photoUrl} 
      alt={alt} 
      className={`object-cover ${className}`} 
      onError={() => setHasError(true)}
    />
  );
};
