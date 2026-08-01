# Prompt — Anti double-réservation côté frontend + payloads mobiles allégés

## Contexte

Backend en place (migration `20260725170000_reservation_payment_robustness.sql`) :
- Index unique partiel sur `reservations(terrain_id, date_slot, heure_slot)`
  (lignes actives uniquement) — garantie atomique anti double-booking.
- Nouvelle RPC `create_reservation_safe(p_terrain_id, p_joueur_id,
  p_creneau_id, p_terrain_nom, p_joueur_nom, p_date_slot, p_heure_slot,
  p_montant, p_duree_heures)` — insère la réservation et traduit toute
  violation de l'index unique en message propre : **"Ce créneau vient
  d'être réservé"** (`error.code = '23505'`, `error.message` = ce texte
  exact).

## Tâche 1 — Remplacer l'INSERT direct par la RPC dans `createReservation()`

`src/services/reservations.js:117-168` fait aujourd'hui : un SELECT de
pré-vérification (racé, TOCTOU — deux requêtes concurrentes peuvent
toutes les deux le passer) puis un INSERT séparé. À remplacer par un
appel unique à la RPC, qui est atomique :

```js
export const createReservation = async ({
  terrain_id, joueur_id, creneau_id, terrain_nom, joueur_nom,
  date_slot, heure_slot, montant, duree_heures = 1
}) => {
  const rl = checkRateLimit('createReservation', RATE_LIMITS.createReservation.maxRequests, RATE_LIMITS.createReservation.windowMs);
  if (!rl.allowed) {
    throw new Error(`Trop de réservations. Réessayez dans ${rl.retryAfter}s.`);
  }

  const currentUser = await getCurrentUser();
  const safeJoueurId = currentUser?.id || joueur_id;
  if (!safeJoueurId) {
    throw new Error('Authentification requise pour créer une réservation.');
  }

  const amountCheck = validateAmount(montant);
  if (!amountCheck.valid) throw new Error(amountCheck.error);

  const terrainIdCheck = validateUUID(terrain_id);
  if (!terrainIdCheck.valid) throw new Error(`terrain_id: ${terrainIdCheck.error}`);
  if (creneau_id) {
    const creneauIdCheck = validateUUID(creneau_id);
    if (!creneauIdCheck.valid) throw new Error(`creneau_id: ${creneauIdCheck.error}`);
  }

  // Plus de pré-check SELECT racé : la RPC garantit l'atomicité et
  // renvoie déjà le message clair en cas de conflit.
  const { data, error } = await supabase.rpc('create_reservation_safe', {
    p_terrain_id: terrain_id,
    p_joueur_id: safeJoueurId,
    p_creneau_id: creneau_id,
    p_terrain_nom: terrain_nom,
    p_joueur_nom: joueur_nom,
    p_date_slot: date_slot,
    p_heure_slot: heure_slot,
    p_montant: montant,
    p_duree_heures: duree_heures,
  });

  if (error) {
    // ⚠️ IMPORTANT : ne PAS laisser handleServiceError() intercepter ce
    // message. Sa règle de sécurité 5.3 mappe génériquement tout code
    // '23505'/'23514' vers "Les données envoyées sont invalides." — ce
    // qui écraserait notre message volontairement explicite. Même
    // pattern de contournement que l'ancien pré-check (ligne 132 avant
    // ce changement) : on détecte CE message précis et on le laisse
    // passer tel quel.
    if (error.message?.includes("vient d'être réservé")) {
      throw new Error(error.message);
    }
    throw handleServiceError(error, 'createReservation');
  }

  securityLog.paymentInitiated(safeJoueurId, data.id, montant, 'reservation');
  return data;
};
```

Points à vérifier en implémentant :
- `getCurrentUser`/`checkRateLimit`/`validateAmount`/`validateUUID`/
  `securityLog` restent tels quels, seule la partie "vérification +
  insert" change.
- La RPC est `SECURITY INVOKER` : elle respecte la policy RLS
  `reservations_insert_joueur` existante (`joueur_id = auth.uid()`)
  automatiquement — pas de changement de comportement d'autorisation.

## Tâche 2 — Payloads plus légers pour les lectures mobiles fréquentes

Repéré en marge de l'audit perf (pas bloquant, mais direct par rapport à
la demande "pas de sur-fetching de colonnes inutiles sur réseau lent") :

- **`fetchTerrains()`** (`src/services/terrains.js:35-61`) — utilisé par
  `Discovery.jsx`, `ChatWidget.jsx`, `TerrainDetail.jsx` — fait
  `select('*, profiles!gerant_id(nom,tel,email), terrain_amenities(id,label,icone)')`
  pour CHAQUE terrain, y compris pour un simple affichage carte/liste où
  ni le contact du gérant ni les amenities détaillées ne sont affichés
  avant le clic sur un terrain précis. Si la carte/liste a son propre
  composant d'affichage (pas le détail), envisager une variante allégée
  (`id, nom, quartier, price, rating, reviews_count, image_url, lat, lng,
  surface, size` uniquement) et ne résoudre `profiles`/`terrain_amenities`
  qu'au clic (`fetchTerrainById` les a déjà).
- **`fetchCreneauxDisponibles()`** (`src/services/stats.js:375-385`) —
  `select('*')` sur `creneaux` alors que le joueur n'a besoin que de
  `id, heure_debut, heure_fin, prix_override` pour afficher les créneaux
  cliquables (pas `motif_blocage`, `created_at`, `updated_at`, `statut`
  puisqu'il filtre déjà `.eq('statut','disponible')`).

Aucun changement de comportement fonctionnel dans les deux cas, juste
moins d'octets sur le réseau mobile.

## Ne pas toucher

- `src/lib/errorHandler.js` — la règle 5.3 (messages génériques) reste
  intentionnelle pour tout le reste ; le contournement ci-dessus est
  ciblé sur ce seul message, pas une modification globale du handler.
- RLS / policies — aucune n'a besoin de changer (audité côté SQL, voir
  section 4 de la migration `20260725170000`).
