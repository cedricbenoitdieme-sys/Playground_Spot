# Prompt — Intégration frontend UnitechPay + adaptation aux correctifs de sécurité F1-F4

## Contexte

Backend en place (migration `20260802160000_unitechpay_integration.sql`,
edge functions `create-payment` et `payment-webhook`). Cette migration
corrige 4 failles de sécurité sur `reservations`/`paiements`, dont deux
**cassent le flux de réservation actuel** — ce n'est pas une simple
intégration de paiement à ajouter, il y a un vrai changement d'architecture
côté création de réservation.

## ⚠️ Rupture n°1 (bloquante) — `createReservation()` ne fonctionne plus

`src/services/reservations.js:119-129` appelle la RPC `create_reservation_safe`
avec un `p_montant` calculé côté client (`totalPrice` dans
`BookingFlow.jsx:249`). La policy RLS `reservations_insert_joueur` dont
dépendait cette RPC (SECURITY INVOKER) a été **supprimée** — un joueur ne
peut plus insérer une ligne dans `reservations` directement, à aucun prix.
L'EXECUTE sur `create_reservation_safe` a aussi été explicitement révoqué.
**`createReservation()` va désormais échouer à 100% pour tout joueur.**

Remplacement : nouvelle RPC `creer_reservation_en_attente(p_creneau_id)` —
un seul paramètre. Elle verrouille le créneau, vérifie sa disponibilité,
calcule le prix côté serveur (`terrains.price × durée`, ou
`creneaux.prix_override` si défini) et insère la réservation. Elle
**RETOURNE** la ligne `reservations` complète (donc `montant` déjà calculé
— ne jamais le recalculer côté client).

```js
const { data: reservation, error } = await supabase.rpc('creer_reservation_en_attente', {
  p_creneau_id: creneauId, // UUID d'une ligne réelle dans public.creneaux
});
```

Codes d'erreur exacts renvoyés dans `error.message` (à mapper vers des
messages utilisateur) :

| code | signification |
|---|---|
| `non_authentifie` | pas de session |
| `creneau_introuvable` | `creneau_id` invalide |
| `creneau_indisponible` | déjà réservé/bloqué |
| `creneau_deja_reserve` | conflit concurrentiel au moment de l'insert |
| `creneau_passe` | date/heure déjà dépassée |
| `terrain_inactif` | terrain non actif |
| `montant_invalide` | prix calculé < 100 FCFA |

## ⚠️ Rupture n°2 (importante, pas juste un renommage) — il faut un vrai `creneau_id`

`BookingFlow.jsx:239-240` invente la date du jour (`new
Date().toISOString()`) et prend `selectedSlot` comme simple string
horaire — **aucun `creneau_id` réel n'est jamais lu ni envoyé**
aujourd'hui. La nouvelle RPC exige un `creneau_id` existant dans
`public.creneaux` (généré côté gérant via `generate_weekly_slots`).

Ça veut dire que le flux de sélection doit changer : lister les créneaux
`disponible` du terrain pour une date donnée (`fetchCreneauxDisponibles`,
déjà dans `src/services/stats.js`) et faire sélectionner un **id de
créneau réel** au joueur, plutôt que de composer librement une heure. Ce
n'est pas optionnel — sans ça, aucune réservation ne pourra plus être
créée, "sur place" y compris.

## Tâche 1 — Flux "Sur place" (le seul actif actuellement)

```js
const reservation = await supabase.rpc('creer_reservation_en_attente', { p_creneau_id: creneauId });
if (reservation.error) { /* mapper le code, cf. tableau ci-dessus */ }

// Utiliser reservation.data.montant — PAS totalPrice calculé côté client.
await createPaiement({
  reservation_id: reservation.data.id,
  montant: reservation.data.montant,
  mode: 'sur_place',
});
```

`createPaiement()` (`src/services/reservations.js:175-234`) et sa policy
RLS `paiements_insert` ne changent pas — mais utiliser le montant renvoyé
par la RPC plutôt qu'une valeur reconstituée côté client, pour ne pas
réintroduire par la bande le même problème que F3 résolvait sur
`reservations`.

## Tâche 2 — Flux paiement en ligne (Wave / Orange Money / Maxit / QR)

Nouveau contrat, à consommer via `supabase.functions.invoke('create-payment', { body })` :

```ts
// Requête
{ creneau_id: string; methode: 'wave'|'orange_money'|'orange_maxit'|'orange_qr'; telephone: string }

// Réponse 200
{
  reservation_id: string;
  reference: string;
  montant: number;
  payment_url: string | null;      // wave, orange_money, orange_maxit
  qr_code: string | null;          // orange_qr — data:image/png;base64,...
  deep_links: { MAXIT: string; OM: string } | null;
  expire_dans: number;             // secondes (900)
}

// Erreur (400/401/404/409/502/500)
{ error: string; code?: string }
```

La fonction crée la réservation ET le paiement côté serveur — ne PAS
appeler `creer_reservation_en_attente` séparément avant, ni
`createPaiement()` après, pour ce flux. En cas d'erreur, la réservation
créée en interne est automatiquement annulée par la fonction (le créneau
se libère tout seul).

Ensuite : écouter `reservations.statut` via Realtime (déjà le pattern en
place dans `BookingFlow.jsx:170-223` pour l'affichage des créneaux
occupés) sur `reservation_id`, transition attendue `en_attente` →
`confirmee` ou `annulee`. **Aucune confirmation ne passe par une URL de
callback** — ne pas essayer de lire un paramètre de retour d'URL.

## Tâche 3 — `updateReservationStatut()` restreint pour un joueur

`src/services/reservations.js:145-167` fait un `.update({statut})` brut.
Un joueur ne peut désormais transitionner sa propre réservation que vers
`'annulee'` (policy `reservations_update_joueur_annulation`) — toute
tentative de mettre `'confirmee'` ou `'terminee'` depuis un compte joueur
échoue silencieusement côté RLS (0 ligne affectée, pas d'erreur SQL
explicite : vérifier `data`/`error` ET le nombre de lignes retournées).
Si un endroit du code appelle cette fonction avec un autre statut pour un
joueur, c'est un bug à corriger côté UI (bouton qui ne devrait pas exister
pour ce rôle).

## Ne pas toucher

- `paymentModeMap` dans `BookingFlow.jsx:253-258` — les valeurs `'wave'`,
  `'orange_money'`, `'sur_place'` restent les mêmes valeurs d'enum
  `mode_paiement` en base. `'Pay Unitech'` → `'pay_unitech'` n'est plus un
  mode utilisé par le nouveau flux (à retirer de l'UI si présenté comme
  option, remplacé par le choix explicite wave/orange_money/orange_maxit/
  orange_qr envoyé à `create-payment`).
- RLS sur `paiements` — inchangée, `paiements_insert` continue de
  fonctionner tel quel pour le flux "sur place".
- Triggers `sync_creneau_statut`/`process_audit_log` — inchangés, tout le
  comportement de libération automatique de créneau reste identique.
