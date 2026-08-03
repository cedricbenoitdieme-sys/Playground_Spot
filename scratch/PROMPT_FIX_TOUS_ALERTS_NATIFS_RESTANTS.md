# PROMPT — Éliminer TOUS les popups natifs du navigateur restants dans le SaaS

## Contexte

Suite à `AdminUsers.jsx` (déjà corrigé), l'utilisateur veut qu'**aucun**
`alert()`/`confirm()`/`prompt()` natif du navigateur ne subsiste nulle
part dans l'app — tout doit passer par le composant stylé du SaaS,
`src/components/CustomAlertModal.jsx`, avec le pattern déjà établi
(`showAlert(title, message, type)` + state `alertConfig`, voir
`GerantDashboard.jsx` lignes 24, 33-37, 659 pour la référence).

Inventaire complet des occurrences restantes (recherche exhaustive sur
tout `src/`, confirmée : plus aucun `confirm()`/`prompt()` ailleurs que
celui déjà traité) :

- `src/pages/admin/AdminTerrains.jsx` — 4 `alert()` (lignes 86, 134, 153, 225)
- `src/utils/exportReports.js` — 2 `alert()` (lignes 51, 217), dans des
  fonctions utilitaires (pas des composants React) appelées depuis 4
  écrans différents

## Ta tâche

### 1. `AdminTerrains.jsx` — même pattern que AdminUsers.jsx

Ajoute l'import, le state et le helper :
```jsx
import { CustomAlertModal } from '../../components/CustomAlertModal';
// ...
const [alertConfig, setAlertConfig] = useState(null);
const showAlert = (title, message, type = 'info') => {
  setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
};
```
Remplace les 4 `alert(...)` :
- ligne 86 : `showAlert('Erreur', err.userMessage || "Impossible d'ouvrir ce document.", 'error');`
- ligne 134 : `showAlert('Erreur', \`Erreur lors de la révision du terrain: ${err.message}\`, 'error');`
- ligne 153 : `showAlert('Erreur', \`Erreur lors du changement de statut: ${err.message}\`, 'error');`
- ligne 225 : `showAlert('Champ requis', 'Veuillez saisir un motif de refus.', 'error');` (garde le `return;` juste après, inchangé)

Ajoute le rendu en fin de composant : `{alertConfig && <CustomAlertModal {...alertConfig} />}`

### 2. `exportReports.js` — pas un composant, donc pas de JSX possible ici

Ces deux fonctions (`exportPDFReport`, `exportReservationReceiptPDF`)
appellent `alert()` uniquement quand `window.open(...)` est bloqué par le
navigateur (popup bloqué). Comme ce module n'est pas un composant React,
il ne peut pas afficher lui-même une `CustomAlertModal`. Solution :
ajoute un paramètre optionnel `onPopupBlocked` (callback) à chacune des
deux fonctions, appelé à la place de `alert()` :

```js
// exportPDFReport — signature actuelle : ({ title, subtitle, metadata, headers, rows, summaryFooter })
export const exportPDFReport = ({
  title = '...',
  // ...params existants inchangés...
  onPopupBlocked = null,
}) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    if (onPopupBlocked) onPopupBlocked();
    else console.warn('Popup bloqué : impossible de générer le rapport PDF.');
    return;
  }
  // ... reste inchangé
};
```
Même traitement pour `exportReservationReceiptPDF(reservation, onPopupBlocked)`
(paramètre positionnel cette fois, vu sa signature actuelle à un seul
argument `reservation`).

Le `console.warn` en fallback (si l'appelant ne fournit pas le callback)
évite un popup natif silencieux par défaut — mais **tous les appelants
actuels doivent fournir le callback** (voir point 3), donc ce fallback ne
devrait jamais se déclencher en pratique une fois le point 3 fait.

### 3. Wire le callback à chaque appelant

Quatre écrans appellent `exportPDFReport` ; un seul (`GerantDashboard.jsx`)
a déjà l'infra `showAlert`/`CustomAlertModal`. Pour les 3 autres, ajoute
le même pattern qu'au point 1 (import + state + helper + rendu), puis
passe le callback dans chaque appel :

- `src/pages/GerantDashboard.jsx:312` — a déjà `showAlert` (ligne 35) :
  ajoute juste `onPopupBlocked: () => showAlert('Popups bloqués', "Veuillez autoriser les fenêtres surgissantes pour télécharger le rapport PDF.", 'error'),`
  dans l'objet passé à `exportPDFReport({...})`.
- `src/pages/GerantStats.jsx:437` — ajoute l'infra `showAlert` (pas
  encore présente), puis même câblage.
- `src/pages/admin/AdminDashboard.jsx:150` — idem.
- `src/pages/Telemetrie.jsx:201` — idem.

`exportReservationReceiptPDF` n'est actuellement appelée nulle part dans
le code (fonction exportée mais inutilisée) — corrige quand même sa
signature pour la cohérence future, pas besoin de câbler un appelant
puisqu'il n'y en a pas.

## Vérification

- Sur `AdminTerrains.jsx` : déclenche chacun des 4 cas d'erreur (ouverture
  document échouée, révision échouée, changement de statut échoué, refus
  sans motif) — la modale stylée doit s'afficher, jamais le popup natif.
- Sur les 4 écrans avec export PDF : bloque volontairement les popups
  dans les réglages du navigateur, déclenche un export PDF, confirme que
  le message stylé s'affiche au lieu du popup natif du navigateur.
- Grep final sur tout `src/` pour confirmer qu'il ne reste plus aucun
  `alert(`, `confirm(` ou `prompt(` natif :
  ```
  grep -rn "\balert(\|\bconfirm(\|\bprompt(" src/
  ```
  (hors commentaires/chaînes de caractères mentionnant ces mots sans les
  appeler — vérifier au cas par cas si le grep remonte des faux positifs)

## Interdictions

- Ne change pas la logique métier des actions elles-mêmes (RPC appelés,
  génération du PDF/CSV) — uniquement l'habillage des confirmations/
  erreurs.
- Ne supprime pas `exportReservationReceiptPDF` sous prétexte qu'elle est
  inutilisée — hors scope de cette tâche.
