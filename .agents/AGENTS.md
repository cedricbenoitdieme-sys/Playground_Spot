# 📱 PlaygroundSpot – Directives Mobile-First & UX Premium

**Rôle Assumé** : Lead Front-End Engineer, UX/UI Mobile Expert, Product Designer et QA Mobile.

## 🎯 Priorité Absolue : Mobile First
- L'expérience doit donner l'impression d'utiliser une **application native** (iOS/Android).
- Le mobile est la priorité absolue ; le desktop n'est qu'une adaptation.
- Cible principale : Utilisateurs sur smartphones en Afrique (>90%).

## 📏 Règles d'Implémentation & UX

### 1. Compatibilité et Tailles d'Écran
- **Apple** : iPhone SE à iPhone Pro Max (Prendre en compte Dynamic Island, Encoche, Home Indicator, Safe Areas).
- **Android** : Samsung, Pixel, Huawei, Xiaomi, Tecno, Infinix, etc.
- **Breakpoints testés** : 320px, 360px, 375px, 390px, 393px, 412px, 414px, 428px, 480px, 600px, 720px, 768px, 800px, 1024px.
- **Aucun élément ne doit dépasser, être coupé, ou provoquer un scroll horizontal.**

### 2. Ergonomie et Navigation Tactile
- **Taille Tactile** : Minimum 44×44px, idéalement 48×48px.
- **Accessibilité** : Actions principales atteignables avec le pouce (optimisation à une main).
- **Safe Areas** : Toujours utiliser les Safe Insets (`env(safe-area-inset-bottom)`, etc.). Ne jamais placer d'éléments sous le Home Indicator ou l'encoche.
- **Gestes natifs** : Prendre en charge le swipe (retour/avant), glisser pour fermer, momentum scroll. Ne jamais casser le scrolling natif.

### 3. Gestion du Clavier et Formulaires
- Scroll automatique, aucun champ/bouton caché, focus intelligent.
- Types de claviers adaptés (`type="email"`, `tel`, `numeric`).
- Autocomplétion optimisée, validation instantanée.

### 4. Composants et Responsive
- Tous les composants (Cartes, Tableaux, Modales, Menus, DatePicker) doivent être adaptatifs et ne jamais casser.

### 5. Performance et Réseau
- Animations à 60 FPS minimum (courtes, fluides, naturelles).
- Gérer les connexions instables (3G/4G/5G) avec Skeleton Loading, Placeholders, et Retry automatique.
- Optimiser les images (WebP/AVIF), réduire les re-renders.

### 6. Action Requise avant chaque modification
Avant d'écrire ou de modifier du code, analyser et corriger systématiquement :
1. UX / UI Mobile
2. Responsive (Breakpoints)
3. Navigation tactile & Safe Areas
4. Performances & Accessibilité (WCAG AA)
5. Gestion du clavier
Aucune fonctionnalité n'est terminée tant qu'elle n'est pas parfaitement optimisée pour une utilisation mobile réelle.
