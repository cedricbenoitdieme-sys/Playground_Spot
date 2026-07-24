# Checklist de préparation production — PlaygroundSpot

Constats faits en explorant le repo et en interrogeant la base live (projet Supabase `ahqtcgxrewrfbowblygu`). Chaque case `[ ]` doit être vérifiée/actionnée par toi — je n'ai ni accès aux dashboards Supabase/Vercel/Railway/UnitechPay, ni la légitimité de modifier des réglages d'infra depuis ici.

## 1. Environnement Supabase

- [ ] Confirmer que `ahqtcgxrewrfbowblygu` (celui de `.env.local`) est bien le projet destiné à servir la production réelle, pas un projet de dev partagé par erreur. Élément troublant : **aujourd'hui, 100% des terrains et 13/14 profils dans ce projet sont des données de seed** (voir `PROD_DATA_AUDIT.md`) — cohérent avec un projet pas encore lancé, mais à confirmer explicitement.
- [ ] Vérifier que les variables d'environnement configurées sur la plateforme de déploiement réelle (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) pointent bien vers ce même projet, et non un ancien projet de dev.
- [ ] **Ambiguïté à lever** : le brief de cette tâche mentionne Railway, mais l'historique git récent montre une migration vers Vercel (`vercel.json`, `api/index.js`, commits "migrated to Vercel" / "configure Vercel deployment"). Confirme quelle(s) plateforme(s) sert/servent réellement le trafic de prod aujourd'hui — les vérifications de clés/webhooks ci-dessous doivent être faites sur la bonne plateforme.
- [ ] **Note d'outillage (2026-07-22)** : le connecteur Supabase MCP disponible dans la session qui a ajouté cette note ne voyait que deux projets (`Boutique OS`, `Ogf-pro`) — pas `ahqtcgxrewrfbowblygu`. Si tu veux qu'un futur audit assisté puisse requêter la base live directement (au lieu de compter sur `scratch/audit-seed-data.js` en local), reconnecte ce connecteur au bon compte/organisation Supabase.

## 2. Pas de seed automatique au démarrage

- [x] Vérifié : `supabase/seed.sql` n'est référencé dans aucun script `package.json` (racine ou `backend/`), ni dans `vercel.json`. Aucun hook de build/déploiement ne l'exécute — il ne peut être lancé que manuellement via le SQL Editor Supabase. Rien à corriger ici.

## 3. Policies RLS — revue des policies permissives

La plupart des policies `USING (true)` du schéma sont sans risque (données non sensibles : `creneaux`, `avis`, `terrain_amenities`, `gerant_terrains`). **Une seule mérite une décision produit explicite avant le lancement :**

- [ ] **`profiles_select_public` (`FOR SELECT USING (true)`)** — n'importe qui, y compris avec la seule clé anonyme et sans être connecté, peut lire `email`, `tel`, `quartier`, `nom`, `role`, `statut` de **tous** les utilisateurs. Vérifie si l'app a réellement besoin de cette lecture publique totale (ex: affichage du nom du gérant sur une fiche terrain non connectée) ou si elle peut être restreinte au rôle `authenticated`, ou à un sous-ensemble de colonnes non sensibles via une vue/RPC dédiée. Je ne l'ai pas modifiée moi-même — c'est une décision produit, pas juste technique.

## 4. Clés API / service_role

- [ ] Confirmer qu'aucune clé de **dev** (ancien projet Supabase, ancien environnement) n'est encore active dans les variables d'environnement de la plateforme de déploiement réelle.
- [x] Vérifié dans le code : `src/lib/supabase.js` (frontend) n'utilise que `VITE_SUPABASE_ANON_KEY` — la clé `service_role` n'est utilisée que côté serveur (`backend/server.js`, `backend/routes/*.js`). Pas de fuite de la clé privilégiée dans le bundle frontend.
- [ ] **Recommandation d'hygiène** : la clé `service_role` de `.env.local` a été manipulée à plusieurs reprises pendant cette session de dev assistée par IA (lecture de fichier, scripts `scratch/`). Par précaution avant le lancement réel, envisage de la **régénérer** depuis le Dashboard Supabase (Settings → API) et de mettre à jour toutes les variables d'environnement qui la référencent.

## 5. Webhooks UnitechPay (Wave / Orange Money)

- [ ] `backend/server.js` et `backend/routes/payments.js` appellent tous les deux `https://api.unitech.sn/api.php` — aucune URL "sandbox" visible dans le code, mais **à confirmer directement avec UnitechPay** (dashboard ou doc) que c'est bien l'endpoint production et pas un environnement de test.
- [ ] **Faille concrète trouvée** : la vérification de signature HMAC des webhooks est **actuellement contournable**. `backend/server.js:530` lit `UNITECH_WEBHOOK_SECRET`, mais `backend/routes/webhooks.js:28` lit `UNITECHPAY_WEBHOOK_SECRET` — deux noms de variable différents pour ce qui devrait être le même secret. **Aucun des deux n'est défini dans `.env.local`** actuellement, et le code fait `if (secret && signature) { ...vérifie... }` — si le secret n'est pas configuré, la vérification est **silencieusement ignorée** et n'importe qui peut POSTer un faux paiement "réussi" vers ces endpoints. Avant la prod :
  - Choisir UN seul nom de variable et l'utiliser aux deux endroits.
  - Le renseigner réellement en production avec le secret fourni par UnitechPay.
  - Passer la vérification en **fail-closed** (rejeter la requête si le secret n'est pas configuré ou si la signature ne correspond pas), plutôt que fail-open comme aujourd'hui.
- [ ] **Doublon à clarifier** : `server.js` (`POST /api/payment/unitech/initiate`) et `routes/payments.js` semblent implémenter la même logique d'initiation de paiement UnitechPay en parallèle. Confirme laquelle est réellement utilisée en prod et supprime l'autre pour éviter une dérive (un correctif appliqué à une seule des deux copies).
  - Précision (2026-07-22) : d'après `vercel.json` (`functions: { "api/index.js": ... }` + rewrite `/api/(.*) → /api/index.js`), c'est **`api/index.js`** qui est réellement déployé sur Vercel — `backend/server.js` semble être uniquement pour le dev local (`npm run dev`/`nodemon`). Le webhook réellement exposé en prod est donc `api/index.js` `POST /api/payment/unitech/webhook` (celui avec la faille fail-open ci-dessus), et non `backend/routes/webhooks.js` (`/api/webhooks/unitech`) qui semble être du code jamais branché (`webhook_url` envoyée à UnitechPay pointe toujours vers `/api/payment/unitech/webhook`, jamais vers `/api/webhooks/unitech`).
- [ ] **Bypass de démo à retirer avant prod** : `api/index.js` (route webhook réelle) contient `if (reference.startsWith('mock-')) return res.json({ success: true, ... })` — renvoie un succès sans toucher la base, donc inoffensif tel quel, mais c'est un reliquat de dev qui ne doit pas rester dans le handler de production.
- [ ] **Simulateur de paiement public** : `GET /api/payment/unitech/mock-redirect` (page HTML avec boutons "Simuler Succès/Échec" qui POST directement vers le webhook) est actif dans `api/index.js` et se déclenche automatiquement dès que `UNITECH_API_KEY` est absent côté serveur déployé. Si cette clé venait à manquer par erreur de config sur Vercel prod, de vrais utilisateurs atterriraient sur ce simulateur au lieu d'un vrai paiement Wave/OM. Vérifier que `UNITECH_API_KEY` est bien toujours présente dans les env vars Vercel prod, et envisager de supprimer cette route avant le lancement réel.

## 5bis. Bug frontend lié à une variable d'env de dev (`VITE_API_URL`)

`.env.local` contient `VITE_API_URL=http://localhost:5173/` (valeur de dev). La plupart des appels API du frontend s'en protègent avec `import.meta.env.PROD ? '' : (VITE_API_URL || 'http://localhost:3000')` (bascule vers un chemin relatif `/api/...` en build de prod) — mais **4 fichiers n'ont pas cette garde** et utiliseraient directement `VITE_API_URL` (ou son fallback `http://localhost:3000`) même en production si cette variable était définie (ou absente) côté Vercel :
- [ ] [src/components/BookingFlow.jsx:260](../src/components/BookingFlow.jsx#L260)
- [ ] [src/hooks/usePayment.js:15](../src/hooks/usePayment.js#L15)
- [ ] [src/pages/VerifyTicket.jsx:27](../src/pages/VerifyTicket.jsx#L27)
- [ ] [src/pages/ReservationSuccess.jsx:27](../src/pages/ReservationSuccess.jsx#L27)

Si l'un de ces chemins s'exécute en prod avec `VITE_API_URL` non protégé, l'initiation de paiement et la vérification de ticket appelleraient `localhost` depuis le navigateur de l'utilisateur final et échoueraient silencieusement. À corriger en alignant ces 4 fichiers sur le même pattern `import.meta.env.PROD ? '' : ...` que le reste du code, et à vérifier que `VITE_API_URL` n'est pas défini par erreur dans les env vars Vercel de production.

## 6. Après le nettoyage des données (voir `cleanup_seed_data.sql`)

- [ ] Une fois le script de nettoyage exécuté (mode réel, `v_dry_run := false`), relancer `scratch/audit-seed-data.js` pour confirmer que toutes les tables listées dans `PROD_DATA_AUDIT.md` sont bien à zéro seed.
- [ ] Créer un vrai compte gérant + un vrai terrain avant l'ouverture publique, pour vérifier que le flow complet (création terrain → créneaux → réservation → paiement) fonctionne sans aucune dépendance résiduelle aux IDs de seed.
