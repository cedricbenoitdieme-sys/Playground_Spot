import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconStarFilled, 
  IconMapPin, 
  IconBrandWhatsapp, 
  IconChevronLeft,
  IconTrophy,
  IconUsers,
  IconParking,
  IconBulb,
  IconClock,
  IconShieldCheck,
  IconShare,
  IconCheck,
  IconBrandInstagram,
  IconBrandSnapchat,
  IconLink,
  IconX
} from '@tabler/icons-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

export const TerrainDetail = ({ terrain, onBack, onBook }) => {
  const [toast, setToast] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [ratingInput, setRatingInput] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewsList, setReviewsList] = useState([
    { id: 1, name: 'Amadou Diallo', initials: 'AD', rating: 5, text: "Meilleur terrain du quartier. L'éclairage est top pour les matchs de nuit !", date: '12/05/2026' }
  ]);

  const bookingWidgetRef = useRef(null);
  const [isWidgetVisible, setIsWidgetVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsWidgetVisible(entry.isIntersecting);
      },
      {
        root: null, // viewport
        threshold: 0.1, // trigger when 10% visible
      }
    );

    if (bookingWidgetRef.current) {
      observer.observe(bookingWidgetRef.current);
    }

    return () => {
      if (bookingWidgetRef.current) {
        observer.unobserve(bookingWidgetRef.current);
      }
    };
  }, []);

  if (!terrain) return null;

  const customIcon = L.divIcon({
    html: `<div class="w-8 h-8 bg-primary rounded-full border-2 border-white shadow-lg"></div>`,
    className: 'custom-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleShare = () => {
    setShowShareModal(true);
  };

  const shareUrl = `https://playgroundspot.com/terrains/${terrain.id}`;

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`, '_blank');
    setShowShareModal(false);
  };

  const shareInstagram = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Lien copié, colle-le dans ta story Instagram');
      setShowShareModal(false);
    });
  };

  const shareSnapchat = () => {
    window.open(`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareUrl)}`, '_blank');
    setShowShareModal(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Lien copié dans le presse-papier !');
      setShowShareModal(false);
    });
  };

  const handleSubmitReview = (e) => {
    e.preventDefault();
    if (ratingInput === 0) {
      showToast('Veuillez sélectionner une note.');
      return;
    }
    const newReview = {
      id: Date.now(),
      name: 'Vous',
      initials: 'V',
      rating: ratingInput,
      text: reviewText,
      date: new Date().toLocaleDateString('fr-FR')
    };
    setReviewsList([newReview, ...reviewsList]);
    setRatingInput(0);
    setHoverRating(0);
    setReviewText('');
    showToast('Avis publié avec succès !');
  };

  return (
    <div className="flex-1 bg-background overflow-y-auto pb-32 lg:pb-12 px-4 lg:px-8 py-6 relative">
      {/* Navigation Header */}
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-primary-dark font-bold hover:text-primary transition-colors active:scale-95"
        >
          <IconChevronLeft size={20} />
          Retour à la recherche
        </button>
        <div className="flex gap-2">
          <button 
            onClick={handleShare}
            className="p-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
          >
            <IconShare size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Media & Info */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Gallery Placeholder */}
          <div className="relative rounded-3xl overflow-hidden aspect-[16/9] shadow-lg group">
            <img 
              src={terrain.image} 
              alt={terrain.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute top-4 left-4 bg-primary/90 backdrop-blur-md px-4 py-2 rounded-xl text-white font-bold shadow-lg">
              {terrain.surface}
            </div>
          </div>

          {/* Core Info */}
          <div className="bg-white p-8 rounded-card shadow-subtle border border-black/5">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-primary-dark">{terrain.name}</h1>
                <div className="flex items-center gap-2 text-gray-500 font-medium mt-1">
                  <IconMapPin size={18} className="text-primary" />
                  {terrain.quartier}, Dakar
                </div>
              </div>
              <div className="flex items-center gap-2 bg-secondary/10 px-4 py-2 rounded-2xl">
                <IconStarFilled className="text-secondary" size={20} />
                <span className="font-bold text-secondary text-lg">{terrain.rating}</span>
                <span className="text-secondary/60 text-sm font-medium">({reviewsList.length} avis)</span>
              </div>
            </div>

            {/* Quick Specs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary">
                  <IconTrophy size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Format</p>
                  <p className="font-bold text-sm text-primary-dark">{terrain.size}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary">
                  <IconUsers size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Joueurs</p>
                  <p className="font-bold text-sm text-primary-dark">10-14 max</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary">
                  <IconBulb size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Lumière</p>
                  <p className="font-bold text-sm text-primary-dark">Inclus</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary">
                  <IconClock size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Horaires</p>
                  <p className="font-bold text-sm text-primary-dark">08:00 - 00:00</p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-bold text-primary-dark mb-3">Description</h3>
              <p className="text-gray-600 leading-relaxed">
                Situé au cœur de {terrain.quartier}, le {terrain.name} offre une expérience de jeu exceptionnelle sur un terrain de type {terrain.surface}. Parfait pour des matchs entre amis ou des compétitions locales. Nos installations sont régulièrement entretenues pour garantir votre confort et votre sécurité.
              </p>
            </div>
          </div>

          {/* Amenities & Map Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-card shadow-subtle border border-black/5">
              <h3 className="font-bold text-primary-dark mb-4">Équipements</h3>
              <div className="grid grid-cols-2 gap-4">
                {terrain.amenities.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-700 text-sm font-medium">
                    <IconShieldCheck size={18} className="text-primary" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-card shadow-subtle border border-black/5 h-[300px]">
              <MapContainer 
                center={[terrain.lat, terrain.lng]} 
                zoom={14} 
                className="h-full w-full rounded-2xl z-0"
                dragging={false}
                zoomControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[terrain.lat, terrain.lng]} icon={customIcon} />
              </MapContainer>
            </div>
          </div>

          {/* Reviews Section */}
          <div className="bg-white p-8 rounded-card shadow-subtle border border-black/5">
            <h3 className="font-bold text-primary-dark mb-6">Avis Clients</h3>
            
            {/* Add Review Form */}
            <form onSubmit={handleSubmitReview} className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <h4 className="text-sm font-bold text-primary-dark uppercase tracking-widest mb-4">Laissez votre avis</h4>
              <div className="flex gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingInput(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 focus:outline-none transition-transform hover:scale-110"
                  >
                    <IconStarFilled 
                      size={28} 
                      className={`${(hoverRating || ratingInput) >= star ? 'text-secondary' : 'text-gray-300'}`} 
                    />
                  </button>
                ))}
              </div>
              <textarea 
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Partagez votre expérience sur ce terrain..."
                className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 ring-primary/20 transition-all mb-4 min-h-[100px]"
                required
              />
              <button type="submit" className="btn-primary px-8">Publier l'avis</button>
            </form>

            <div className="space-y-6">
              {reviewsList.map((review) => (
                <div key={review.id} className="pb-6 border-b border-gray-50 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-bold text-secondary border border-secondary/20">
                        {review.initials}
                      </div>
                      <div>
                        <span className="font-bold text-primary-dark block">{review.name}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{review.date}</span>
                      </div>
                    </div>
                    <div className="flex text-secondary gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <IconStarFilled key={s} size={14} className={s <= review.rating ? 'text-secondary' : 'text-gray-200'} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">{review.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Booking Widget */}
        <div className="space-y-6">
          <div ref={bookingWidgetRef} className="bg-white p-8 rounded-card shadow-subtle border-2 border-primary sticky top-24">
            <div className="mb-6">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">À partir de</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-display font-bold text-primary-dark">{terrain.price.toLocaleString('fr-FR')} FCFA</span>
                <span className="text-gray-500 font-medium">/heure</span>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <button 
                onClick={onBook}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/30 transition-all transform hover:-translate-y-1 active:translate-y-0"
              >
                Réserver maintenant
              </button>
              
              <a 
                href={`https://api.whatsapp.com/send?phone=221770000000&text=Bonjour, je souhaite réserver le terrain ${terrain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 border-2 border-primary/20 text-primary font-bold py-4 rounded-2xl hover:bg-primary/5 transition-all"
              >
                <IconBrandWhatsapp size={20} />
                Contacter le gérant
              </a>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-gray-400 uppercase tracking-wider">Disponibilité</span>
                <span className="text-green-500 bg-green-50 px-2 py-0.5 rounded">Aujourd'hui</span>
              </div>
              <div className="flex items-center gap-2">
                <IconClock size={16} className="text-gray-400" />
                <span className="text-sm text-gray-600 font-medium italic">Confirmation instantanée</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Button - Placed at bottom-0 since BottomNav is hidden */}
      {!isWidgetVisible && (
        <div 
          className="lg:hidden fixed left-0 right-0 p-4 bg-white border-t border-gray-100 z-[60] flex items-center justify-between gap-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] animate-in fade-in slide-in-from-bottom-10 duration-300"
          style={{
            bottom: 'env(safe-area-inset-bottom)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Total</p>
            <p className="font-bold text-primary-dark">{terrain.price.toLocaleString('fr-FR')} FCFA</p>
          </div>
          <button 
            onClick={() => onBook()}
            className="flex-1 bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-transform h-12 flex items-center justify-center relative z-[70]"
          >
            Réserver
          </button>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setShowShareModal(false)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-sm mx-auto rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-lg text-primary-dark">Partager le terrain</h3>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-primary-dark p-2 bg-gray-50 rounded-full transition-colors">
                <IconX size={20} />
              </button>
            </div>
            <div className="p-4 space-y-2 pb-safe">
              <button onClick={shareWhatsApp} className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors min-h-[48px]">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#25D366' }}>
                  <IconBrandWhatsapp size={20} className="text-white" />
                </div>
                <span className="font-bold text-gray-700">WhatsApp</span>
              </button>
              <button onClick={shareInstagram} className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors min-h-[48px]">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E1306C' }}>
                  <IconBrandInstagram size={20} className="text-white" />
                </div>
                <span className="font-bold text-gray-700">Instagram</span>
              </button>
              <button onClick={shareSnapchat} className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors min-h-[48px]">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFFC00' }}>
                  <IconBrandSnapchat size={20} className="text-black" />
                </div>
                <span className="font-bold text-gray-700">Snapchat</span>
              </button>
              <button onClick={copyLink} className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors min-h-[48px]">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100">
                  <IconLink size={20} className="text-gray-600" />
                </div>
                <span className="font-bold text-gray-700">Copier le lien</span>
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-36 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[100]">
          <IconCheck size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};
