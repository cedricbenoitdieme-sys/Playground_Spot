# Prompt — Brancher le paiement réel (Wave/Orange) sur "Activer le Boost"

## Contexte

Le bouton "Activer le Boost" (`src/pages/GerantVisibilityBoost.jsx`,
`handleCreateBoost`) appelle aujourd'hui `createVisibilityBoost()` →
RPC `create_visibility_boost`, qui **active le boost immédiatement, sans
aucun paiement**. C'est corrigé côté base de données :

- La RPC `create_visibility_boost` a été **supprimée** (elle est devenue un
  trou de sécurité — appelable directement pour un boost gratuit).
- La table `visibility_boosts` a un nouveau statut `'en_attente'` et deux
  nouvelles colonnes : `duree_jours`, `unitech_reference`.
- Nouveau flow en 2 temps, calqué exactement sur celui des abonnements
  (`SubscriptionCheckoutModal.jsx` + `usePaymentPolling.js`) :
  1. `create-payment` (Edge Function) avec `payment_type: 'boost'` crée une
     ligne `visibility_boosts` `statut='en_attente'` et initie le paiement
     UnitechPay (Wave/Orange).
  2. `webhook-unitech` reçoit la confirmation et bascule la ligne en
     `statut='actif'` avec `date_debut`/`date_fin` calculées.
- `get_boost_stats(boost_id)` retourne maintenant un champ
  `is_currently_active` (booléen : `statut='actif' ET date_fin >= aujourd'hui`)
  — c'est LA valeur à utiliser pour un badge "ACTIF" fiable, jamais `statut`
  seul (un boost expiré peut rester `statut='actif'` jusqu'à la prochaine
  passe du cron horaire qui le fait passer à `'termine'`).

Migration de référence (déjà appliquée) :
`supabase/migrations/20260724150000_boost_payment_gate.sql`.

## ⚠️ Bug pré-existant repéré au passage (hors scope, à corriger si tu veux, signalé pour info)

`initiateSubscriptionPayment()` (`src/services/subscriptions.js`) envoie
`{ plan_id, cycle, phone_number, mode }` à l'Edge Function `create-payment`,
qui attend en réalité `{ plan, billing_period, payment_method,
customer_number }` (voir `supabase/functions/create-payment/index.ts`). Les
noms ne correspondent pas — à vérifier si ça casse réellement le paiement
d'abonnement en prod ou si un mapping existe ailleurs que je n'ai pas vu.
**Ne pas corriger dans ce prompt-ci** (hors périmètre boost), juste un
signalement.

## Tâche 1 — Nouvelles fonctions service (`src/services/subscriptions.js`)

Remplacer `createVisibilityBoost` (RPC supprimée, ne plus l'appeler) par :

```js
/**
 * Initie le paiement d'une campagne de boost (Wave/Orange) via UnitechPay.
 */
export const initiateBoostPayment = async ({ terrain_id, budget_fcfa, duree_jours, phone_number, mode = 'wave' }) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Vous devez être connecté pour activer un boost.');
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: {
        payment_type: 'boost',
        terrain_id,
        budget_fcfa,
        duree_jours,
        payment_method: mode,
        customer_number: phone_number,
      },
    });

    if (error) throw new Error(error.message || "Impossible d'initialiser le paiement.");
    if (data?.error) throw new Error(data.error);
    return data; // { success, payment_url, deep_links, boost_id, unitech_reference, montant }
  } catch (err) {
    return handleServiceError(err, 'Échec de l\'initialisation du paiement de boost');
  }
};

/**
 * Statut d'un boost par ID (pour le polling post-paiement).
 */
export const fetchBoostStatus = async (boostId) => {
  try {
    if (!boostId) return null;
    const { data, error } = await supabase
      .from('visibility_boosts')
      .select('id, statut, date_debut, date_fin, duree_jours, unitech_reference')
      .eq('id', boostId)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Erreur lecture statut boost:', err);
    return null;
  }
};
```

Supprimer l'ancien export `createVisibilityBoost` (la RPC qu'il appelait
n'existe plus côté base — un appel résiduel échouerait avec une erreur
Postgres "function does not exist").

Dans `fetchGerantBoosts`, ajouter `duree_jours` et `unitech_reference` à la
liste de colonnes sélectionnées (utile pour distinguer un boost `en_attente`
dans la liste — actuellement la requête ne filtre déjà pas par statut, donc
les boosts en attente apparaîtront automatiquement, il faut juste les
afficher correctement, voir Tâche 3).

## Tâche 2 — Nouveau hook de polling (`src/hooks/useBoostPaymentPolling.js`)

`usePaymentPolling.js` existant est câblé en dur sur les valeurs de statut
des abonnements (`'active'`, `'revoked'`, `'expired'`) et sur
`fetchSubscriptionStatus`. Les statuts boost sont différents
(`'actif'`, `'annule'`, `'termine'`, `'en_attente'`) → créer un hook dédié,
même structure, sondage adapté :

```js
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchBoostStatus } from '../services/subscriptions';

export const useBoostPaymentPolling = () => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'polling' | 'success' | 'failed' | 'timeout'
  const [boostData, setBoostData] = useState(null);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const maxAttempts = 225; // 15 min à 4s d'intervalle, même cadence que les abonnements
  const intervalMs = 4000;

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const checkStatus = useCallback(async (boostId) => {
    const data = await fetchBoostStatus(boostId);
    if (!data) return;
    setBoostData(data);
    if (data.statut === 'actif') {
      setStatus('success');
      stopPolling();
    } else if (data.statut === 'annule') {
      setStatus('failed');
      setError('Le paiement a été refusé ou annulé.');
      stopPolling();
    }
  }, [stopPolling]);

  const startPolling = useCallback((boostId) => {
    stopPolling();
    setStatus('polling');
    setError(null);
    checkStatus(boostId);
    let count = 0;
    timerRef.current = setInterval(() => {
      count += 1;
      if (count >= maxAttempts) {
        setStatus('timeout');
        setError("Temps d'attente dépassé (15 min). Vérifiez vos SMS ou contactez le support.");
        stopPolling();
        return;
      }
      checkStatus(boostId);
    }, intervalMs);
  }, [checkStatus, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { status, boostData, error, startPolling, stopPolling };
};
```

## Tâche 3 — Nouveau `BoostCheckoutModal.jsx` (`src/components/`)

Dupliquer `SubscriptionCheckoutModal.jsx` en `BoostCheckoutModal.jsx` (même
style visuel : sélecteur Wave/Orange, input téléphone régex sénégalaise,
polling avec écrans "en cours" / "succès" / "échec"), adapté aux props et
au montant du boost :

```jsx
export const BoostCheckoutModal = ({ isOpen, onClose, terrainId, budgetFcfa, dureeJours, onSuccess }) => {
  // même state phone/paymentMode/loading/initError/checkoutUrl que SubscriptionCheckoutModal
  const { status, boostData, error: pollingError, startPolling, stopPolling } = useBoostPaymentPolling();
  // ...reset au isOpen, comme l'original

  const handlePay = async (e) => {
    e.preventDefault();
    if (!isPhoneValid) { setInitError('Numéro invalide...'); return; }
    setLoading(true); setInitError(null);
    try {
      const res = await initiateBoostPayment({
        terrain_id: terrainId,
        budget_fcfa: budgetFcfa,
        duree_jours: dureeJours,
        phone_number: rawPhone,
        mode: paymentMode,
      });
      if (res?.boost_id) startPolling(res.boost_id);
      if (res?.payment_url) { setCheckoutUrl(res.payment_url); window.open(res.payment_url, '_blank'); }
    } catch (err) {
      setInitError(err.message || 'Erreur lors de l\'initialisation du paiement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'success') setTimeout(() => onSuccess && onSuccess(boostData), 1500);
  }, [status, boostData, onSuccess]);

  // ...reste du JSX identique à SubscriptionCheckoutModal, en remplaçant
  // "Souscription {plan.nom}" par "Boost visibilité" et le prix par
  // `budgetFcfa.toLocaleString('fr-FR')` + `${dureeJours} jours`.
};
```

Note : `res.payment_url` (pas `res.checkout_url` comme dans
`SubscriptionCheckoutModal`) — c'est le nom de champ réellement renvoyé par
`create-payment` (voir `supabase/functions/create-payment/index.ts`,
`return json({ success: true, payment_url: paymentUrl, ... })`), à vérifier
si `SubscriptionCheckoutModal` a le même souci que le point ⚠️ signalé plus
haut (utilise `res.checkout_url` qui n'existe pas dans la réponse réelle) —
encore une fois, hors scope ici, juste un repère pour ne pas reproduire la
même incohérence dans le nouveau modal.

## Tâche 4 — Wiring dans `GerantVisibilityBoost.jsx`

1. Retirer l'appel direct à `createVisibilityBoost` dans `handleCreateBoost`.
   Le bouton "Activer le Boost" doit désormais **ouvrir**
   `BoostCheckoutModal` (nouveau state `showCheckout`) avec
   `terrainId={selectedTerrainId}`, `budgetFcfa={budget}`,
   `dureeJours={duration}`, plutôt que d'activer quoi que ce soit
   directement :
   ```js
   const [showCheckout, setShowCheckout] = useState(false);

   const handleCreateBoost = (e) => {
     e.preventDefault();
     if (isFreePlan) return;
     if (!selectedTerrainId) { setErrorMsg('Veuillez sélectionner un terrain à booster.'); return; }
     setErrorMsg(null);
     setShowCheckout(true);
   };
   ```
   Le bouton submit affiche donc juste "Continuer vers le paiement" plutôt
   que "Activer le Boost" (le boost ne s'active plus au clic sur ce
   bouton-là, seulement après paiement confirmé) — ajuster le libellé.

2. Ajouter le modal en fin de JSX :
   ```jsx
   <BoostCheckoutModal
     isOpen={showCheckout}
     onClose={() => setShowCheckout(false)}
     terrainId={selectedTerrainId}
     budgetFcfa={budget}
     dureeJours={duration}
     onSuccess={async () => {
       setShowCheckout(false);
       setSuccessMsg('Boost de visibilité activé avec succès ! Votre terrain est désormais mis en avant.');
       const updatedBoosts = await fetchGerantBoosts(currentUser.id);
       setBoosts(updatedBoosts);
     }}
   />
   ```

3. **Tâche 5 de la demande initiale — badge "ACTIF" fiable.** Dans la carte
   "Vos Campagnes Actives" (la boucle `boosts.map`), remplacer :
   ```js
   b.statut === 'actif'
   ```
   par un calcul qui vérifie aussi l'expiration côté client (ne pas se fier
   uniquement à la colonne `statut`, qui peut avoir jusqu'à 1h de retard
   entre deux passages du cron d'expiration côté serveur) :
   ```js
   const isBoostCurrentlyActive = (b) =>
     b.statut === 'actif' && b.date_fin && new Date(b.date_fin) >= new Date(new Date().toDateString());
   ```
   puis dans le rendu :
   ```jsx
   <span className={`... ${isBoostCurrentlyActive(b) ? 'bg-emerald-500/20 text-emerald-400 ...' : 'bg-white/10 text-white/50'}`}>
     {b.statut === 'en_attente' ? 'En attente de paiement' : isBoostCurrentlyActive(b) ? 'Actif' : 'Terminé'}
   </span>
   ```
   Ça couvre aussi le nouveau cas `en_attente` (un boost dont le paiement a
   été initié mais pas encore confirmé par le webhook — l'utilisateur peut
   fermer le modal avant confirmation et revenir plus tard sur la page).

## Contraintes

- Ne pas toucher à `SubscriptionCheckoutModal.jsx` ni `usePaymentPolling.js`
  (flow abonnement, hors scope).
- `budget` (slider 2000–50000 FCFA) et `duration` (3/7/14/30 jours) du
  formulaire existant sont déjà dans les bonnes bornes acceptées par la RPC
  serveur (`create_pending_boost` : budget ≥ 500, durée 1–90 jours) — pas de
  changement de bornes nécessaire côté formulaire.
- Le montant réellement facturé est toujours celui enregistré côté serveur
  à la création de la ligne `visibility_boosts` (jamais renvoyé par le
  front à un moment ultérieur) — ne rien construire côté front qui
  réenverrait un montant à une étape 2.
