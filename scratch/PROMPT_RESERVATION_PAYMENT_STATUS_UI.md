# Prompt — Confirmation de paiement réservation par webhook, jamais manuelle

## Audit : ce qui existe déjà vs ce qui manque

**Déjà en place (backend, cette session) :**
- `handle_payment_webhook` idempotent (ne transitionne que depuis `en_attente`), capture `confirmed_at`/`webhook_payload`.
- Référence UnitechPay réellement relue et stockée (`ref_externe`) au lieu de faire confiance à notre valeur pré-générée.
- Index unique sur `paiements.ref_externe` (le lookup webhook était ambigu sans ça).
- Expiration automatique (cron 5 min) : un paiement `en_attente` > 15 min → `expire`, réservation → `annulee`, créneau libéré automatiquement (trigger existant).
- RPC `get_reservation_payment_status(p_reference)` — lecture seule, RLS-safe (joueur propriétaire ou admin uniquement).
- `backend/routes/verify.js` : un ticket QR ne scanne plus `valid: true` que si `reservations.statut = 'confirmee'` (avant : n'importe quel statut, y compris non payé, passait).
- `payments.js` stocke maintenant `payment_url` sur la ligne `paiements` en plus de `ref_externe`.

**Cassé, trouvé en traçant le vrai flow (pas juste le "bouton manuel" décrit au départ) :**
1. `BookingFlow.jsx:274-275` fait `window.location.href = initData.payment_url` — redirection PLEINE PAGE (le joueur quitte complètement l'app), pas un nouvel onglet comme le fait déjà `BoostCheckoutModal.jsx` pour les gérants.
2. `backend/routes/payments.js` définit `callback_success: ${cleanReferer}?payment_success=true` — **aucun paramètre de référence transmis**.
3. `src/pages/ReservationSuccess.jsx` attend `?ref=xxx` dans l'URL pour vérifier le statut — qu'il ne recevra donc **jamais**.
4. `ReservationSuccess.jsx` **n'est même pas routé** dans `App.jsx` (son propre commentaire en tête de fichier le dit : "⚠️ Déclarer cette route dans le routeur principal").

Résultat actuel : après un vrai paiement Wave/OM, le joueur revient sur la page de réservation avec `?payment_success=true` dans l'URL, que rien ne lit — aucun feedback, aucune confirmation visible, alors que côté serveur le webhook va bien finir par confirmer la réservation (maintenant que c'est fiabilisé). C'est un vrai trou UX, pas juste un bouton à retirer.

## Fix recommandé — répliquer le pattern déjà existant (`useBoostPaymentPolling` / `BoostCheckoutModal`)

Plutôt qu'une redirection pleine page + callback cassé, adopter le même modèle que les paiements gérant (boost/abonnement), déjà correct dans ce projet :

1. **`BookingFlow.jsx`** : remplacer `window.location.href = initData.payment_url` par `window.open(initData.payment_url, '_blank')` (nouvel onglet, l'app reste ouverte), puis démarrer un polling avec la référence retournée (`initData.transaction_ref`, déjà renvoyée par `payments.js`).

2. **Nouveau hook `useReservationPaymentPolling`** (calqué sur `useBoostPaymentPolling.js`) :
```js
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useReservationPaymentPolling = () => {
  const [status, setStatus] = useState('idle'); // idle | polling | success | failed | timeout
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const maxAttempts = 225; // 15 min à 4s — même cadence que les abonnements/boosts
  const intervalMs = 4000;

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const checkStatus = useCallback(async (reference) => {
    const { data, error: rpcError } = await supabase.rpc('get_reservation_payment_status', { p_reference: reference });
    if (rpcError || !data) return;
    if (data.statut_paiement === 'valide') { setStatus('success'); stopPolling(); }
    else if (data.statut_paiement === 'echoue' || data.statut_paiement === 'expire') {
      setStatus('failed');
      setError(data.statut_paiement === 'expire' ? 'Le paiement a expiré (délai dépassé).' : 'Le paiement a été refusé.');
      stopPolling();
    }
  }, [stopPolling]);

  const startPolling = useCallback((reference) => {
    stopPolling(); setStatus('polling'); setError(null);
    checkStatus(reference);
    let count = 0;
    timerRef.current = setInterval(() => {
      count += 1;
      if (count >= maxAttempts) { setStatus('timeout'); setError("Temps d'attente dépassé."); stopPolling(); return; }
      checkStatus(reference);
    }, intervalMs);
  }, [checkStatus, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);
  return { status, error, startPolling, stopPolling };
};
```

3. Écran de polling dans `BookingFlow.jsx` (ou un modal dédié) : afficher "En attente de confirmation..." pendant `status === 'polling'`, puis basculer vers l'étape ticket/QR uniquement quand `status === 'success'` — jamais sur une action utilisateur.

4. **Supprimer ou router correctement `ReservationSuccess.jsx`** : soit le brancher réellement (`<Route path="/reservation/success" element={<ReservationSuccess />} />` dans `App.jsx`) en corrigeant le callback pour transmettre la référence (`callback_success: ${appUrl}/reservation/success?ref=${ref_externe}`), soit le supprimer si l'approche polling en modal (ci-dessus) le rend redondant — à trancher selon la préférence UX (modal in-app vs page dédiée après redirection).

## Ne pas toucher

- `PaymentModal.jsx` — repéré au passage comme une simulation complète (setTimeout, aucun appel réel), semble utilisé pour un flow différent (à vérifier séparément si c'est encore utilisé quelque part, mais hors scope de cette tâche paiement réservation réel).
- Le système de boost/abonnement gérant (`useBoostPaymentPolling`, `usePaymentPolling`, `SubscriptionCheckoutModal`, `BoostCheckoutModal`) — déjà correct, sert de modèle ci-dessus, ne pas modifier.
