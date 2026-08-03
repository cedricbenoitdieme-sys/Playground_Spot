# PROMPT — Ajouter une tuile "Tableau de bord" à l'écran menu admin

## Contexte

Deux systèmes de navigation admin coexistent :
- `AdminLayout` (`view === 'dashboard'` dans `App.jsx`) — le vrai tableau
  de bord avec onglets internes Dashboard/Terrains/Utilisateurs/
  Abonnements/Audit Logs.
- L'écran "menu" (`view === 'menu'`, `App.jsx` lignes ~436-480) — atteint
  en cliquant "Retour App" depuis `AdminLayout` (`onExit={() => setView('menu')}`,
  ligne 411) — ne propose que 5 tuiles (Télémétrie, Scanner un Ticket,
  Gérants, Utilisateurs, Paramètres) et **aucune tuile ne ramène vers
  `AdminLayout`**. Une fois sur cet écran, l'admin perd l'accès à
  Terrains/Abonnements/Audit Logs sans recharger l'app ou modifier l'URL
  manuellement.

Capture utilisateur jointe (celle qui a déclenché ce diagnostic).

## Ta tâche

Dans `src/App.jsx`, section `view === 'menu'` (le tableau d'items mappé
en tuiles, lignes ~451-457) :

```jsx
{[
  { id: 'telemetrie', label: 'Télémétrie', sub: 'Activité en temps réel', icon: IconTrendingUp },
  { id: 'scan', label: 'Scanner un Ticket', sub: 'Validation QR Code joueur', icon: IconScan },
  { id: 'gerants', label: 'Gérants', sub: 'CRUD, suspensions, approbation', icon: IconUsersGroup },
  { id: 'utilisateurs', label: 'Utilisateurs', sub: 'Liste joueurs, historique, blocage', icon: IconUsers },
  { id: 'parametres', label: 'Paramètres', sub: 'Sécurité, commission, notifications', icon: IconSettings },
].map((item, index) => (
```

Ajoute une entrée en première position :
```jsx
{ id: 'dashboard', label: 'Tableau de bord', sub: 'Terrains, abonnements, audit logs', icon: IconLayoutDashboard },
```

Importe `IconLayoutDashboard` (pas encore importé dans `App.jsx`) en
l'ajoutant à la ligne d'import `@tabler/icons-react` existante (ligne 51) :
```jsx
import { IconCheck, IconX, IconTrendingUp, IconUsers, IconTrophy, IconUsersGroup, IconSettings, IconChevronRight, IconLogout, IconBallFootball, IconScan, IconLoader2, IconLayoutDashboard } from '@tabler/icons-react';
```

Le `onClick={() => setView(item.id)}` déjà en place fonctionne tel quel
(pas de changement nécessaire) — `item.id: 'dashboard'` correspond
exactement à la condition `view === 'dashboard'` qui rend `AdminLayout`.

## Vérification

- Connecte-toi en admin, va sur "Retour App" depuis le Dashboard pour
  atterrir sur l'écran menu.
- Confirme que la tuile "Tableau de bord" apparaît en premier, avec
  l'icône appropriée.
- Clique dessus : doit ramener sur `AdminLayout` avec ses 5 onglets
  internes (Dashboard/Terrains/Utilisateurs/Abonnements/Audit Logs)
  fonctionnels.

## Interdictions

- Ne retire aucune des 5 tuiles existantes — juste en ajouter une.
- Ne touche pas à `AdminLayout.jsx` ni à sa logique interne de tabs — hors
  scope de ce correctif ciblé.
