# PROMPT — Diagnostic crash "Abonnement & Tarifs" (number 1 is not iterable)

## Symptôme

En ouvrant l'onglet "Abonnement & Tarifs" du dashboard gérant, la page affiche un écran d'erreur générique :

```
Erreur d'affichage du composant
number 1 is not iterable (cannot read property Symbol(Symbol.iterator))
```

Ça vient très probablement de `src/pages/GerantTarifs.jsx` et/ou `src/components/SubscriptionCheckoutModal.jsx` (ce dernier est monté en permanence sur cette page, même `isOpen=false`, donc ses hooks s'exécutent dès l'affichage de la page).

## Ta tâche

1. **Récupère la stack trace complète** dans la console navigateur (F12 → Console) au moment de l'erreur — React affiche normalement une cascade "at NomComposant (fichier.jsx:LIGNE:COL)". C'est la manière la plus rapide de localiser la ligne exacte.

2. **Piste déjà identifiée à vérifier en premier** : `src/components/SubscriptionCheckoutModal.jsx` (lignes 33 et 35) et `src/components/BoostCheckoutModal.jsx` (lignes 41 et 43) utilisent une syntaxe générique TypeScript dans des fichiers `.jsx` (pas `.tsx`) :
   ```jsx
   const [methode, setMethode] = useState<'wave' | 'orange_money'>('wave');
   const [phoneError, setPhoneError] = useState<string | null>(null);
   ```
   Selon la configuration esbuild/Vite du projet, ce n'est pas forcément supporté dans un fichier `.jsx` (le loader `jsx` d'esbuild, par opposition à `tsx`, ne retire pas les annotations de type). Vérifie si c'est la cause, et si oui corrige en retirant l'annotation générique (le typage n'apporte rien en `.jsx` de toute façon) :
   ```jsx
   const [methode, setMethode] = useState('wave');
   const [phoneError, setPhoneError] = useState(null);
   ```

3. **Si ce n'est pas la cause**, regarde du côté de `GerantTarifs.jsx` : imports `activateFreePlan`, `startTrial` depuis `src/services/subscriptions.js` — confirme que ces deux fonctions existent bien et sont exportées (elles n'apparaissaient pas dans la dernière version de ce fichier que j'ai sous les yeux, qui exportait `fetchUserPlanAndLimits`, `fetchAllPlanLimits`, `checkUserQuota`, `initiateSubscriptionPayment`, `fetchSubscriptionStatus`, `initiateBoostPayment`, `fetchBoostStatus`, `getBoostStats`, `fetchGerantBoosts` — pas ces deux-là). Si elles sont absentes ou mal exportées, ça peut expliquer un comportement inattendu ailleurs (pas forcément ce crash précis, mais à vérifier tant qu'on y est).

## Contexte additionnel

Ce crash est apparu juste après l'intégration de `usePaymentFlow.ts` / `paymentRedirect.ts` / `SubscriptionCheckoutModal.jsx` / `BoostCheckoutModal.jsx` — voir aussi `scratch/PROMPT_FIX_PAYMENT_FLOW_CONTRACT_MISMATCH.md` pour d'autres incohérences déjà identifiées sur ces mêmes fichiers (contrat d'API avec `create-payment`, RPC `get_payment_status` inexistante). Il est possible que ce soit lié ou complètement indépendant — traite-le comme un bug séparé à isoler d'abord via la stack trace.

## Livrable attendu

- La stack trace exacte.
- Le fichier + ligne responsable du crash.
- Le correctif appliqué.
- Confirmation que la page "Abonnement & Tarifs" s'affiche à nouveau normalement (sans navigation vers le checkout, juste l'affichage de la grille tarifaire).
