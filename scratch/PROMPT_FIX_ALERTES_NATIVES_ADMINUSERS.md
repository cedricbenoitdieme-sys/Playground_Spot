# PROMPT — Remplacer les popups navigateur par les modales stylées du SaaS (AdminUsers.jsx)

## Symptôme

Sur "Gestion des utilisateurs" (admin), l'action "Réinitialiser l'accès"
(icône clé 🔑, capture utilisateur jointe) déclenche un `confirm()` natif
du navigateur — popup grise sans style, hors charte graphique du SaaS.
Pareil pour les messages d'erreur, qui utilisent `alert()` natif.

La fonctionnalité elle-même est réelle (vrai appel RPC
`admin_reset_user_access`) — seul l'habillage visuel est à corriger, pour
rester cohérent avec le reste de l'app.

## Cause identifiée

`src/pages/admin/AdminUsers.jsx`, 4 occurrences de dialogues natifs :
- ligne 75 : `alert(...)` sur erreur de révélation de contact
- ligne 91 : `alert(...)` sur erreur de changement de rôle
- ligne 96 : `confirm(...)` avant réinitialisation d'accès
- ligne 104 : `alert(...)` sur erreur de réinitialisation

L'app a déjà un composant dédié pour ça,
`src/components/CustomAlertModal.jsx` (types `info`/`success`/`error`/
`confirm`), déjà utilisé ailleurs via un pattern `showAlert(title, message, type)`
+ state `alertConfig` — voir `src/pages/GerantDashboard.jsx` lignes 24,
33-37, 659 pour un exemple exact à reproduire.

## Ta tâche

1. Importe `CustomAlertModal` dans `AdminUsers.jsx` :
   ```jsx
   import { CustomAlertModal } from '../../components/CustomAlertModal';
   ```
2. Ajoute le state + helper, même pattern que `GerantDashboard.jsx` :
   ```jsx
   const [alertConfig, setAlertConfig] = useState(null);
   const showAlert = (title, message, type = 'info') => {
     setAlertConfig({ isOpen: true, title, message, type, onClose: () => setAlertConfig(null) });
   };
   ```
3. Remplace les 3 `alert(...)` par `showAlert('Erreur', message, 'error')` :
   ```jsx
   // ligne 75
   showAlert('Erreur', `Erreur lors de la révélation du contact: ${err.message}`, 'error');
   // ligne 91
   showAlert('Erreur', `Erreur changement de rôle: ${err.message}`, 'error');
   // ligne 104
   showAlert('Erreur', `Erreur réinitialisation: ${err.message}`, 'error');
   ```
4. Remplace le `confirm(...)` (ligne 96) par une modale `type='confirm'`
   avec `onConfirm` qui exécute l'action réelle. Ça change la structure de
   `handleResetAccess` : au lieu d'un early return synchrone, il faut
   déclencher la modale puis exécuter l'action dans `onConfirm` :
   ```jsx
   const handleResetAccess = (user) => {
     setAlertConfig({
       isOpen: true,
       type: 'confirm',
       title: 'Réinitialiser l\'accès',
       message: `Réinitialiser l'accès pour ${user.nom} ? Cette action invalidera sa session.`,
       confirmLabel: 'Réinitialiser',
       cancelLabel: 'Annuler',
       onClose: () => setAlertConfig(null),
       onConfirm: async () => {
         setAlertConfig(null);
         try {
           await callRpc('admin_reset_user_access', { p_user_id: user.id });
           setActionMsg(`Accès réinitialisé pour ${user.nom}.`);
           setTimeout(() => setActionMsg(null), 3000);
         } catch (err) {
           showAlert('Erreur', `Erreur réinitialisation: ${err.message}`, 'error');
         }
       },
     });
   };
   ```
5. Ajoute le rendu de la modale à la fin du JSX du composant (avant la
   fermeture du conteneur racine, même pattern que
   `GerantDashboard.jsx:659`) :
   ```jsx
   {alertConfig && <CustomAlertModal {...alertConfig} />}
   ```

## Vérification

- Clique "Réinitialiser l'accès" sur un utilisateur : la modale stylée du
  SaaS doit s'afficher (pas le popup natif du navigateur), avec Annuler/
  Réinitialiser.
- Confirme que "Annuler" ne déclenche rien, et que "Réinitialiser"
  exécute bien le RPC et affiche le message de succès existant
  (`actionMsg`, déjà en place, à ne pas toucher).
- Déclenche volontairement une erreur (ex: coupe le réseau ou modifie
  temporairement le RPC pour échouer) pour confirmer que les messages
  d'erreur passent aussi par la modale stylée, plus par `alert()`.

## Interdictions

- Ne change pas la logique métier (les RPC appelés, `actionMsg`,
  `fetchUsers()`) — uniquement l'habillage visuel des confirmations/
  erreurs.
