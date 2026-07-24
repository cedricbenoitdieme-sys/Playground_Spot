import React, { useState, useEffect } from 'react';
import { IconPhoto } from '@tabler/icons-react';
import { getTerrainPrincipalPhotoUrl } from '../services/terrains';

/**
 * Affiche la photo principale d'un terrain. Le bucket terrain-photos est
 * privé (nécessaire pour cacher les photos d'un terrain 'pending') : il
 * n'y a jamais d'URL publique stable stockée en base — on résout une URL
 * signée à la demande à chaque montage. Pas de fallback vers une fausse
 * photo générique : une icône neutre si aucune photo n'existe/ne charge.
 */
export const TerrainImage = ({ terrainId, fallbackUrl, alt = '', className = '', iconSize = 24 }) => {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    setHasError(false);

    if (terrainId) {
      getTerrainPrincipalPhotoUrl(terrainId).then(url => { 
        if (!cancelled) {
          setPhotoUrl(url || fallbackUrl || null);
        }
      }).catch(() => {
        if (!cancelled) {
          if (fallbackUrl) setPhotoUrl(fallbackUrl);
          else setHasError(true);
        }
      });
    } else if (fallbackUrl) {
      setPhotoUrl(fallbackUrl);
    } else {
      setHasError(true);
    }

    return () => { cancelled = true; };
  }, [terrainId, fallbackUrl]);

  if (!photoUrl || hasError) {
    return (
      <div className={`bg-gradient-to-br from-primary-dark/10 via-primary/5 to-secondary/10 flex flex-col items-center justify-center text-primary-dark/40 ${className}`}>
        <IconPhoto size={iconSize} className="opacity-60" />
        <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">PlaygroundSpot</span>
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
