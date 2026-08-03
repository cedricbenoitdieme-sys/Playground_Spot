# PROMPT — Agent Frontend (formulaires de paiement abonnement + boost)

## Contexte

Le backend UnitechPay pour les abonnements gérant et les boosts de visibilité vient d'être rebranché (Edge Function `create-payment` + RPC `handle_unitech_webhook`). Les deux flux fonctionnent de bout en bout côté serveur :

- `initiateSubscriptionPayment({ plan_id, cycle, phone_number, mode })` — dans `src/services/subscriptions.js`
- `initiateBoostPayment({ terrain_id, budget_fcfa, duree_jours, phone_number, mode })` — dans `src/services/subscriptions.js`

Les deux appellent l'Edge Function `create-payment` et renvoient :
- Abonnement : `{ subscription_id, reference, montant, payment_url, qr_code, deep_links }`
- Boost : `{ boost_id, reference, montant, payment_url, deep_links }`

**Problème** : `src/components/BoostCheckoutModal.jsx` et `src/components/SubscriptionCheckoutModal.jsx` sont des coquilles vides. Elles affichent juste un message ("Paiement en ligne indisponible" ou, si `IS_PAIEMENT_ABONNEMENT_ACTIF` est `true`, "Paiement des boosts de visibilité activé.") — aucun formulaire, aucun appel aux services ci-dessus. Résultat : impossible de payer un abonnement ou un boost depuis l'app, quel que soit le flag.

## Ta tâche

Remplacer le contenu de ces deux modales par un vrai formulaire de paiement, sur le modèle de `src/components/paiement/ChoixPaiement.jsx` (déjà fonctionnel pour les réservations) :
- Sélecteur de méthode (Wave / Orange Money)
- Champ téléphone sénégalais avec `validatePhone` (`src/lib/validators.js`)
- Bouton de soumission avec état `loading` + verrouillage anti-double-clic (`paymentLocked`)
- Gestion des erreurs retournées par le service (`err.error`, `err.code`) avec fallback WhatsApp en cas d'erreur passerelle (502)
- Redirection vers `response.payment_url` si présent (comme `ChoixPaiement.jsx`), sinon état d'attente

Le tout **gaté par `IS_PAIEMENT_ABONNEMENT_ACTIF`** (`src/config/paymentConfig.js`) : si `false`, garder l'affichage actuel (message + contact WhatsApp) exactement comme aujourd'hui — ne change rien à ce comportement de repli, ajoute seulement le vrai formulaire dans la branche `IS_PAIEMENT_ABONNEMENT_ACTIF === true`.

### BoostCheckoutModal.jsx

Props actuelles : `{ isOpen, onClose }`. Il manque `terrain_id` — vérifie comment ce composant est monté (cherche les usages de `<BoostCheckoutModal`) et ajoute les props nécessaires (`terrainId`, `budgetFcfa`, `dureeJours` ou un sélecteur pour les choisir si pas déjà fournis par le parent — vérifie s'il existe déjà un curseur budget/durée ailleurs dans l'UI gérant, par exemple sur la page "Mon Terrain" ou un dashboard boost).

Appelle `initiateBoostPayment({ terrain_id, budget_fcfa, duree_jours, phone_number, mode })`.

### SubscriptionCheckoutModal.jsx

Props actuelles : `{ isOpen, onClose, plan }`. `plan` contient déjà `plan_id`/`nom` (vérifie la forme exacte de l'objet passé par l'appelant). Il manque le choix du cycle (mensuel/annuel) — vérifie si le composant parent le passe déjà, sinon ajoute un toggle mensuel/annuel dans la modale (le prix annuel n'existe que pour Pro/Entreprise, `prix_annuel` peut être `null` pour Starter — dans ce cas, ne pas proposer l'option annuelle).

Appelle `initiateSubscriptionPayment({ plan_id: plan.plan_id, cycle, phone_number, mode })`.

## Suivi post-paiement

Après redirection/retour du paiement, l'app doit pouvoir refléter le nouveau statut. Utilise les fonctions déjà présentes dans `src/services/subscriptions.js` :
- `fetchSubscriptionStatus(subscriptionId)` — poll jusqu'à `status !== 'pending'`
- `fetchBoostStatus(boostId)` — poll jusqu'à `statut !== 'en_attente'`

Regarde comment `ChoixPaiement.jsx` / la page `/paiement/attente` gèrent ce polling pour les réservations et reproduis un pattern similaire si rien d'équivalent n'existe déjà pour abonnement/boost.

## Ne pas oublier

- Vérifier/faire ajouter la variable d'environnement `VITE_PAIEMENT_ABONNEMENT_ACTIF=true` sur Vercel (Production + Preview si besoin) — sans elle, tout ce travail reste invisible derrière le message de suspension.
- Ne pas toucher à `ChoixPaiement.jsx` ni au flux de réservation, qui fonctionnent déjà.
- Respecter le contrat : le montant ne doit jamais être envoyé par le front pour un abonnement (c'est `plan_id` + `cycle` qui déterminent le prix côté serveur, via `plan_limits`). Pour le boost, `budget_fcfa` est bien envoyé par le front (c'est un curseur), il sera revalidé côté serveur par `create_pending_boost` (bornes déjà appliquées : minimum 500 FCFA, durée 1 à 90 jours).
