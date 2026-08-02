# Généraliser le filtre temporel (statistiques/revenus) — intégration frontend

## Contexte

Le backend expose désormais un filtre temporel unifié, remplaçant les 3 options
fixes actuelles (Semaine/Mois/3 mois). Migration SQL déjà écrite :
`supabase/migrations/20260802180000_unified_period_filter.sql` (à exécuter par
le gérant du projet — pas encore appliquée à la base distante).

Elle ajoute 3 fonctions Postgres (RPC), additives, qui ne cassent rien
d'existant :

1. **`public.resolve_period_range(p_preset, p_start_date, p_end_date, p_floor_date)`**
   → fonction interne de calcul de plage de dates (pas besoin de l'appeler
   depuis le front, elle est utilisée par les 2 RPC ci-dessous).

2. **`public.get_gerant_stats_period(p_terrain_id, p_preset, p_start_date, p_end_date)`**
   → **remplace entièrement** `fetchGerantKpis`, `fetchRevenusParJour`,
   `fetchReservationsParCreneau`, `fetchTopJoueurs` et (partiellement)
   `fetchRepartitionPaiements` de `src/services/stats.js`. Un seul aller-retour
   réseau au lieu de 5, agrégation faite en SQL (plus de `.reduce()` côté
   client sur des milliers de lignes — c'est ce qui posait un problème de perf
   sur "1 an" / "depuis toujours").

3. **`public.get_admin_dashboard_stats_period(p_preset, p_start_date, p_end_date)`**
   → variante paramétrée de `get_admin_dashboard_stats()` (qui reste
   inchangée). À utiliser si vous branchez `StatsGrid.jsx` sur de vraies
   données (voir section dédiée plus bas — actuellement 100% mock).

## Contrat des préréglages (`p_preset`)

Valeurs acceptées, exactement : `'24h' | '48h' | '3d' | '1w' | '2w' | '1m' | '3m' | '1y' | 'all'`.

Pour une période personnalisée : passer `p_preset = null` (ou omis) et fournir
`p_start_date` / `p_end_date` (format `YYYY-MM-DD`). Le backend valide
`start <= end` et renvoie une erreur explicite sinon.

`'all'` = pas de borne inférieure réelle : le backend utilise la date de
création du compte gérant (`profiles.created_at`) comme plancher pour
`get_gerant_stats_period`.

## Tâche 1 — `GerantStats.jsx` + `services/stats.js` (priorité, données réelles)

### Remplacer le sélecteur de période

Dans [src/pages/GerantStats.jsx](src/pages/GerantStats.jsx), le tableau `PERIODES`
(lignes 209-213) et le rendu du sélecteur (lignes 399-408) sont à remplacer par
un composant de sélection de période supportant :
- Les 9 préréglages : 24h, 48h, 3 jours, 1 semaine, 2 semaines, 1 mois, 3 mois,
  1 an, Depuis toujours.
- Un mode "période personnalisée" avec deux `<input type="date">` (ou un
  date-range picker si une lib est déjà utilisée ailleurs dans le repo).

L'état `periode` (actuellement `'week' | 'month' | 'quarter'`, ligne 217) doit
devenir un objet du type :
```js
{ mode: 'preset', preset: '1m' }
// ou
{ mode: 'custom', startDate: '2026-07-01', endDate: '2026-08-02' }
```

### Remplacer les appels de données

Dans [src/services/stats.js](src/services/stats.js), remplacer les fonctions
`fetchGerantKpis` (ligne 125), `resolveDateDebut` (ligne 204),
`fetchRevenusParJour` (ligne 225), `fetchReservationsParCreneau` (ligne 257),
`fetchTopJoueurs` (ligne 294) par un seul appel :

```js
export const fetchGerantStatsPeriod = async (terrainId, period) => {
  const { data, error } = await supabase.rpc('get_gerant_stats_period', {
    p_terrain_id: terrainId,
    p_preset: period.mode === 'preset' ? period.preset : null,
    p_start_date: period.mode === 'custom' ? period.startDate : null,
    p_end_date: period.mode === 'custom' ? period.endDate : null,
  });
  if (error) throw handleServiceError(error, 'fetchGerantStatsPeriod');
  return data;
};
```

Forme exacte du JSON renvoyé (`data`) :
```jsonc
{
  "date_debut": "2026-07-03", "date_fin": "2026-08-02",
  "kpi": {
    "revenus": 450000, "reservations": 32, "tauxOccupation": 78,
    "noteMoyenne": 4.6, // ou null si aucun avis sur la période
    "parStatut": { "confirmee": 20, "terminee": 5, "annulee": 3, "en_attente": 4 },
    "noteDistribution": { "cinq": 60, "quatre": 30, "troisOuMoins": 10 } // ou null
  },
  "revenus_par_jour": [ { "date_slot": "2026-07-03", "montant": 15000, "all": 22000 } ],
  "reservations_par_creneau": [
    { "heure": "18h", "nb": 4, "reservations": [
      { "id": "...", "joueur": "...", "terrain": "...", "montant": 15000, "statut": "confirmee" }
    ]}
  ],
  "top_joueurs": [
    { "id": "...", "nom": "...", "reservations": 6, "montant": 90000,
      "historique": [ { "date": "2026-07-20", "terrain": "...", "montant": 15000, "statut": "confirmee" } ] }
  ],
  "repartition_paiements": [ { "mode": "wave", "montant": 300000, "transactions": 12 } ]
}
```

Points d'attention en adaptant `GerantStats.jsx` (à partir de la ligne 262,
`loadStats`) :
- Un seul `supabase.rpc(...)`, plus de `Promise.all` sur 5 fonctions.
- `historique[].date` est maintenant une date ISO brute (`"2026-07-20"`), pas
  `new Date(r.date_slot).toLocaleDateString('fr-FR')` — reformater côté front
  si besoin d'affichage (le tri par date est déjà fait côté SQL, plus besoin
  du `.sort()` client actuel ligne 328).
- `statut` reste la valeur brute de l'enum (`confirmee`, `terminee`, ...) —
  gardez `mapStatutLabel` côté front tel quel (stats.js ligne 214) pour
  l'affichage, la RPC ne renvoie pas de libellé français.
- `repartition_paiements` : la RPC ne renvoie plus `label`/`color`/`pct` —
  gardez le mapping `labels`/`colors` déjà présent dans
  `fetchRepartitionPaiements` (stats.js lignes 360-361) et calculez le `pct`
  côté front à partir de `montant` (comme avant). **Changement de
  comportement** : `repartition_paiements` est désormais filtré par la
  période sélectionnée (avant : toujours all-time) — c'est voulu par la
  demande initiale ("versements ... etc." doivent suivre le filtre).
- **Changement de comportement** : `kpi.noteMoyenne` / `noteDistribution`
  sont maintenant calculés sur la période sélectionnée (avant : toujours
  all-time, quel que soit le filtre période). Vérifiez que ça correspond à
  l'attente produit — sinon dites-le, la RPC peut être ajustée pour ignorer
  la période sur les avis.

### Export CSV/PDF

`handleExportCSV` (ligne 314) et `handleExportPDF` (ligne 326) utilisent
`periode` pour le nom de fichier / label. Remplacez `PERIODES.find(p => p.key
=== periode)?.label` par un label généré depuis le nouvel état period (ex:
"1 mois", ou `"12/07/2026 – 02/08/2026"` pour le mode custom — utilisez
`date_debut`/`date_fin` renvoyés par la RPC pour être exact).

## Tâche 2 (optionnelle, à discuter) — `StatsGrid.jsx` (dashboard admin)

[src/components/StatsGrid.jsx](src/components/StatsGrid.jsx) est **actuellement
100% mock** : `metricsMap` (lignes 65-71) est codé en dur, aucun appel réseau.
Pour respecter la demande "généraliser à tout le SaaS (Dashboard...)", il
faudrait :
- Remplacer `filterOptions` (lignes 56-62) par les mêmes 9 préréglages + le
  mode personnalisé (composant partagé avec `GerantStats.jsx` si possible,
  pour éviter la duplication de la logique du sélecteur).
- Remplacer `metricsMap[filter]` par un appel à
  `supabase.rpc('get_admin_dashboard_stats_period', { p_preset, p_start_date, p_end_date })`.
- Le JSON renvoyé : `{ date_debut, date_fin, terrains_actifs, reservations, revenus, revenus_commissions, joueurs_inscrits, taux_occupation_moyen }`.
  Notez que `revenus` = revenu brut plateforme, `revenus_commissions` = part
  commission (déjà calculée avec le taux configuré dans `system_settings`).
  `joueurs_inscrits` est cumulatif jusqu'à `date_fin` (pas "nouveaux sur la
  période"), pour matcher le comportement actuel du mock qui montre un total
  croissant.

C'est un composant plus petit — je vous laisse juger si ça vaut le coup de le
faire dans la même passe ou en suivi séparé, vu que c'est actuellement du
mock pur (pas de régression fonctionnelle réelle en jeu).

## Contraintes

- Ne touchez pas aux autres exports de `stats.js` (`fetchAdminStats`,
  `fetchOccupationByQuartier`, `fetchRecentReservations`,
  `fetchCreneauxDisponibles`, `fetchCreneauxByDate`, `createCreneau`,
  `updateCreneau`, `deleteCreneau`, `formatAmountAbbreviated`) — aucun lien
  avec ce chantier.
- `get_admin_dashboard_stats()` (sans le suffixe `_period`) reste inchangée et
  continue d'alimenter `AdminDashboard.jsx` (lignes 83-159) — ne pas y
  toucher sauf si vous migrez explicitement vers la variante `_period`.
- Les deux nouvelles RPC sont accessibles aux `authenticated` uniquement
  (comme le reste du schéma RLS) ; `get_gerant_stats_period` s'appuie sur les
  policies RLS existantes (un gérant ne voit que ses propres terrains/
  réservations, peu importe ce qu'on lui passe en paramètre).
