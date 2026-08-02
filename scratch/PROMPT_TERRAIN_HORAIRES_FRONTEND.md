# Prompt — Créneaux personnalisables par le gérant (intégration frontend)

## Contexte

Migration déjà écrite : `supabase/migrations/20260802190000_terrain_horaires_and_overlap_fix.sql`
(pas encore appliquée à la base distante — voir note en fin de ce document).

Important, pour ne pas refaire un travail déjà fait : **les créneaux affichés
au joueur dans `BookingFlow.jsx` viennent déjà réellement de la table
`public.creneaux`** via `fetchCreneauxDisponibles(terrainId, date)` — ce
n'est plus une liste statique côté frontend (ça l'était avant, cf.
`scratch/PROMPT_FIX_UNITECHPAY_FRONTEND.md`, déjà corrigé depuis). Le vrai
problème que cette migration résout : **rien ne peuplait automatiquement
`creneaux`**. Un gérant devait tout créer à la main via `GerantPlanning.jsx`
(créneau par créneau, ou bulk sur 30 jours sans renouvellement). Un nouveau
terrain sans action du gérant n'avait AUCUN créneau, jamais → invisible côté
réservation.

La migration ajoute :

1. **`public.terrain_horaires`** — table de config récurrente par terrain
   (`jour_semaine` 0-6, `heure_debut`, `heure_fin`, `intervalle_minutes`,
   `prix_override`, `actif`). RLS : gérant propriétaire + admin, même
   pattern que `creneaux`.
2. **`public.set_terrain_horaires(p_terrain_id, p_horaires jsonb)`** —
   RPC qui remplace toute la config d'un terrain en un appel et matérialise
   immédiatement 45 jours de `creneaux` à partir de cette config.
3. **Génération automatique** : un cron quotidien reconduit une fenêtre
   glissante de 45 jours pour tous les terrains actifs — y compris ceux
   **sans** config custom (fallback 08:00-23:00/1h par défaut). Aucune
   action requise pour que ça continue de fonctionner.
4. **Anti-chevauchement** (bug corrigé, pas juste une feature) : une
   réservation de 2h bloque désormais réellement le créneau suivant côté
   base (contrainte d'exclusion sur plage horaire). `create_reservation_safe`
   renvoie maintenant une erreur explicite `"Ce créneau chevauche une
   réservation déjà existante"` (au lieu de laisser passer silencieusement).

## Tâche 1 — Page de config horaires côté gérant (nouveau)

Pas de page existante pour ça — à créer, ou à ajouter dans
[src/pages/GerantPlanning.jsx](src/pages/GerantPlanning.jsx) (qui gère déjà
les créneaux ponctuels/bulk pour ce terrain, cohérent d'y ajouter la config
récurrente au-dessus).

UI attendue : pour chaque jour de la semaine (Lun-Dim), une ou plusieurs
plages `heure_debut` → `heure_fin` + `intervalle_minutes` (ex: 60 = créneaux
d'1h) + `prix_override` optionnel + toggle actif/inactif. Un bouton
"Enregistrer" qui appelle :

```js
const { data, error } = await supabase.rpc('set_terrain_horaires', {
  p_terrain_id: terrain.id,
  p_horaires: [
    { jour_semaine: 1, heure_debut: '08:00', heure_fin: '22:00', intervalle_minutes: 60, prix_override: null, actif: true },
    { jour_semaine: 6, heure_debut: '10:00', heure_fin: '23:00', intervalle_minutes: 90, prix_override: 20000, actif: true },
    // ... un objet par plage ; plusieurs plages possibles pour le même jour_semaine
  ],
});
```

`data` renvoyé = les lignes `terrain_horaires` créées (utile pour re-remplir
le formulaire). L'appel remplace **toute** la config existante (delete+insert
atomique côté serveur) — envoyer la liste complète à chaque sauvegarde, pas
un diff.

Pour lire la config actuelle au chargement de la page :
```js
const { data } = await supabase
  .from('terrain_horaires')
  .select('*')
  .eq('terrain_id', terrain.id)
  .order('jour_semaine', { ascending: true });
```
(table normale + RLS, comme `creneaux` déjà utilisé dans ce fichier — pas
besoin d'une RPC de lecture dédiée.)

Validation à faire côté client avant l'appel (le serveur valide aussi et
renverra une erreur explicite, mais autant donner un feedback immédiat) :
`heure_fin > heure_debut`, `intervalle_minutes > 0`, `jour_semaine` entre 0
et 6.

**Limitation à connaître et respecter dans l'UI** : pas de plage traversant
minuit (ex. terrain ouvert 20h-02h) — `creneaux.heure_fin` est un `TIME`
simple, pas un horodatage, donc une plage doit rester dans la même journée
calendaire. Si un gérant a besoin de ça, ce serait un chantier séparé
(changer le type de colonne) — ne pas essayer de le contourner côté UI.

## Tâche 2 — Gestion d'erreur de chevauchement dans `BookingFlow.jsx`

`create_reservation_safe` peut maintenant échouer avec le message "Ce
créneau chevauche une réservation déjà existante" (en plus du message
existant "Ce créneau vient d'être réservé"). Vérifiez que le chemin d'erreur
de la création de réservation (probablement dans `createReservation()` côté
`src/services/reservations.js`, ou l'appelant dans `BookingFlow.jsx`)
affiche bien `error.message` tel quel à l'utilisateur plutôt qu'un message
générique — d'après `src/lib/errorHandler.js`, à vérifier que ce cas n'est
pas absorbé par un message trop générique.

Dans la pratique, ce cas ne devrait presque jamais se produire pour un
joueur (les créneaux affichés viennent déjà de `creneaux`, qui reflète
`bookedSlots` en Realtime) — c'est un filet de sécurité serveur pour la
fenêtre de concurrence, pas un flux normal.

## Tâche 3 (à discuter, hors périmètre strict de la demande) — Sélecteur de date

En lisant le code pour ce chantier, j'ai remarqué que `BookingFlow.jsx`
(ligne 159) initialise `selectedDate` une seule fois à la date du jour et
**n'a aucun sélecteur de date** — un joueur ne peut réserver qu'aujourd'hui.
Ce n'est pas ce qui était demandé ici, mais ça limite fortement l'intérêt de
la génération de créneaux sur 45 jours si personne ne peut naviguer vers ces
dates. Je le signale sans le traiter — dites-moi si vous voulez que ce soit
inclus dans ce chantier ou géré séparément.

## Contraintes

- Ne pas toucher à `fetchCreneauxDisponibles` ni à la logique Realtime
  existante de `BookingFlow.jsx` (`bookedSlots`, `wantedSlots`) — inchangées,
  toujours correctes.
- La migration n'a pas encore été exécutée sur la base distante — si vous
  testez en local/dev avant que ce soit fait, `terrain_horaires` et
  `set_terrain_horaires` n'existeront pas encore.
