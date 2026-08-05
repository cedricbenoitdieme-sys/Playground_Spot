import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  IconMessageChatbot, 
  IconX, 
  IconSend, 
  IconRobot, 
  IconUserShield, 
  IconBuildingStore,
  IconChevronDown,
  IconCircleFilled,
  IconArrowLeft,
  IconChevronRight,
  IconChecks
} from '@tabler/icons-react';
import { useUser } from '../context/UserContext';
import { fetchTerrains } from '../services/terrains';
import { supabase } from '../lib/supabase';
import * as amplitude from '@amplitude/unified';

export const ChatWidget = ({ currentView }) => {
  const { currentUser } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  const hasBottomNav = !!currentUser && !['terrain-detail', 'booking-flow', 'reservation-detail', 'dashboard'].includes(currentView);
  const hasStickyAction = currentView === 'terrain-detail';
  const hasStickyBottomBar = hasBottomNav || hasStickyAction;
  const [activeChannel, setActiveChannel] = useState('bot'); // 'bot', 'admin', 'gerant'
  const [terrains, setTerrains] = useState([]);
  const [selectedTerrainId, setSelectedTerrainId] = useState(null);
  const [adminId, setAdminId] = useState(null);
  const [showTerrainDropdown, setShowTerrainDropdown] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  
  // Real-time states
  const [messages, setMessages] = useState([]);
  const [inboxList, setInboxList] = useState([]); 
  const [activeConversationUserId, setActiveConversationUserId] = useState(null); 
  const [activeConversationUserName, setActiveConversationUserName] = useState('');
  
  // Typing indicators
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const broadcastChannelRef = useRef(null);

  // Local bot conversation history
  const [botMessages, setBotMessages] = useState([
    { id: 1, sender: 'bot', text: `Salut Capitaine ${currentUser?.nom || ''} ! ⚽ Je suis ton assistant virtuel. Pose-moi tes questions sur les terrains, tarifs, Wave, Orange Money ou réservations !`, time: '14:00' }
  ]);
  const [isBotTyping, setIsBotTyping] = useState(false);

  const messagesEndRef = useRef(null);
  const selectedTerrain = terrains.find(t => t.id === selectedTerrainId) || terrains[0];
  const isAdmin = currentUser?.role === 'admin';
  const isGerant = currentUser?.role === 'gerant';
  const isStaff = isAdmin || isGerant;

  const [plansInfo, setPlansInfo] = useState([]);

  // Charge les plans pour les abonnements gérant
  useEffect(() => {
    if (!isOpen) return;
    supabase.from('plan_limits').select('plan_id, nom, prix_mensuel, prix_annuel, commission_rate').order('prix_mensuel')
      .then(({ data }) => setPlansInfo(data || []))
      .catch(() => {});
  }, [isOpen]);

  // Lock body scroll when chat modal is open on mobile/desktop
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Charge les vrais terrains (pour le sélecteur "canal Gérant") et l'ID du vrai
  // compte admin (pour router les messages du canal "Admin"), une fois à l'ouverture.
  useEffect(() => {
    if (!isOpen || terrains.length > 0) return;
    fetchTerrains().then(data => {
      setTerrains(data);
      if (data.length > 0) setSelectedTerrainId(data[0].id);
    }).catch(() => {});
    supabase.from('profiles_public').select('id').eq('role', 'admin').limit(1).maybeSingle()
      .then(({ data }) => { if (data) setAdminId(data.id); })
      .catch(() => {});
  }, [isOpen, terrains.length]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, botMessages, isBotTyping, isOtherUserTyping, activeChannel, selectedTerrainId, activeConversationUserId]);

  // Load and Subscribe to real-time chat messages
  useEffect(() => {
    if (!currentUser || !isOpen) return;

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: true });
        
        if (!error && data) {
          setMessages(data);
        }
      } catch (err) {
        console.warn("DB offline or missing table, falling back to simulation.");
      }
    };

    loadMessages();

    // Subscribe to INSERT and UPDATE (for read status updates)
    const channel = supabase
      .channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        // Mark as read if we are actively viewing this conversation
        if (payload.new.receiver_id === currentUser.id && payload.new.sender_id === activeConversationUserId) {
          markMessagesAsRead(payload.new.sender_id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, payload => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, currentUser, activeConversationUserId]);

  const hasInboxOnThisChannel = 
    (activeChannel === 'admin' && isAdmin) ||
    (activeChannel === 'gerant' && isGerant);

  // Real-time Typing and Inbox logic
  useEffect(() => {
    if (!currentUser || !isOpen) return;

    // Filter inbox conversations list
    const updateInbox = () => {
      const conversationsMap = {};
      messages.forEach(msg => {
        const otherUserId = msg.sender_id === currentUser.id 
          ? msg.receiver_id 
          : msg.receiver_id === currentUser.id 
          ? msg.sender_id 
          : msg.sender_id;
        
        if (!otherUserId) return;

        // Filter message channels for current active channel inbox
        if (activeChannel === 'admin' && isAdmin) {
          if (msg.channel !== 'admin') return;
        } else if (activeChannel === 'gerant' && isGerant) {
          if (msg.channel !== 'gerant') return;
        } else {
          return;
        }

        const unreadCount = messages.filter(m => 
          m.sender_id === otherUserId && 
          m.receiver_id === currentUser.id && 
          !m.is_read
        ).length;

        conversationsMap[otherUserId] = {
          userId: otherUserId,
          userName: msg.sender_id === currentUser.id ? (msg.receiver_name || 'Utilisateur') : msg.sender_name,
          lastMessage: msg.text,
          unread: unreadCount,
          timestamp: new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        };
      });
      setInboxList(Object.values(conversationsMap));
    };

    updateInbox();
  }, [messages, currentUser, isOpen, isAdmin, isGerant, activeChannel]);

  // Handle Real-time Typing Broadcast
  useEffect(() => {
    if (!currentUser || !isOpen) return;

    const roomId = activeConversationUserId || 'global_room';
    broadcastChannelRef.current = supabase.channel(`typing:${roomId}`);

    broadcastChannelRef.current
      .on('broadcast', { event: 'typing' }, payload => {
        if (payload.payload.userId !== currentUser.id) {
          setIsOtherUserTyping(payload.payload.isTyping);
        }
      })
      .subscribe();

    return () => {
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
      }
    };
  }, [activeConversationUserId, isOpen, currentUser]);

  // Mark messages as read
  const markMessagesAsRead = async (senderId) => {
    if (!senderId || !currentUser) return;
    try {
      await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('sender_id', senderId)
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (activeConversationUserId && isOpen) {
      markMessagesAsRead(activeConversationUserId);
    }
  }, [activeConversationUserId, isOpen, messages]);

  // Handle User Input Typing Events
  const handleTyping = () => {
    if (!broadcastChannelRef.current || !currentUser) return;

    broadcastChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, isTyping: true }
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id, isTyping: false }
      });
    }, 1500);
  };

  const [chatError, setChatError] = useState(null);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    setChatError(null);

    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const userMsg = { id: Date.now(), sender: 'user', text: inputMessage, time };

    // Amplitude Event: Chat Message Sent
    amplitude.track('Message Chat Envoyé', {
      canal: activeChannel,
      longueurMessage: inputMessage.length
    });

    // Bot Response Logic
    if (activeChannel === 'bot') {
      setBotMessages(prev => [...prev, userMsg]);
      setIsBotTyping(true);
      setInputMessage('');

      setTimeout(() => {
        const lowerText = inputMessage.toLowerCase();
        
        // Checklist of valid SaaS keywords
        const saasKeywords = [
          'foot', 'terrain', 'match', 'réserv', 'reserv', 'prix', 'tarif', 'slot', 'creneau', 'créneau',
          'wave', 'orange', 'money', 'dakar', 'admin', 'gérant', 'gerant', 'ticket', 'scan', 'cgu',
          'confidentialité', 'cédric', 'cedric', 'pay', 'carte', 'heures', 'planning', 'sport', 'ballon',
          'capitaine', 'joueur', 'aide', 'support', 'contact', 'almadies', 'plateau', 'mermoz', 'yoff', 'ouakam',
          'valid', 'approuv', 'statut terrain', 'en attente', 'boost', 'visibilité', 'sponsor', 'mettre en avant',
          'abonnement', 'plan', 'forfait', 'free', 'starter', 'entreprise', 'plan pro', 'humain', 'parler à quelqu\'un', 'mon compte', 'mon paiement'
        ];

        const isRelated = saasKeywords.some(keyword => lowerText.includes(keyword));
        const disclaimer = "";
        let replyText = '';

        if (!isRelated) {
          replyText = disclaimer + "Désolé, je suis un assistant dédié exclusivement à la plateforme PlaygroundSpot. Je ne peux répondre qu'aux questions concernant la réservation de terrains de football, les paiements (Wave/OM) et le fonctionnement de notre SaaS. Si besoin, vous pouvez échanger directement avec notre équipe via l'onglet 'Admin' !";
        } else {
          if (lowerText.includes('valid') || lowerText.includes('approuv') || lowerText.includes('statut terrain') || lowerText.includes('en attente')) {
            replyText = disclaimer + "Quand vous créez votre fiche terrain, elle passe automatiquement en 'en attente' le temps qu'un admin la valide — elle n'est pas visible des joueurs ni réservable pendant ce temps. Si elle est refusée, vous verrez le motif écrit par l'admin et pourrez corriger et resoumettre. Une fois approuvée, vous pouvez modifier votre fiche (photos, tarif...) librement, sans redéclencher de validation. ⚽";
          } else if (lowerText.includes('boost') || lowerText.includes('visibilité') || lowerText.includes('sponsor') || lowerText.includes('mettre en avant')) {
            replyText = disclaimer + "Le Budget Visibilité permet de faire remonter votre terrain dans les résultats de recherche, en allouant un budget pour une durée choisie — réservé aux plans Starter, Pro et Entreprise (pas disponible sur Free). Vous trouverez ça dans l'onglet 'Budget Visibilité' de votre espace gérant !";
          } else if (lowerText.includes('abonnement') || lowerText.includes('plan') || lowerText.includes('forfait') || lowerText.includes('free') || lowerText.includes('starter') || lowerText.includes('entreprise') || lowerText.includes('plan pro')) {
            if (plansInfo.length > 0) {
              const plansSummary = plansInfo.map(p => {
                const formattedPrice = p.prix_mensuel === 0 ? 'Gratuit' : `${p.prix_mensuel.toLocaleString()} FCFA/mois`;
                return `• ${p.nom} : ${formattedPrice} (${p.commission_rate}% commission)`;
              }).join('\n');
              replyText = disclaimer + `Voici nos 4 plans gérants disponibles :\n${plansSummary}\nRetrouvez tous les détails et gérez votre formule directement depuis l'onglet 'Mon Abonnement' !`;
            } else {
              replyText = disclaimer + "Nos 4 plans gérants (Free, Starter, Pro et Entreprise) permettent d'adapter vos fonctionnalités et taux de commission. Consultez l'onglet 'Mon Abonnement' pour choisir votre formule !";
            }
          } else if (lowerText.includes('humain') || lowerText.includes('parler à') || lowerText.includes('mon compte') || lowerText.includes('mon paiement')) {
            replyText = disclaimer + "Je suis à votre disposition Capitaine ! Si votre question porte sur votre compte ou une réservation précise, ou si je ne peux pas vous aider, basculez sur l'onglet 'Admin' ci-dessus pour parler directement à notre équipe support.";
          } else if (lowerText.includes('prix') || lowerText.includes('tarif')) {
            replyText = disclaimer + "Les tarifs de nos terrains partenaires à Dakar varient de 8 000 FCFA à 18 000 FCFA par heure selon le quartier et les équipements. Vous pouvez consulter les fiches détaillées dans l'onglet 'Découverte'.";
          } else if (lowerText.includes('wave') || lowerText.includes('orange') || lowerText.includes('payer') || lowerText.includes('paiement')) {
            replyText = disclaimer + "PlaygroundSpot prend en charge les paiements sécurisés via Wave et Orange Money. Une fois votre réservation validée par le gérant, vous recevez un ticket numérique avec un code QR d'accès.";
          } else if (lowerText.includes('annul') || lowerText.includes('rembours')) {
            replyText = disclaimer + "Pour annuler un créneau, rendez-vous dans 'Mes Réservations'. Si l'annulation est faite plus de 24h avant, les autres joueurs sur liste d'attente sont immédiatement notifiés de la libération du créneau.";
          } else if (lowerText.includes('ouakam')) {
            replyText = disclaimer + "Le Ouakam Soccer Center propose un terrain synthétique 5v5 haut de gamme à 18 000 FCFA/h avec vestiaires, éclairage et sécurité. N'hésitez pas à le réserver !";
          } else if (lowerText.includes('reserv') || lowerText.includes('réserv') || lowerText.includes('comment reserver') || lowerText.includes('comment réserver')) {
            replyText = disclaimer + "Pour réserver un terrain, allez dans l'onglet 'Découverte', sélectionnez le terrain souhaité, puis choisissez une date et un créneau horaire disponible. Cliquez ensuite sur 'Réserver' et suivez les instructions pour payer via Wave ou Orange Money. Un ticket numérique vous sera généré !";
          } else {
            replyText = disclaimer + "Je suis à votre disposition Capitaine ! Si votre question porte sur votre compte ou une réservation précise, ou si je ne peux pas vous aider, basculez sur l'onglet 'Admin' ci-dessus pour parler directement à notre équipe support.";
          }
        }

        setBotMessages(prev => [...prev, { id: Date.now() + 1, sender: 'bot', text: replyText, time }]);
        setIsBotTyping(false);
      }, 1500);
      return;
    }

    // Real DB Message Insertion
    try {
      const payload = {
        sender_id: currentUser.id,
        sender_name: currentUser.role === 'admin' ? "L'Administrateur" : (currentUser.role === 'gerant' ? 'Le Gérant' : currentUser.nom),
        text: inputMessage,
        channel: activeChannel,
        is_read: false
      };

      if (activeChannel === 'admin' && !isAdmin) {
        // Joueur OU gérant qui écrit à l'admin
        payload.receiver_id = adminId;
      } else if (hasInboxOnThisChannel) {
        // Admin répondant sur le canal admin, ou gérant répondant sur le canal gérant
        payload.receiver_id = activeConversationUserId;
        if (isGerant && activeChannel === 'gerant') payload.terrain_id = selectedTerrain?.id;
      } else {
        // Joueur écrivant à un gérant précis
        payload.terrain_id = selectedTerrain?.id;
        payload.receiver_id = selectedTerrain?.gerant_id || null;
      }

      const { data, error } = await supabase.from('chat_messages').insert(payload).select().single();
      if (error) throw error;

      if (data) {
        setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
      }
    } catch (err) {
      console.error("Erreur envoi message chat:", err);
      setChatError("Le message n'a pas pu être envoyé. Vérifie ta connexion et réessaie.");
      setTimeout(() => setChatError(null), 5000);
    }

    setInputMessage('');
  };

  const getDisplayMessages = () => {
    if (activeChannel === 'bot') return botMessages;
    
    if (hasInboxOnThisChannel) {
      if (!activeConversationUserId) return [];
      return messages.filter(msg => 
        (msg.sender_id === currentUser.id && msg.receiver_id === activeConversationUserId) ||
        (msg.sender_id === activeConversationUserId && msg.receiver_id === currentUser.id)
      );
    }

    // Player perspective OR Gerant contacting Admin
    if (activeChannel === 'admin') {
      return messages.filter(msg => 
        msg.channel === 'admin' && 
        (msg.sender_id === currentUser.id || msg.receiver_id === currentUser.id)
      );
    } else {
      return messages.filter(msg => 
        msg.channel === 'gerant' && 
        msg.terrain_id === selectedTerrain?.id && 
        (msg.sender_id === currentUser.id || msg.receiver_id === currentUser.id)
      );
    }
  };

  // ── Docking & Retraction States (Ancrage fixe bas-coin, pas de Y libre) ──
  const [dockSide, setDockSide] = useState(() => localStorage.getItem('playgroundspot-chat-dock-side') || 'right');
  const [isRetracted, setIsRetracted] = useState(() => localStorage.getItem('playgroundspot-chat-retracted') === 'true');
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, hasMoved: false });
  const buttonRef = useRef(null);

  // Nettoyage impératif de la clé dock-y pour purger les anciennes positions legacy
  useEffect(() => {
    localStorage.removeItem('playgroundspot-chat-dock-y');
  }, []);

  // Persistence uniquement du côté et de l'état rétracté
  useEffect(() => {
    localStorage.setItem('playgroundspot-chat-dock-side', dockSide);
    localStorage.setItem('playgroundspot-chat-retracted', isRetracted.toString());
  }, [dockSide, isRetracted]);

  // Handlers pour le Drag latéral (Gauche / Droite) et Clic
  const handlePointerDown = (e) => {
    if (isOpen) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      hasMoved: false
    };

    const handlePointerMove = (moveEvent) => {
      const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const deltaX = Math.abs(currentX - dragRef.current.startX);
      const deltaY = Math.abs(currentY - dragRef.current.startY);

      if (deltaX > 5 || deltaY > 5) {
        if (!dragRef.current.hasMoved) {
          dragRef.current.hasMoved = true;
          setIsDragging(true);
          if (isRetracted) setIsRetracted(false);
        }

        // Bascule automatique du côté (gauche / droite) selon la position X
        const windowWidth = window.innerWidth;
        if (currentX < windowWidth / 2) {
          setDockSide('left');
        } else {
          setDockSide('right');
        }
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);

      setTimeout(() => setIsDragging(false), 50);

      if (!dragRef.current.hasMoved) {
        if (isRetracted) {
          setIsRetracted(false);
        } else {
          setIsOpen(true);
        }
      } else {
        // En fin de geste latéral, on rétracte délicatement sur le bord choisi
        setIsRetracted(true);
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  const displayMessages = getDisplayMessages();

  // Positionnement dynamique du bouton flottant et de la fenêtre de chat
  const unreadBadgeCount = messages.filter(m => m.receiver_id === currentUser?.id && !m.is_read).length;

  return (
    <>
      {/* Floating Button (Ancré en coin bas, au-dessus des barres fixes) */}
      {!isOpen && (
        <div 
          ref={buttonRef}
          className={`fixed z-[9990] font-sans transition-all duration-300 ease-out select-none ${
            hasStickyBottomBar ? 'bottom-20 lg:bottom-6' : 'bottom-6'
          } ${isDragging ? 'transition-none cursor-grabbing' : ''}`}
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            ...(dockSide === 'left' 
              ? { left: isRetracted ? '-38px' : '16px' } 
              : { right: isRetracted ? '-38px' : '16px' }
            )
          }}
        >
          <div className="relative group">
            <button
              onMouseDown={handlePointerDown}
              onTouchStart={handlePointerDown}
              className={`w-14 h-14 rounded-full bg-primary hover:bg-primary-dark text-white flex items-center justify-center shadow-2xl shadow-primary/40 transition-all cursor-grab active:cursor-grabbing ${
                isRetracted ? 'opacity-70 hover:opacity-100 scale-90' : 'hover:scale-105 active:scale-95'
              }`}
              title={isRetracted ? "Cliquer pour déployer le chatbot" : "Glisser latéralement / Clic pour ouvrir"}
            >
              <div className="relative pointer-events-none">
                <IconMessageChatbot size={26} />
                {unreadBadgeCount > 0 && !isRetracted && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse shadow-md">
                    {unreadBadgeCount}
                  </span>
                )}
              </div>
            </button>
            {/* Petite poignée indicative quand rétracté */}
            {isRetracted && (
              <div className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white/40 rounded-full animate-pulse ${
                dockSide === 'left' ? 'right-1' : 'left-1'
              }`} />
            )}
          </div>
        </div>
      )}

      {/* Chat Window Modal (Rendered via Portal for Perfect Viewport Containment) */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          {/* Backdrop Blur Overlay & Body Scroll Lock */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Centered Safe-Area Respecting Modal Window */}
          <div 
            className="relative bg-white w-full max-w-[400px] h-[calc(100dvh-32px)] max-h-[640px] rounded-[2rem] shadow-2xl border border-black/10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 z-10"
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)'
            }}
          >
            {/* Header */}
            <div className="bg-[#0F2318] text-white p-4 flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-2">
                {hasInboxOnThisChannel && activeConversationUserId && (
                  <button 
                    onClick={() => { setActiveConversationUserId(null); }}
                    className="mr-1 p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <IconArrowLeft size={18} />
                  </button>
                )}
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white shrink-0">
                  <IconMessageChatbot size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm font-display truncate max-w-[160px]">
                    {hasInboxOnThisChannel && activeConversationUserId ? activeConversationUserName : 'PlaygroundSpot Chat'}
                  </h4>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <IconCircleFilled size={6} className="text-emerald-400 animate-pulse" /> 
                    {isOtherUserTyping ? 'En train d\'écrire...' : 'En ligne'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-white/80 hover:text-white"
                title="Fermer la discussion"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Channel Selector */}
            {(!hasInboxOnThisChannel || !activeConversationUserId) && (
              <div className="flex bg-[#0A1810]/5 p-1.5 gap-1 shrink-0 border-b border-gray-100">
                <button
                  onClick={() => { setActiveChannel('bot'); setShowTerrainDropdown(false); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    activeChannel === 'bot' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <IconRobot size={14} />
                  <span>Assistant AI</span>
                </button>
                
                <button
                  onClick={() => { setActiveChannel('admin'); setShowTerrainDropdown(false); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    activeChannel === 'admin' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <IconUserShield size={14} />
                  <span>Support Admin</span>
                </button>

                <div className="relative flex-1">
                  <button
                    onClick={() => {
                      if (terrains.length > 0) {
                        setActiveChannel('gerant');
                        setShowTerrainDropdown(!showTerrainDropdown);
                      }
                    }}
                    className={`w-full flex items-center justify-center gap-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeChannel === 'gerant' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <IconBuildingStore size={14} />
                    <span className="truncate max-w-[55px]">{selectedTerrain?.nom || 'Gérant'}</span>
                    <IconChevronDown size={12} />
                  </button>

                  {/* Terrain Dropdown Menu */}
                  {showTerrainDropdown && activeChannel === 'gerant' && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                      {terrains.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTerrainId(t.id);
                            setShowTerrainDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 flex items-center justify-between ${
                            t.id === selectedTerrainId ? 'text-primary bg-primary/5' : 'text-gray-700'
                          }`}
                        >
                          <span className="truncate">{t.nom}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Conversation Inbox View (For Staff) */}
            {hasInboxOnThisChannel && !activeConversationUserId ? (
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                  Discussions Récentes ({inboxList.length})
                </div>
                {inboxList.length > 0 ? (
                  inboxList.map(chat => (
                    <button
                      key={chat.userId}
                      onClick={() => {
                        setActiveConversationUserId(chat.userId);
                        setActiveConversationUserName(chat.userName);
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-between border border-transparent hover:border-gray-100 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {chat.userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-xs text-gray-900 truncate">{chat.userName}</h5>
                            {chat.unreadCount > 0 && (
                              <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.2 rounded-full">
                                {chat.unreadCount}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 truncate">{chat.lastMessage}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="text-[9px] text-gray-400 font-semibold">{chat.timestamp}</span>
                        <IconChevronRight size={16} className="text-gray-300" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-400 text-xs">
                    Aucun message reçu pour le moment.
                  </div>
                )}
              </div>
            ) : (
              <>
                {activeChannel === 'bot' && (
                  <div className="bg-amber-50 text-amber-700 text-[10px] py-1.5 px-3 border-b border-amber-100 flex items-center justify-center gap-1.5 shrink-0 shadow-sm z-10">
                    <span>⚠️</span> Je suis un assistant IA et je peux faire des erreurs.
                  </div>
                )}
                {chatError && (
                  <div className="bg-red-50 text-red-700 text-[10px] py-2 px-3 border-b border-red-100 flex items-center justify-between shrink-0 shadow-sm z-10 animate-in fade-in">
                    <span>{chatError}</span>
                    <button onClick={() => setChatError(null)} className="font-bold text-red-500 ml-2">✕</button>
                  </div>
                )}
                {/* Message History */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-4 no-scrollbar">
                  {displayMessages.map((msg) => {
                    const isUser = msg.sender_id ? (msg.sender_id === currentUser.id) : (msg.sender === 'user');
                    const senderDisplayName = msg.sender_id ? msg.sender_name : (isUser ? 'Moi' : 'Assistant');
                    
                    return (
                      <div key={msg.id || Math.random()} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                        {!isUser && (
                          <span className="text-[9px] text-gray-400 font-bold ml-1 mb-1">{senderDisplayName}</span>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm relative ${
                          isUser 
                            ? 'bg-primary text-white rounded-tr-none' 
                            : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                        }`}>
                          <p className="leading-relaxed break-words">{msg.text}</p>
                          
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className={`block text-[8px] ${isUser ? 'text-white/60' : 'text-gray-400'}`}>
                              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : msg.time}
                            </span>
                            {isUser && msg.id && (
                              <IconChecks 
                                size={12} 
                                className={msg.is_read ? 'text-secondary font-bold' : 'text-white/40'} 
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Simulated/Real-time Typing Animation */}
                  {(isBotTyping || isOtherUserTyping) && (
                    <div className="flex flex-col items-start animate-in fade-in duration-200">
                      <span className="text-[9px] text-gray-400 font-bold ml-1 mb-1">
                        {isBotTyping ? 'Assistant' : activeConversationUserName}
                      </span>
                      <div className="bg-[#0A1810]/5 border border-gray-100 text-gray-800 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input Form */}
                <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-100 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      handleTyping();
                    }}
                    placeholder="Saisir un message..."
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all focus:bg-white font-medium"
                  />
                  <button
                    type="submit"
                    className="bg-primary hover:bg-primary-dark text-white p-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <IconSend size={16} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
