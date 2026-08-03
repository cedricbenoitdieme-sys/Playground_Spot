# PROMPT — Rendre réelles les notifications (préférences + cloche)

## Contexte

Le panneau "Notifications" de `Parametres.jsx` était purement décoratif
(toggles en `useState` local, jamais persistés, aucun événement câblé
côté backend). Diagnostic backend fait, migration
`supabase/migrations/20260803210000_real_notifications_gerant.sql`
appliquée, qui :

1. Ajoute `profiles.notification_prefs` (JSONB, clés :
   `nouvelleReservation`, `paiementRecu`, `alerteOccupation`,
   `rapportHebdo` — **pas** `nouvelGerant` ni `smsAlerte`, retirés du
   scope, voir plus bas).
2. Insère une vraie ligne dans `public.notifications` (la table qui existe
   déjà pour la validation de terrain, RLS déjà en place) pour :
   - Nouvelle réservation (trigger sur `INSERT reservations`)
   - Paiement reçu (hook dans `handle_unitech_webhook`, uniquement pour
     les paiements de réservation)
   - Alerte taux d'occupation (cron quotidien 18h, si <50% d'occupation
     du jour sur un terrain)
   - Rapport hebdomadaire (cron chaque lundi 8h, résumé 7 derniers jours)
   Chaque insertion respecte la préférence de l'utilisateur concerné
   (`notification_prefs->>'<clé>'`, défaut `true` sauf `alerteOccupation`
   qui défaute à `false`).

**Découverte critique en creusant l'affichage actuel** : `src/components/Header.jsx`
(la cloche 🔔) ne lit **jamais** la table `notifications` — son state
`notifications` (ligne 12) part de `[]` et n'est alimenté que par une
notification factice codée en dur (lignes 49-74, "rapport hebdomadaire
disponible" avec un lien `/api/reports/weekly` qui pointe probablement
vers un endpoint mort). Même les notifications de validation de terrain,
réellement écrites en base depuis le 23 juillet, ne s'affichent nulle
part. Sans corriger ça, les nouvelles notifications de ce prompt resteront
invisibles.

## Ta tâche

### 1. Retirer les deux toggles hors scope

Dans `Parametres.jsx`, section "Notifications" (le tableau mappé vers
`Row`/`Toggle`, autour de la ligne 290-301 selon la version actuelle) :
supprime les entrées `nouvelGerant` ("Nouveau gérant inscrit") et
`smsAlerte` ("Alertes SMS") du tableau affiché. Garde les 4 autres.

### 2. Persister réellement les préférences

Remplace le `useState({ nouvelleReservation: true, ... })` codé en dur
(ligne ~123) par un chargement depuis `currentUser.notification_prefs` —
déjà disponible sans rien changer côté requête : `getProfile()`
(`src/services/auth.js:205`) fait `select('*')`, donc la nouvelle colonne
remonte automatiquement dès que la migration est appliquée.

Au changement d'un toggle, persiste immédiatement (pas besoin d'un bouton
"Enregistrer" séparé, cohérent avec le comportement instantané des autres
toggles de la page comme "Mode maintenance") :
```jsx
const handleToggleNotif = async (key, value) => {
  setNotifs(prev => ({ ...prev, [key]: value }));
  try {
    await updateProfile(currentUser.id, {
      notification_prefs: { ...currentUser.notification_prefs, [key]: value }
    });
    setCurrentUser(prev => ({
      ...prev,
      notification_prefs: { ...prev.notification_prefs, [key]: value }
    }));
  } catch (err) {
    showToast(`❌ ${err.userMessage || err.message || 'Erreur de mise à jour'}`);
    setNotifs(prev => ({ ...prev, [key]: !value })); // rollback visuel
  }
};
```
Remplace `onChange={v => setNotifs(...)}` par `onChange={v => handleToggleNotif(key, v)}`
sur le `Toggle` des 4 lignes restantes.

### 3. Corriger la cloche pour lire les vraies notifications

Dans `Header.jsx` :
1. Supprime le `useEffect` factice (lignes 49-74, notification "rapport
   hebdomadaire" codée en dur avec `downloadUrl` vers `/api/reports/weekly`).
2. Remplace par un vrai fetch au montage (et idéalement un
   `useEffect` déclenché à chaque changement de `currentUser?.id`) :
   ```jsx
   useEffect(() => {
     if (!currentUser?.id) return;
     let cancelled = false;
     supabase
       .from('notifications')
       .select('*')
       .eq('user_id', currentUser.id)
       .order('created_at', { ascending: false })
       .limit(30)
       .then(({ data, error }) => {
         if (!cancelled && !error) setNotifications(data || []);
       });
     return () => { cancelled = true; };
   }, [currentUser?.id]);
   ```
   (Import `supabase` depuis `../lib/supabase` en haut du fichier si pas
   déjà présent.)
3. Adapte l'affichage (lignes ~210+) aux vraies colonnes de la table
   (`title`, `body`, `created_at`, `read` — pas `text`/`time`/`isReport`/
   `downloadUrl` qui n'existent que dans l'ancien format factice). Garde
   le rendu visuel actuel (mêmes classes CSS), change juste le mapping des
   champs :
   ```jsx
   {notifications.map((n) => (
     <div key={n.id} className={/* classes existantes, basées sur n.read au lieu de n.read (déjà pareil) */}>
       <p className="font-bold">{n.title}</p>
       <p className="text-xs text-gray-500">{n.body}</p>
       <p className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleString('fr-FR')}</p>
     </div>
   ))}
   ```
4. `markAllAsRead` (ligne ~85) doit persister en base, pas juste en state
   local :
   ```jsx
   const markAllAsRead = async () => {
     const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
     setNotifications(notifications.map(n => ({ ...n, read: true })));
     if (unreadIds.length > 0) {
       await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
     }
   };
   ```
   (La policy RLS `notifications_update_own_read_only` autorise déjà ce
   type d'UPDATE sur ses propres notifications — pas de RPC nécessaire.)
5. Optionnel mais cohérent avec le commentaire déjà présent dans la
   migration de la table (`"Realtime peut être activé dessus... pour du
   push en plus de la persistance"`) : ajoute un abonnement Realtime
   Supabase sur `notifications` filtré par `user_id=eq.<currentUser.id>`
   pour un rafraîchissement instantané, sur le même modèle que
   `usePaymentFlow.js` (déjà dans le projet, `supabase.channel(...).on('postgres_changes', ...)`).
   Pas bloquant si tu manques de temps — le fetch au montage suffit pour
   une première version fonctionnelle.

## Vérification

- Recharge la page : les notifications de validation de terrain déjà en
  base (si tu en as, sinon crée-en une de test) doivent maintenant
  apparaître dans la cloche.
- Active "Nouvelle réservation", fais une réservation de test, confirme
  qu'une notification apparaît pour le gérant du terrain concerné.
- Désactive une préférence (ex: "Paiement reçu"), refais le test
  correspondant, confirme qu'aucune notification n'apparaît cette fois.
- "Marquer tout comme lu" doit persister après un rechargement de page
  (pas juste visuel/local).

## Interdictions

- Ne réintroduis pas les toggles "Nouveau gérant inscrit"/"Alertes SMS" —
  explicitement hors scope (pas de vrai flux à notifier / pas de
  fournisseur SMS).
- Ne construis pas de système d'email ou SMS — uniquement in-app via la
  table `notifications` existante, comme demandé.
