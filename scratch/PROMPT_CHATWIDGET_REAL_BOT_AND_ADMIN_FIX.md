# Prompt — Brancher le vrai chatbot Gemini + corriger l'inbox admin (ChatWidget.jsx)

## Contexte

`src/components/ChatWidget.jsx` gère déjà 3 canaux (bot/admin/gerant) avec
un vrai système temps réel sur `chat_messages` (Supabase Realtime,
indicateurs de frappe). Deux choses à corriger/brancher, backend déjà prêt :

1. Le canal "bot" est aujourd'hui un `if/else` sur mots-clés codé en dur
   (`handleSendMessage`, bloc `if (activeChannel === 'bot') { ... }`,
   avec un `setTimeout` qui simule un délai de frappe). Aucune IA
   n'est réellement appelée. Une vraie Edge Function existe maintenant :
   **`chatbot-query`** (déployée séparément, voir doc secrets ci-dessous).

2. Bug dans la boîte de réception admin (`updateInbox()`, ~ligne 116-152) :
   le regroupement des conversations utilise
   `const otherUserId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;`
   — cette logique suppose que `currentUser` (l'admin qui regarde) est
   toujours l'une des deux parties du message. Faux pour une conversation
   `gérant↔client` (channel `'gerant'`) : l'admin n'est ni `sender_id` ni
   `receiver_id`, donc `otherUserId` tombe toujours sur `msg.sender_id`
   (le gérant), peu importe qui est le vrai destinataire — deux
   conversations distinctes d'un même gérant avec deux clients différents
   se retrouvent fusionnées sous une seule entrée dans l'inbox admin.

## Tâche 1 — Brancher `chatbot-query` sur le canal bot

Remplacer le bloc `if (activeChannel === 'bot') { ... }` dans
`handleSendMessage` (actuellement un `setTimeout` + `if/else` sur
mots-clés) par un vrai appel à l'Edge Function :

```js
if (activeChannel === 'bot') {
  setBotMessages(prev => [...prev, userMsg]);
  setIsBotTyping(true);
  setInputMessage('');

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const history = botMessages
      .filter(m => m.id !== 1) // exclure le message d'accueil initial
      .map(m => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/chatbot-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ message: inputMessage, history })
    });
    const result = await res.json();

    const replyText = res.ok
      ? result.reply
      : (result.error || "Désolé, je n'ai pas pu répondre. Réessaie, ou passe sur l'onglet Admin pour un support humain.");

    setBotMessages(prev => [...prev, { id: Date.now() + 1, sender: 'bot', text: replyText, time }]);
  } catch (err) {
    console.error('Erreur appel chatbot-query:', err);
    setBotMessages(prev => [...prev, { id: Date.now() + 1, sender: 'bot', text: "Désolé, une erreur réseau m'empêche de répondre. Réessaie, ou passe sur l'onglet Admin.", time }]);
  } finally {
    setIsBotTyping(false);
  }
  return;
}
```

`handleSendMessage` doit devenir `async` (elle ne l'est pas actuellement).
`SUPABASE_FUNCTIONS_URL` : construire depuis l'URL Supabase du projet
(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1`) — vérifier comment
les autres appels à des Edge Functions du projet construisent déjà cette
URL (s'il y a un pattern existant ailleurs dans `src/`, le réutiliser
plutôt que d'en inventer un nouveau).

Le token d'auth est optionnel côté fonction (elle accepte les appels
anonymes), mais l'envoyer quand une session existe permet un meilleur
rate-limiting côté serveur (par utilisateur plutôt que par IP).

## Tâche 2 — Corriger le regroupement des conversations dans l'inbox admin

Dans `updateInbox()`, la clé de regroupement doit identifier une
conversation par la **paire** (sender_id, receiver_id) normalisée, pas
juste "l'autre partie par rapport à moi" :

```js
const updateInbox = () => {
  const conversationsMap = {};
  messages.forEach(msg => {
    if (!msg.sender_id || !msg.receiver_id) return;

    // Clé de conversation = paire (sender, receiver) triée, indépendante
    // de qui regarde (admin, gérant ou l'un des deux participants).
    const pairKey = [msg.sender_id, msg.receiver_id].sort().join('::');

    const unreadCount = messages.filter(m =>
      [m.sender_id, m.receiver_id].sort().join('::') === pairKey &&
      m.receiver_id === currentUser.id &&
      !m.is_read
    ).length;

    // Pour l'affichage, on veut quand même savoir "qui parle à qui" :
    const otherUserId = msg.sender_id === currentUser.id ? msg.receiver_id
      : msg.receiver_id === currentUser.id ? msg.sender_id
      : msg.sender_id; // vue admin (spectateur) : affiche l'expéditeur d'origine par défaut

    conversationsMap[pairKey] = {
      pairKey,
      participantIds: [msg.sender_id, msg.receiver_id],
      userId: otherUserId, // gardé pour compat avec le code existant qui ouvre une conversation par userId
      userName: msg.sender_name,
      lastMessage: msg.text,
      unread: unreadCount,
      timestamp: new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };
  });
  setInboxList(Object.values(conversationsMap));
};
```

⚠️ Ce changement de clé (`pairKey` au lieu de `userId` seul) a un impact
sur `getDisplayMessages()` (qui filtre par `activeConversationUserId`
seul aujourd'hui) et sur le clic dans l'inbox (`setActiveConversationUserId(chat.userId)`).
Pour une vue admin correcte, il faut probablement stocker aussi
`activeConversationPairKey` (ou les deux ids des participants) plutôt que
juste un `userId`, et adapter `getDisplayMessages()` pour filtrer par la
paire complète quand l'admin regarde une conversation entre DEUX AUTRES
personnes (ni l'un ni l'autre n'étant `currentUser.id`). Vérifie l'usage
actuel de `activeConversationUserId` dans tout le fichier avant de
changer sa signification, pour ne rien casser côté gérant/joueur (eux,
`msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id`
reste correct puisqu'ils sont toujours une des deux parties).

## Secrets à déclarer (backend déjà déployable, pas encore configuré)

```
supabase secrets set GEMINI_API_KEY=...
```
(`GEMINI_MODEL` optionnel, défaut `gemini-2.0-flash` si non défini.)

Puis déployer :
```
supabase functions deploy chatbot-query
```

## Contraintes

- Aucune nouvelle migration nécessaire pour ces deux tâches — tout est
  déjà en place côté DB (`supabase/migrations/20260724130000_chat_fixes_and_bot_knowledge.sql`,
  policy UPDATE + notifications + `bot_knowledge_base`).
- Ne pas toucher au canal "gerant" ni à la logique de sélection de
  terrain — hors périmètre.
- Le disclaimer "⚠️ Je suis un assistant IA et je peux faire des erreurs"
  déjà affiché au-dessus du canal bot reste pertinent, à garder.
