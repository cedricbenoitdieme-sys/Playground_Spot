import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IconBallFootball } from '@tabler/icons-react';

// Custom Marker Icon Creator
const createCustomIcon = (isSelected = false) => {
  return L.divIcon({
    html: `
      <div class="relative w-10 h-10 flex items-center justify-center transition-all duration-300">
        <div class="absolute inset-0 ${isSelected ? 'bg-secondary' : 'bg-primary'} rounded-full shadow-lg border-2 border-white transform ${isSelected ? 'scale-110' : 'scale-100'}"></div>
        <div class="z-10 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path><path d="M12 7l4.76 3.45l-1.82 5.55l-5.88 0l-1.82 -5.55z"></path><path d="M12 7v-4"></path><path d="M16.76 10.45l2.84 -2.85"></path><path d="M14.94 16l2.06 3.45"></path><path d="M9.06 16l-2.06 3.45"></path><path d="M7.24 10.45l-2.84 -2.85"></path></svg>
        </div>
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 ${isSelected ? 'bg-secondary' : 'bg-primary'} rotate-45 border-r border-b border-white"></div>
      </div>
    `,
    className: 'custom-leaflet-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
};

export const MapDiscovery = ({ terrains, onSelect }) => {
  const center = [14.7167, -17.4677]; // Dakar center

  return (
    <div className="h-[calc(100vh-280px)] min-h-[500px] w-full rounded-card overflow-hidden shadow-subtle border border-black/5 z-0">
      <MapContainer 
        center={center} 
        zoom={12} 
        scrollWheelZoom={true} 
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="desaturated-map"
        />
        
        {terrains.map((terrain) => (
          <Marker 
            key={terrain.id} 
            position={[terrain.lat, terrain.lng]} 
            icon={createCustomIcon(false)}
          >
            <Popup className="custom-popup">
              <div className="p-2 min-w-[180px]">
                <img 
                  src={terrain.image} 
                  alt={terrain.name} 
                  className="w-full h-24 object-cover rounded-lg mb-2"
                />
                <h3 className="font-bold text-primary-dark text-sm mb-1">{terrain.name}</h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-primary font-bold text-xs">{terrain.price.toLocaleString('fr-FR')} FCFA</span>
                  <button 
                    onClick={() => onSelect(terrain)}
                    className="bg-primary text-white text-[10px] px-3 py-1 rounded-full font-bold"
                  >
                    Voir
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <style dangerouslySetInnerHTML={{ __html: `
        .desaturated-map {
          filter: grayscale(0.2) contrast(1.1) brightness(1.05);
        }
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }
        .custom-popup .leaflet-popup-content {
          margin: 0;
        }
        .leaflet-container {
          background: #F8F7F2;
        }
      `}} />
    </div>
  );
};
