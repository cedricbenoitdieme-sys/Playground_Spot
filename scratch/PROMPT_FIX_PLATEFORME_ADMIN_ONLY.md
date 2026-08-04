# PROMPT — Cacher la section "Plateforme" (dont la dérogation de commission) aux gérants

## Contexte

`src/pages/Parametres.jsx` est le **même composant** utilisé à la fois
pour la page Paramètres de l'admin (`App.jsx`, `view === 'parametres'`)
ET pour celle du gérant (`view === 'gerant-parametres'`, ligne 527-531 de
`App.jsx`) — aucune distinction de rôle dans le rendu JSX de la section
"Plateforme" (Mode maintenance, Devise, Fuseau horaire, Commissions par
plan, **Dérogation temporaire globale**).

Le chargement des données est déjà gardé par rôle (lignes 189 et 238 :
`if (['admin', 'super_admin'].includes(currentUser?.role))`), mais pas
l'affichage — un gérant qui ouvre "Paramètres" voit donc actuellement
cette section vide/par défaut, **y compris le bouton "Activer" la
dérogation de commission globale**, qui n'a aucun sens pour lui (et que
la RPC `set_commission_override` rejette de toute façon côté serveur,
`is_super_admin()` déjà vérifié — pas de faille de sécurité, mais mauvaise
UX/fuite d'information : un gérant ne devrait même pas savoir que ce
contrôle existe).

**Confirmé explicitement par l'utilisateur** : seul le super admin doit
pouvoir voir/utiliser cette dérogation.

## Ta tâche

Dans `src/pages/Parametres.jsx`, entoure toute la section "Plateforme"
(le bloc `<Section title="Plateforme" icon={IconSettings} delay={0.2}>
...</Section>`, lignes 434 à 504 — Mode maintenance, Devise, Fuseau
horaire, Commissions par plan, Dérogation temporaire) d'une condition de
rôle, cohérente avec la garde déjà utilisée pour le chargement des
données :

```jsx
{['admin', 'super_admin'].includes(currentUser?.role) && (
  <Section title="Plateforme" icon={IconSettings} delay={0.2}>
    {/* ... contenu existant inchangé ... */}
  </Section>
)}
```

## Vérification

- Connecté en tant que gérant, ouvre "Paramètres" ("gerant-parametres") :
  la section "Plateforme" (mode maintenance, commissions, dérogation) ne
  doit plus apparaître du tout. Les autres sections (Mon profil, Sécurité,
  Notifications, À propos) doivent rester visibles normalement.
- Connecté en tant qu'admin/super admin : aucun changement, la section
  "Plateforme" doit continuer à s'afficher et fonctionner exactement
  comme avant.

## Interdictions

- Ne touche pas aux autres sections de la page (Mon profil, Sécurité,
  Notifications, À propos) — elles restent communes aux deux rôles.
