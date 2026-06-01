# 🎨 PlaygroundSpot - Direction Artistique (DA)

Ce document récapitule l'ensemble des règles de Design System et de Direction Artistique de l'application **PlaygroundSpot**, afin de maintenir une cohérence visuelle parfaite entre les différents écrans et futurs développements.

## 🌟 Vision Globale
L'application doit transmettre une sensation **Premium, Sportive et Locale (Dakar)**. Le style visuel mélange le côté moderne et fluide des applications haut de gamme (animations douces, glassmorphism, grands arrondis) avec une identité colorimétrique forte ancrée dans l'univers du football africain.

---

## 🎨 1. Palette de Couleurs

L'identité visuelle repose sur trois couleurs piliers :

*   **Vert Terrain (Primary)** : `#1A7A4A` 
    *   *Utilisation* : Boutons principaux, icônes actives, barres de progression positives.
    *   *Variante Dark* : `bg-primary-dark` pour les textes importants.
*   **Sable Dakar (Secondary)** : `#E8DCC8`
    *   *Utilisation* : Badges, éléments de distinction, "touches" locales.
*   **Vert Nuit / Sombre (Background Dark)** : `#0F2318`
    *   *Utilisation* : Bannières de bienvenue, Sidebar d'administration, textes très contrastés.

### Couleurs de Statut (Sémantique)
*   **Confirmé / Succès** : Vert Émeraude (`text-status-confirmed`, `bg-status-confirmed/10`).
*   **En Attente** : Orange/Jaune (`text-status-pending`, `bg-status-pending/10`).
*   **Annulé / Bloqué** : Rouge vif (`text-status-cancelled`, `bg-status-cancelled/10`).
*   **Gris UI** : `gray-50` pour les fonds secondaires, `gray-400` pour les textes secondaires, `gray-100` pour les bordures.

---

## ✍️ 2. Typographie

*   **Titres & KPI (Chiffres)** : `Space Grotesk` (ou police *Display* géométrique équivalente).
    *   *Usage* : Titres de modales, grands chiffres des statistiques, bannières d'accueil.
*   **Corps de texte & UI** : `Inter`
    *   *Usage* : Tableaux de données, sous-titres, menus, boutons standards.

---

## 📐 3. Formes & Espacements (Shape System)

L'UI privilégie l'ultra-arrondi pour une sensation "Friendly & Premium". Aucun coin n'est pointu.

*   **Cartes & Widgets** : `rounded-2xl` (16px) ou `rounded-[2rem]` (32px).
*   **Modales & Popups** : `rounded-[2rem]` (32px) ou `rounded-t-[2.5rem]` sur mobile.
*   **Boutons & Inputs** : `rounded-xl` (12px) ou `rounded-2xl` (16px).
*   **Bordures** : Très subtiles. Utilisation de `border border-black/5` ou `border-gray-100`.

---

## 💫 4. Animations & Micro-interactions

L'interface doit paraître "vivante".

*   **Hover (Survol)** : Soulèvement subtil (`hover:-translate-y-0.5`) + Ombre portée (`hover:shadow-md`).
*   **Active (Clic)** : Effet d'enfoncement (`active:scale-[0.98]`).
*   **Chargement / Arrivée d'éléments** :
    *   Apparition en fondu et glissement vers le haut (`animation: slideUp 0.4s ease-out`).
    *   Effet de cascade (`animationDelay: 0.1s, 0.2s, etc.`) pour les listes.
*   **Modales** : Apparition fluide (`animate-in zoom-in-95 duration-200`).
*   **Indicateurs** : Utilisation du pulse (`animate-ping`) pour notifier une action live ou un onglet actif.

---

## 📱 5. Composants Standardisés

### Les Modales (Règle d'Or Mobile)
Toute modale, popup ou fiche de détail DOIT respecter cette structure pour ne jamais déborder :
*   Positionnement fixe global (`fixed inset-0`).
*   Centrage absolu (`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`).
*   Largeur adaptative (`w-full max-w-[calc(100vw-32px)] md:max-w-md mx-auto`).
*   Hauteur maximale bloquée (`max-h-[90vh]`) avec défilement interne caché (`overflow-y-auto no-scrollbar`).
*   Bouton "Fermer" (X) positionné en haut à droite avec un `pr-10` sur le titre pour éviter les chevauchements de texte.
*   *Backdrop* : Fond semi-transparent sombre avec léger flou (`bg-primary-dark/60 backdrop-blur-sm`).

### La Navigation (BottomNav Mobile)
*   **Symétrie stricte** : Exactement 5 éléments par rôle.
*   Le 3ème élément (index 2) est TOUJOURS un bouton d'action principal flottant (`-top-4`), rond, ombré et d'une couleur d'accent (ex: Réservations).

### Boutons d'Action Principaux (CTA)
*   Toujours massifs et clairs : `h-12` ou `h-14`, texte gras, centrés.
*   Avec une ombre portée colorée : `shadow-lg shadow-primary/20`.

---
*Ce fichier documente les principes à suivre pour toute nouvelle page ou composant PlaygroundSpot.*
