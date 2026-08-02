---

## Addendum — 3 angles morts à couvrir

Vérifié contre le code backend réellement déployé (migration, edge functions).

### 1. `paiements.statut` a une 5e valeur : `expire`

Le tableau des enums plus haut liste `en_attente | valide | echoue | rembourse`,
mais il manque `expire`. Un job pg_cron générique préexistant (distinct de
celui d'UnitechPay) fait encore aujourd'hui transitionner certains paiements
`en_attente` vers `expire` après 15 minutes sans webhook. Si l'historique
joueur ou un badge de statut de paiement est affiché quelque part, prévoir ce
5e cas (message équivalent à `echoue` : "paiement non abouti / expiré").

### 2. Deux codes d'erreur `create-payment` en plus du tableau

En plus des 5 codes déjà listés (`creneau_deja_reserve`, `creneau_indisponible`,
`creneau_passe`, `terrain_inactif`, `non_authentifie`), la fonction peut
renvoyer :

| `code` | Cause | Message à afficher |
|---|---|---|
| `creneau_introuvable` | `creneau_id` invalide/inexistant | Ce créneau n'existe pas. Rafraîchis la page. |
| `montant_invalide` | prix calculé serveur < 100 FCFA (config terrain incohérente) | Une erreur est survenue sur le tarif de ce créneau, contacte le support. |

Pas bloquant si non géré explicitement : le champ `error` contient toujours
un message français affichable tel quel en fallback générique. Mais autant
les couvrir pour une UX cohérente avec les 5 autres.

### 3. `qr_code` / `deep_links` (paiement `orange_qr`) — noms de champs non garantis

La doc UnitechPay fournie à l'agent backend ne précise pas la forme exacte de
la réponse `create_orange_qr` (pas de sandbox disponible pour vérifier). Le
backend tente `data.qr_code ?? data.qr_image` et `data.deep_links`, mais si
l'API réelle utilise d'autres noms de clés, ces deux champs reviendront à
`null` **sans erreur** — l'écran QR/deep-links (section 3 du prompt) recevra
donc une réponse 200 valide mais incomplète.

À gérer explicitivement côté UI : si `methode === 'orange_qr'` et que
`qr_code` ET `deep_links` sont tous les deux `null`, afficher un état
d'erreur clair ("QR code indisponible pour le moment, réessaie avec Wave ou
Orange Money") plutôt qu'un écran vide ou un `<img src="null">` cassé. Le
premier vrai paiement `orange_qr` en prod servira à confirmer/corriger le
mapping de champs côté backend.
