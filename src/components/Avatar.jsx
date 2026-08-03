import React from 'react';

/**
 * Avatar — Composant unifié d'affichage d'avatar utilisateur.
 * - Si `avatar` est une URL valide (http... ou /...), affiche l'image.
 * - Sinon, calcule et affiche les initiales de secours (fallback).
 */
export const Avatar = ({ 
  user, 
  avatar: customAvatar, 
  nom: customNom, 
  initiales: customInitiales,
  className = "w-10 h-10 rounded-full",
  textSize = "text-sm",
  bgClass = "bg-primary text-white"
}) => {
  const avatarUrl = customAvatar ?? user?.avatar;
  const nom = customNom ?? user?.nom ?? '';
  const initiales = customInitiales ?? user?.initiales ?? (nom ? nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '');

  const isValidUrl = typeof avatarUrl === 'string' && (avatarUrl.startsWith('http') || avatarUrl.startsWith('/'));

  if (isValidUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nom || 'Avatar'}
        className={`${className} object-cover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${className} ${bgClass} flex items-center justify-center font-black ${textSize} shrink-0 select-none`}
    >
      {initiales || '??'}
    </div>
  );
};
