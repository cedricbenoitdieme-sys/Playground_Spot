# Prompt — Faire fonctionner correctement les 3 canaux de messagerie (ChatWidget.jsx)

⚠️ Ce prompt **remplace** `PROMPT_CHATWIDGET_REAL_BOT_AND_ADMIN_FIX.md` —
la partie "brancher Gemini" de cet ancien prompt est abandonnée (décision
prise : le canal Bot reste à mots-clés, cf. `PROMPT_ENRICH_KEYWORD_BOT.md`
séparément). Ce prompt-ci ne concerne QUE la messagerie humaine
(Admin/Gérant), pas le canal Bot.

## Contexte / diagnostic exact

`src/components/ChatWidget.jsx` gère la messagerie humaine via la table
`chat_messages` (déjà en place, RLS déjà correcte pour n'importe quelle
paire expéditeur/destinataire, aucune contrainte SQL sur `channel` —
**zéro changement de base de données nécessaire pour les tâches 1 à 4**).

⚠️ Mise à jour : `chat_messages` (et `notifications`) viennent d'être
ajoutées à la publication Realtime de Supabase (migration
`20260724140000_enable_realtime_chat_messages.sql`) — elles ne l'étaient
jamais avant, ce qui expliquait une "grosse latence" perçue (en réalité,
aucun événement temps réel ne se déclenchait du tout). Ce fix DB seul ne
suffit pas : voir Tâche 5 ci-dessous pour les corrections front qui vont
avec.

## Tâche 5 — Fiabilité de l'envoi (affichage instantané + erreurs visibles)

Même une fois Realtime activé côté DB, deux problèmes de conception
restent dans `handleSendMessage` (chemin "Real DB Message Insertion") :

1. **Pas d'affichage optimiste.** Le message envoyé n'est ajouté à
   l'écran QUE quand l'événement Realtime `INSERT` revient du serveur
   (aller-retour réseau complet). Pour une UX de chat normale, l'auteur
   doit voir son propre message apparaître **instantanément**, avant
   même la confirmation serveur. Ajouter le message au state local
   `messages` immédiatement après l'appel `.insert()` (ou même avant, de
   façon optimiste, avec un id temporaire remplacé par le vrai `id` au
   retour) :
   ```js
   const { data, error } = await supabase.from('chat_messages').insert(payload).select().single();
   if (error) throw error;
   setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
   ```
   Le check `prev.some(m => m.id === data.id)` évite un doublon si
   l'événement Realtime arrive quasi en même temps que la réponse de
   l'insert.

2. **Erreur avalée silencieusement.** Le `catch` actuel
   (`console.warn("Error sending message to DB.")`) ne montre RIEN à
   l'utilisateur — un message qui échoue à se sauvegarder (RLS, réseau,
   colonne manquante...) donne l'impression d'un envoi normal alors que
   rien n'est en base. Remplacer par un état d'erreur visible (toast ou
   bandeau, cohérent avec le style déjà utilisé ailleurs dans l'app pour
   les erreurs de formulaire) :
   ```js
   } catch (err) {
     console.error('Erreur envoi message chat:', err);
     setChatError("Le message n'a pas pu être envoyé. Vérifie ta connexion et réessaie.");
   }
   ```
   Afficher `chatError` (nouvel état) quelque part visible dans la
   fenêtre de chat, avec possibilité de le refermer/qu'il disparaisse
   après quelques secondes (même pattern que le `toast` déjà présent
   ailleurs dans l'app).

Trois flux sont attendus :
1. **Joueur ↔ Admin** (support) — ✅ fonctionne déjà.
2. **Joueur ↔ Gérant** (à propos d'un terrain) — ✅ fonctionne déjà.
3. **Gérant ↔ Admin** (signalement/support) — ❌ **n'existe pas dans l'UI**.

### Cause exacte du problème 3

Le sélecteur de canal conditionne l'affichage du bouton "Admin" à :
```js
{(isAdmin || !isStaff) && ( ... bouton Admin ... )}
```
Avec `isStaff = isAdmin || isGerant`, `!isStaff` n'est vrai que pour un
joueur. Un gérant (`isGerant === true`, donc `isStaff === true`) ne
remplit ni `isAdmin` ni `!isStaff` → le bouton "Admin" ne s'affiche
**jamais** pour un gérant. Il n'y a aucun moyen d'ouvrir ce canal.

Cause plus profonde : le code traite `isStaff` comme "cette personne voit
une boîte de réception (inbox) plutôt qu'une conversation directe" pour
**tous les canaux**, alors qu'en réalité ça dépend du **canal** :
- Sur le canal `'admin'`, c'est l'**admin** qui a une boîte de réception
  (il reçoit de plusieurs personnes). Tout le monde d'autre (joueur OU
  gérant) doit avoir une conversation directe 1-à-1 avec l'admin.
- Sur le canal `'gerant'`, c'est le **gérant** qui a une boîte de
  réception (il reçoit de plusieurs joueurs). Le joueur, lui, a une
  conversation directe avec un gérant précis (via le sélecteur de
  terrain déjà en place).

## Tâche 1 — Afficher le bouton "Admin" pour un gérant aussi

```js
{(isAdmin || isGerant || !isStaff) && ( ... bouton Admin ... )}
```
(= visible pour tout le monde sauf... en fait juste l'afficher toujours,
sauf peut-être quand on n'a pas encore résolu `adminId` — pas de raison
de le cacher à qui que ce soit.)

## Tâche 2 — Corriger la logique "inbox vs conversation directe" pour qu'elle dépende du canal, pas juste du rôle

Remplacer partout où le code décide "boîte de réception ou chat direct"
en fonction de `isStaff` seul, par une logique par canal :

```js
// Vrai seulement si CE rôle reçoit potentiellement de plusieurs personnes
// SUR CE canal précis — donc doit voir une boîte de réception plutôt
// qu'un chat direct.
const hasInboxOnThisChannel =
  (activeChannel === 'admin' && isAdmin) ||
  (activeChannel === 'gerant' && isGerant);
```
Remplacer les usages de `isStaff` qui décidaient de l'affichage
inbox/chat direct (le rendu conditionnel `{isStaff && activeChannel !== 'bot' && !activeConversationUserId ? (...) : (...)}`
et le `Channel Selector` qui cache le sélecteur de canal une fois une
conversation staff ouverte) par `hasInboxOnThisChannel`. `isStaff` reste
utile ailleurs (ex: différencier le nom affiché, la logique de saisie
`terrain_id`), ne le supprime pas partout, juste dans les branches qui
décidaient "inbox ou pas".

## Tâche 3 — Permettre à un gérant d'INITIER une conversation avec l'admin

Dans `handleSendMessage`, la branche actuelle :
```js
if (isStaff) {
  payload.receiver_id = activeConversationUserId;
  if (isGerant && activeChannel === 'gerant') payload.terrain_id = selectedTerrain.id;
} else {
  if (activeChannel === 'admin') {
    payload.receiver_id = adminId;
  } else {
    payload.terrain_id = selectedTerrain?.id;
    payload.receiver_id = selectedTerrain?.gerant_id || null;
  }
}
```
suppose qu'un membre "staff" (admin OU gérant) répond toujours à une
conversation déjà ouverte (`activeConversationUserId` déjà défini en
cliquant un item de l'inbox). Un gérant qui initie un NOUVEAU message
vers l'admin n'a pas encore de `activeConversationUserId` → `receiver_id`
partirait à `null`. Corriger en distinguant par canal, pas par rôle :

```js
if (activeChannel === 'admin' && !isAdmin) {
  // Joueur OU gérant qui écrit à l'admin : toujours vers adminId,
  // que ce soit une nouvelle conversation ou la suite d'une existante.
  payload.receiver_id = adminId;
} else if (hasInboxOnThisChannel) {
  // Admin répondant sur le canal admin, ou gérant répondant sur le
  // canal gérant : on répond à qui est actuellement ouvert dans l'inbox.
  payload.receiver_id = activeConversationUserId;
  if (isGerant && activeChannel === 'gerant') payload.terrain_id = selectedTerrain?.id;
} else {
  // Joueur écrivant à un gérant précis (canal gérant, sélecteur de terrain).
  payload.terrain_id = selectedTerrain?.id;
  payload.receiver_id = selectedTerrain?.gerant_id || null;
}
```
`adminId` est déjà résolu au montage (`useEffect` existant qui fait
`supabase.from('profiles').select('id').eq('role','admin').limit(1)`) —
le réutiliser tel quel, pas besoin d'un nouveau fetch.

## Tâche 4 — Corriger le regroupement des conversations dans l'inbox admin

Bug déjà identifié : `updateInbox()` calcule
`otherUserId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id`,
ce qui suppose que `currentUser` est toujours une des deux parties — faux
pour l'admin qui supervise une conversation gérant↔client dont il n'est
ni l'expéditeur ni le destinataire (si un jour l'admin doit aussi voir
CES conversations-là ; pour l'instant, l'admin ne voit que SES propres
conversations sur le canal `'admin'`, donc ce cas ne se présente pas
encore avec le fix ci-dessus — mais corrige quand même la robustesse de
la fonction pour ne pas se fier à `currentUser.id` sans vérifier :

```js
const otherUserId = msg.sender_id === currentUser.id
  ? msg.receiver_id
  : msg.receiver_id === currentUser.id
  ? msg.sender_id
  : msg.sender_id; // spectateur (ne devrait pas arriver avec le scope actuel)
```

## Plan de test (les 6 sens, à vérifier un par un dans l'app)

1. Joueur → Admin (nouveau message) → doit apparaître dans l'inbox Admin.
2. Admin → Joueur (réponse depuis l'inbox) → doit apparaître chez le joueur en temps réel.
3. Joueur → Gérant (via sélecteur de terrain) → doit apparaître dans l'inbox du bon gérant.
4. Gérant → Joueur (réponse depuis l'inbox) → doit apparaître chez le joueur.
5. **Gérant → Admin (nouveau message, le cas qui ne marchait pas)** → doit apparaître dans l'inbox Admin, distinct des messages joueurs.
6. Admin → Gérant (réponse) → doit apparaître chez le gérant, sur son onglet "Admin" (pas "Gérant").

Pour chaque sens : vérifier aussi que le badge de messages non lus se
met à jour côté destinataire, et qu'une notification est bien créée
(table `notifications`, déjà déclenchée automatiquement par le trigger
SQL existant `trg_notify_new_chat_message`).

## Contraintes

- Aucune migration SQL nécessaire.
- Ne pas toucher au canal "bot".
- Vérifier que `isStaff` reste correctement utilisé ailleurs dans le
  fichier (nom affiché, etc.) — seules les branches "inbox vs chat
  direct" changent de critère.
