import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Header } from '../components/Header';
import { 
  IconActivity, 
  IconTicket, 
  IconMessageCircle, 
  IconScan, 
  IconCheck, 
  IconX,
  IconFilter,
  IconFileTypePdf,
  IconDownload
} from '@tabler/icons-react';
import { exportCSV, exportPDFReport } from '../utils/exportReports';
import { CustomAlertModal } from '../components/CustomAlertModal';

export const Telemetrie = ({ setView }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('live'); // 'live', '24h', '48h', '7j', '30j'

  // Alert modal
  const [alertConfig, setAlertConfig] = useState(null);
  const showAlert = (title, message, type = 'info') => {
    setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
  };

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        let dateLimit = null;
        const now = new Date();
        
        switch (timeRange) {
          case '24h': dateLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '48h': dateLimit = new Date(now.getTime() - 48 * 60 * 60 * 1000); break;
          case '7j': dateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
          case '30j': dateLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
          case 'live':
          default:
            dateLimit = null; // Just fetch the latest 20
        }

        let resQuery = supabase
          .from('reservations')
          .select('id, created_at, joueur_nom, terrain_nom, statut, montant, scan_at')
          .order('created_at', { ascending: false });
          
        let chatQuery = supabase
          .from('chat_messages')
          .select('id, created_at, sender_name, channel, text')
          .order('created_at', { ascending: false });

        if (dateLimit) {
          const isoLimit = dateLimit.toISOString();
          resQuery = resQuery.gte('created_at', isoLimit).limit(200);
          chatQuery = chatQuery.gte('created_at', isoLimit).limit(200);
        } else {
          resQuery = resQuery.limit(20);
          chatQuery = chatQuery.limit(20);
        }

        const [{ data: resData }, { data: chatData }] = await Promise.all([
          resQuery,
          chatQuery
        ]);

        const formattedRes = (resData || []).map(r => ({
          id: `res-${r.id}`,
          type: 'reservation',
          time: new Date(r.created_at),
          title: 'Nouvelle Réservation',
          description: `${r.joueur_nom} a réservé ${r.terrain_nom} (${(r.montant || 0).toLocaleString('fr-FR')} FCFA)`,
          status: r.statut,
          icon: IconTicket,
          color: 'bg-primary',
          textColor: 'text-primary'
        }));

        const formattedScans = (resData || [])
          .filter(r => r.scan_at)
          .map(r => {
            const scanDate = new Date(r.scan_at);
            // Si on filtre par date, le scan_at doit aussi être dans la limite
            if (dateLimit && scanDate < dateLimit) return null;
            return {
              id: `scan-${r.id}`,
              type: 'scan',
              time: scanDate,
              title: 'Ticket Scanné',
              description: `Le ticket de ${r.joueur_nom} a été validé pour ${r.terrain_nom}`,
              icon: IconScan,
              color: 'bg-blue-500',
              textColor: 'text-blue-500'
            };
          }).filter(Boolean);

        const formattedChats = (chatData || []).map(c => ({
          id: `chat-${c.id}`,
          type: 'chat',
          time: new Date(c.created_at),
          title: 'Message Envoyé',
          description: `${c.sender_name} via le canal ${c.channel}`,
          icon: IconMessageCircle,
          color: 'bg-purple-500',
          textColor: 'text-purple-500'
        }));

        const allEvents = [...formattedRes, ...formattedScans, ...formattedChats]
          .sort((a, b) => b.time - a.time)
          .slice(0, dateLimit ? 300 : 50);

        setEvents(allEvents);
      } catch (error) {
        console.error('Erreur chargement télémétrie:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();

    if (timeRange !== 'live') return; // Ne s'abonner au live que si le filtre est "live"

    // Subscriptions for real-time updates
    const resSubscription = supabase.channel('public:reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, payload => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new;
          const newEvt = {
            id: `res-${r.id}`,
            type: 'reservation',
            time: new Date(r.created_at),
            title: 'Nouvelle Réservation',
            description: `${r.joueur_nom} a réservé ${r.terrain_id} pour ${r.montant} FCFA`,
            status: r.statut,
            icon: IconTicket,
            color: 'bg-primary',
            textColor: 'text-primary',
            isNew: true
          };
          setEvents(prev => [newEvt, ...prev].slice(0, 50));
        } else if (payload.eventType === 'UPDATE' && payload.new.scan_at && payload.old.scan_at !== payload.new.scan_at) {
          const r = payload.new;
          const newEvt = {
            id: `scan-${r.id}-${Date.now()}`,
            type: 'scan',
            time: new Date(r.scan_at),
            title: 'Ticket Scanné',
            description: `Un ticket a été validé (Réservation: ${r.id})`,
            icon: IconScan,
            color: 'bg-blue-500',
            textColor: 'text-blue-500',
            isNew: true
          };
          setEvents(prev => [newEvt, ...prev].slice(0, 50));
        }
      })
      .subscribe();

    const chatSubscription = supabase.channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const c = payload.new;
        const newEvt = {
          id: `chat-${c.id}`,
          type: 'chat',
          time: new Date(c.created_at),
          title: 'Message Envoyé',
          description: `${c.sender_name} via le canal ${c.channel}`,
          icon: IconMessageCircle,
          color: 'bg-purple-500',
          textColor: 'text-purple-500',
          isNew: true
        };
        setEvents(prev => [newEvt, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(resSubscription);
      supabase.removeChannel(chatSubscription);
    };
  }, [timeRange]);

  const ranges = [
    { id: 'live', label: 'En direct' },
    { id: '24h', label: '24H' },
    { id: '48h', label: '48H' },
    { id: '7j', label: '7 Jours' },
    { id: '30j', label: '30 Jours' }
  ];

  const handleExportCSV = () => {
    const headers = ['Horodatage', 'Type d\'Événement', 'Titre', 'Description', 'Statut'];
    const rows = events.map(e => [
      e.time ? new Date(e.time).toLocaleString('fr-FR') : 'N/A',
      (e.type || 'log').toUpperCase(),
      e.title,
      e.description,
      e.status || 'Actif'
    ]);
    exportCSV(`telemetrie_playgroundspot_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const handleExportPDF = () => {
    exportPDFReport({
      title: 'Rapport de Télémétrie & Logs Système',
      subtitle: `Période d'analyse: ${ranges.find(r => r.id === timeRange)?.label || timeRange} | Platform PlaygroundSpot Dakar`,
      onPopupBlocked: () => showAlert('Popups bloqués', "Veuillez autoriser les fenêtres surgissantes (popups) pour télécharger le rapport PDF.", 'error'),
      metadata: [
        { label: 'Total Événements Logs', value: `${events.length} enregistrement(s)` },
        { label: 'Filtre Temporel', value: ranges.find(r => r.id === timeRange)?.label || 'En Direct' },
        { label: 'Statut Système', value: '🟢 Opérationnel' }
      ],
      headers: ['Horodatage', 'Type', 'Événement / Titre', 'Description', 'Statut'],
      rows: events.map(e => [
        e.time ? new Date(e.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-',
        (e.type || 'log').toUpperCase(),
        e.title,
        e.description,
        e.status || 'OK'
      ]),
      summaryFooter: `Bilan Télémétrie Certifié — PlaygroundSpot Dakar (${events.length} événements)`
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <Header title="Télémétrie & Historique" setView={setView} onBack={() => setView('menu')} />
      
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {/* En-tête Statistique & Filtres */}
        <div className="bg-white rounded-2xl p-5 shadow-subtle border border-black/5 mb-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Flux d'Activité</h2>
              <p className="text-xs text-gray-500">
                {timeRange === 'live' ? 'Données en direct de la plateforme' : `Historique des ${ranges.find(r => r.id === timeRange)?.label.toLowerCase()}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {timeRange === 'live' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 rounded-full border border-green-100 mr-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
                </div>
              )}
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-all shadow-subtle cursor-pointer"
                title="Exporter en CSV"
              >
                <IconDownload size={14} /> CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all shadow-subtle cursor-pointer"
                title="Télécharger le bilan PDF"
              >
                <IconFileTypePdf size={14} /> PDF 📄
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <div className="flex items-center justify-center p-2 bg-gray-50 border border-gray-100 rounded-xl">
              <IconFilter size={16} className="text-gray-400" />
            </div>
            {ranges.map(range => (
              <button
                key={range.id}
                onClick={() => setTimeRange(range.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  timeRange === range.id 
                    ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl p-6 shadow-subtle border border-black/5">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <IconActivity size={32} className="text-gray-300 animate-pulse" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <IconActivity size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Aucune activité trouvée pour cette période.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-gray-100 ml-4 space-y-8">
              {events.map((evt, index) => (
                <div 
                  key={evt.id} 
                  className={`relative pl-8 animate-in fade-in slide-in-from-left-4 duration-500 ${evt.isNew && timeRange === 'live' ? 'bg-primary/5 -mx-4 px-4 py-2 rounded-r-xl border-l-2 border-primary -ml-[2px]' : ''}`}
                >
                  <div className={`absolute -left-[17px] top-0 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm ring-4 ring-white ${evt.color}`}>
                    <evt.icon size={14} />
                  </div>
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={`text-sm font-bold ${evt.textColor}`}>{evt.title}</h4>
                      <span className="text-[10px] font-bold text-gray-400">
                        {evt.time.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} à {evt.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{evt.description}</p>
                    
                    {evt.status && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                        {evt.status === 'confirmee' ? <IconCheck size={10} className="text-green-500"/> : evt.status === 'annulee' ? <IconX size={10} className="text-red-500"/> : null}
                        {evt.status}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modale d'alerte */}
      {alertConfig && <CustomAlertModal {...alertConfig} />}
    </div>
  );
};
