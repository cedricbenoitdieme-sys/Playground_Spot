import React from 'react';
import { IconStarFilled, IconMapPin } from '@tabler/icons-react';
import { TerrainImage } from './TerrainImage';

export const TerrainCard = ({ terrain }) => {
  return (
    <div className="bg-white rounded-card overflow-hidden shadow-subtle hover:shadow-md transition-all duration-300 group cursor-pointer border border-black/5">
      {/* Image Container */}
      <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
        <TerrainImage
          terrainId={terrain.id}
          fallbackUrl={terrain.image || terrain.image_url}
          alt={terrain.name}
          iconSize={32}
          className="w-full h-full group-hover:scale-105 transition-transform duration-500"
        />

        {/* Overlay Badges */}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-primary-dark shadow-sm border border-black/5">
          {terrain.surface}
        </div>
        
        <div className="absolute bottom-3 left-3 bg-primary px-3 py-1.5 rounded-lg text-white font-bold text-xs shadow-lg">
          {terrain.price.toLocaleString('fr-FR')} FCFA /h
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-primary-dark truncate flex-1 mr-2">{terrain.name}</h3>
          <div className="flex items-center gap-1 text-xs font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded">
            <IconStarFilled size={12} />
            {terrain.rating}
          </div>
        </div>
        
        <div className="flex items-center gap-1 text-gray-400 text-xs mb-3 font-medium">
          <IconMapPin size={14} />
          {terrain.quartier}
        </div>

        <div className="flex items-center gap-2 mt-auto">
          {terrain.amenities.slice(0, 2).map((amenity, i) => (
            <span key={i} className="text-[10px] bg-gray-50 text-gray-500 px-2 py-1 rounded-md border border-gray-100">
              {amenity}
            </span>
          ))}
          {terrain.amenities.length > 2 && (
            <span className="text-[10px] text-gray-400 font-medium">+{terrain.amenities.length - 2}</span>
          )}
        </div>
      </div>
    </div>
  );
};
