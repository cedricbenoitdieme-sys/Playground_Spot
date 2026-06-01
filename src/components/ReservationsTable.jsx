import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchRecentReservations } from '../services/stats';
import { updateReservationStatut } from '../services/reservations';
import { 
  IconChevronRight, 
  IconX, 
  IconCalendar, 
  IconClock, 
  IconMapPin, 
  IconUser,
  IconPhone,
  IconBrandWhatsapp,
  IconCheck,
  IconTrash,
  IconInfoCircle,
  IconLoader2
} from '@tabler/icons-react';

export const ReservationsTable = () => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRes, setSelectedRes] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadReservations();
  }, []);

  const loadReservations = async () => {
    try {
      setLoading(true);
      const data = await fetchRecentReservations(15);
      setReservations(data);
    } catch (err) {
      console.error('Erreur chargement réservations:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const getStatusStyles = (status) => {
    switch (status) {
      case 'Confirmée': return 'bg-status-confirmed/10 text-status-confirmed border-status-confirmed/20';
      case 'En attente': return 'bg-status-pending/10 text-status-pending border-status-pending/20';
      case 'Terminée': return 'bg-status-completed/10 text-status-completed border-status-completed/20';
      case 'Annulée': return 'bg-status-cancelled/10 text-status-cancelled border-status-cancelled/20';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleConfirm = async (id) => {
    try {
      await updateReservationStatut(id, 'confirmee');
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'Confirmée' } : r));
      setSelectedRes(prev => prev && prev.id === id ? { ...prev, status: 'Confirmée' } : prev);
      showToast("Réservation confirmée avec succès !");
    } catch (err) {
      showToast("Erreur : " + err.message);
    }
  };

  const handleCancel = async (id) => {
    try {
      await updateReservationStatut(id, 'annulee');
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'Annulée' } : r));
      setSelectedRes(prev => prev && prev.id === id ? { ...prev, status: 'Annulée' } : prev);
      showToast("Réservation annulée.");
    } catch (err) {
      showToast("Erreur : " + err.message);
    }
  };

  const handleContact = (res) => {
    showToast(`Appel / WhatsApp lancé vers ${res.player}`);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-card shadow-subtle border border-black/5 p-12 flex items-center justify-center gap-3 text-gray-400">
        <IconLoader2 size={20} className="animate-spin" />
        <span className="text-sm font-medium">Chargement des réservations...</span>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-card shadow-subtle border border-black/5 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary-dark tracking-tight">Réservations Récentes</h3>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Temps réel</span>
        </div>

        <div className="overflow-x-auto">
          {/* Mobile view (stacked cards) */}
          <div className="md:hidden divide-y divide-gray-50">
            {reservations.map((res, index) => (
              <div 
                key={res.id} 
                onClick={() => setSelectedRes(res)}
                className="p-4 hover:bg-gray-50/80 cursor-pointer transition-all active:bg-gray-100"
                style={{ 
                  animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                  animationDelay: `${index * 0.06}s`
                }}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-primary-dark text-sm">{res.terrain}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm inline-flex items-center justify-center transition-all ${getStatusStyles(res.status)}`}>
                    {res.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-secondary-light flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-secondary border border-secondary/10">
                      {res.player?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <span className="font-semibold text-gray-600">{res.player}</span>
                  </div>
                  <span className="font-bold text-primary-dark">{res.amount}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-2 font-medium">{res.slot}</div>
              </div>
            ))}
          </div>

          {/* Desktop view (table) */}
          <table className="w-full hidden md:table">
            <thead>
              <tr>
                <th className="admin-table-header pl-6">Terrain</th>
                <th className="admin-table-header">Joueur</th>
                <th className="admin-table-header">Créneau</th>
                <th className="admin-table-header">Montant</th>
                <th className="admin-table-header pr-6 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reservations.map((res, index) => (
                <tr 
                  key={res.id} 
                  onClick={() => setSelectedRes(res)}
                  className="hover:bg-gray-50/80 cursor-pointer transition-all group"
                  style={{ 
                    animation: 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
                    animationDelay: `${index * 0.05}s`
                  }}
                >
                  <td className="admin-table-cell pl-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary-dark block truncate max-w-[150px]" title={res.terrain}>{res.terrain}</span>
                      <IconChevronRight size={14} className="text-primary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </div>
                  </td>
                  <td className="admin-table-cell py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-secondary-light flex-shrink-0 flex items-center justify-center text-xs font-bold text-secondary border border-secondary/10">
                        {res.player?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-semibold text-gray-800 truncate max-w-[120px]" title={res.player}>{res.player}</span>
                    </div>
                  </td>
                  <td className="admin-table-cell py-5">
                    <span className="text-gray-500 text-xs whitespace-nowrap font-medium">{res.slot}</span>
                  </td>
                  <td className="admin-table-cell py-5 font-bold text-primary-dark whitespace-nowrap">
                    {res.amount}
                  </td>
                  <td className="admin-table-cell py-5 pr-6 text-center">
                    <span className={`min-w-[100px] px-3 py-1.5 rounded-full text-[10px] font-bold shadow-sm inline-flex items-center justify-center transition-all ${getStatusStyles(res.status)}`}>
                      {res.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {reservations.length === 0 && !loading && (
            <div className="p-12 text-center text-gray-400 text-sm">
              Aucune réservation trouvée.
            </div>
          )}
        </div>
      </div>

      {/* Reservation Details Modal */}
      {selectedRes && createPortal(
        <div className="fixed inset-0 lg:left-64 z-[9999]">
          <div className="absolute inset-0 bg-primary-dark/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedRes(null)}></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto rounded-2xl shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300 no-scrollbar">
            <button onClick={() => setSelectedRes(null)} className="absolute top-4 right-4 text-gray-400 hover:text-primary-dark p-2 bg-gray-50 hover:bg-gray-100 rounded-full cursor-pointer">
              <IconX size={20} />
            </button>
            <div className="mb-6 pr-10 min-w-0">
              <h3 className="text-2xl font-display font-bold text-primary-dark tracking-tight mb-1 truncate whitespace-normal break-words">Détails Réservation</h3>
              <p className="text-xs text-gray-400 font-medium">ID: {selectedRes.id}</p>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center shrink-0"><IconUser size={20} /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Joueur</p>
                  <p className="font-bold text-primary-dark text-sm mt-0.5">{selectedRes.player}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><IconMapPin size={20} /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Terrain</p>
                  <p className="font-bold text-primary-dark text-sm mt-0.5">{selectedRes.terrain}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><IconClock size={20} /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Créneau & Montant</p>
                  <p className="font-bold text-primary-dark text-sm mt-0.5">{selectedRes.slot} • {selectedRes.amount}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="space-y-3">
              <div className="flex gap-3">
                {selectedRes.status !== 'Terminée' && selectedRes.status !== 'Annulée' && (
                  <button 
                    onClick={() => handleConfirm(selectedRes.id)}
                    className="flex-1 h-12 bg-primary text-white text-xs font-bold rounded-2xl shadow-lg shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform"
                  >
                    <IconCheck size={16} /> Confirmer
                  </button>
                )}
                {selectedRes.status !== 'Terminée' && selectedRes.status !== 'Annulée' && (
                  <button 
                    onClick={() => handleCancel(selectedRes.id)}
                    className="flex-1 h-12 bg-red-50 text-red-500 border border-red-100 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform"
                  >
                    <IconTrash size={16} /> Annuler
                  </button>
                )}
              </div>
              <button 
                onClick={() => handleContact(selectedRes)}
                className="w-full h-12 bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/20 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all hover:bg-[#25D366]/20"
              >
                <IconBrandWhatsapp size={18} /> Contacter le Joueur
              </button>
              <button 
                onClick={() => setSelectedRes(null)} 
                className="w-full h-12 text-gray-400 text-xs font-bold rounded-2xl cursor-pointer hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Simple Toast */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 z-[200]">
          <IconInfoCircle size={18} className="text-secondary" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </>
  );
};
