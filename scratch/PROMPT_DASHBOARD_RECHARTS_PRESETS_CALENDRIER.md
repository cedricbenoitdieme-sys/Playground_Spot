# PROMPT — Dashboard admin (Recharts), nouveaux préréglages de période, calendrier avec saut rapide année/mois

## Contexte

L'utilisateur compare `AdminDashboard.jsx` à un autre de ses SaaS ("Boutique
OS" / Sama Boutik) et veut un niveau de finition équivalent ou meilleur.
Décision explicite : on lève la contrainte "pas de nouvelle librairie de
graphiques" posée dans un prompt précédent (`PROMPT_FIX_DASHBOARD_MRR_LTV_CHURN_TRAFIC.md`)
— **Recharts est approuvé**.

En parallèle, l'utilisateur veut élargir les préréglages de période
disponibles partout dans l'app, et corriger un vrai problème d'ergonomie
dans le calendrier personnalisé : pour choisir une date ancienne (ex.
reculer de 2 ans), il faut cliquer ~48 fois sur la flèche "mois précédent"
au lieu de pouvoir sauter directement à l'année/au mois voulu.

**Déjà fait côté backend** (migration
`supabase/migrations/20260804130000_update_period_presets.sql`, appliquée) :
la fonction partagée `resolve_period_range()` accepte maintenant le set de
préréglages `'24h'|'72h'|'7d'|'14d'|'31d'|'45d'|'3m'|'6m'|'1y'|'all'` (elle
n'acceptait avant que `'24h'|'48h'|'3d'|'1w'|'2w'|'1m'|'3m'|'1y'|'all'`).
Les fonctions appelantes (`get_gerant_stats_period`,
`get_admin_dashboard_stats_period`) n'ont pas changé, elles délèguent tout
à `resolve_period_range()`.

## Ta tâche

### 1. Installer Recharts

```bash
npm install recharts
```

### 2. Mettre à jour `src/components/PeriodSelector.jsx`

Remplace `PRESET_OPTIONS` (lignes 5-15) par le nouveau set, aligné sur le
backend :

```jsx
export const PRESET_OPTIONS = [
  { key: '24h', label: '24h' },
  { key: '72h', label: '72h' },
  { key: '7d',  label: '7j' },
  { key: '14d', label: '14j' },
  { key: '31d', label: '31j' },
  { key: '45d', label: '45j' },
  { key: '3m',  label: '3 mois' },
  { key: '6m',  label: '6 mois' },
  { key: '1y',  label: '1 an' },
  { key: 'all', label: 'Depuis toujours' },
];
```

La barre de préréglages (lignes 44-61) risque d'être trop large avec 10
boutons + "Sur-mesure" sur mobile — vérifie que `overflow-x-auto
no-scrollbar` (déjà présent ligne 44) suffit, sinon réduis le padding
horizontal des boutons (`px-3` → `px-2.5`) pour que ça tienne mieux.

### 3. Mettre à jour les valeurs par défaut qui référencent les anciennes clés

Ces 4 endroits utilisent encore `preset: '1m'` (n'existe plus) ou les
anciens alias `'1w'`/`'3m'` — remplace par les nouvelles clés (`'31d'`
comme équivalent le plus proche de "1 mois") :

- `src/services/stats.js:126` — `fetchGerantStatsPeriod(..., period = { mode: 'preset', preset: '1m' })` → `preset: '31d'`
- `src/services/stats.js:128` — mapping legacy `period === 'week' ? '1w' : period === 'quarter' ? '3m' : '1m'` → `period === 'week' ? '7d' : period === 'quarter' ? '3m' : '31d'`
- `src/services/stats.js:150` — `fetchAdminDashboardStatsPeriod(period = { mode: 'preset', preset: '1m' })` → `preset: '31d'`
- `src/pages/GerantStats.jsx:241` — `useState({ mode: 'preset', preset: '1m' })` → `preset: '31d'`
- `src/components/StatsGrid.jsx:56` — `useState({ mode: 'preset', preset: '1m' })` → `preset: '31d'`

Cherche aussi d'éventuelles autres occurrences littérales de `'48h'`,
`'3d'`, `'1w'`, `'2w'` dans `src/` avant de considérer cette étape finie
(grep rapide sur ces 4 chaînes).

### 4. Calendrier — saut rapide année/mois dans `src/components/CustomDatePicker.jsx`

Actuellement (lignes 146-179), le header du calendrier affiche
`{MONTHS_FR[viewMonth]} {viewYear}` en texte statique, avec seulement des
flèches précédent/suivant qui avancent d'un mois à la fois — remonter de
2 ans demande ~24 clics sur la flèche gauche. Ajoute un mode de navigation
à deux niveaux :

- Rendre le label `{MONTHS_FR[viewMonth]} {viewYear}` cliquable → bascule
  un état local `pickerView` (`'days' | 'months' | 'years'`), par défaut
  `'days'`.
- Vue `'months'` : grille 3×4 des 12 mois de `viewYear` (boutons style
  cohérent avec la grille de jours existante), avec les flèches
  gauche/droite du header qui, dans ce mode, changent `viewYear` ±1 au
  lieu du mois. Cliquer un mois → repasse en vue `'days'` avec ce mois
  sélectionné.
- Vue `'years'` : grille des années (ex. décennie courante, 12 ans
  affichés), flèches gauche/droite qui changent de décennie (±12 ans).
  Cliquer une année → passe en vue `'months'` pour cette année. Pour y
  accéder, rendre le `{viewYear}` du label spécifiquement cliquable en
  plus du mois (ou un seul clic sur tout le label ouvre `'months'`, et un
  second clic sur le nombre d'année une fois en vue `'months'` ouvre
  `'years'` — à toi de choisir l'enchaînement le plus naturel, du moment
  que 3 clics suffisent pour aller de "aujourd'hui" à "il y a 2 ans").
- Respecte les bornes `min`/`max` déjà gérées pour les jours (lignes
  73-75) : désactive aussi les mois/années hors bornes dans les nouvelles
  vues.
- Ce composant est partagé par toute l'app (`PeriodSelector`,
  `BookingFlow`, `GerantPlanning`, etc. — voir usages via grep sur
  `CustomDatePicker`) : le correctif s'applique donc automatiquement
  partout, pas besoin de dupliquer le travail page par page.

### 5. Redesign des graphiques de `src/pages/admin/AdminDashboard.jsx` avec Recharts

Remplace les visualisations actuelles en CSS custom par des composants
Recharts, sans changer les RPCs/données déjà branchées (`revenueKpis`,
`ltvFunnel`, `churn`, `signupsTrend` — states existants lignes 33-36 et
plus bas) :

- **Répartition MRR par plan** (`revenueKpis.par_plan`, actuellement une
  grille de cartes lignes ~304-321) : ajoute un donut Recharts
  (`PieChart` + `Pie` avec `innerRadius`) à côté ou au-dessus des cartes
  existantes — garde les cartes pour le détail chiffré, le donut est un
  résumé visuel complémentaire.
- **Historique MRR** : `revenueKpis.tendance_12_mois` (`[{mois,
  nouveau_mrr}]`) n'est pour l'instant pas affiché du tout dans le
  fichier — ajoute un `AreaChart` ou `LineChart` Recharts avec ces
  données (axe X = mois, axe Y = nouveau_mrr).
- **Funnel d'activation gérants** (lignes 340-371) : tu peux garder les
  barres horizontales actuelles (le funnel "en escalier" avec % à côté
  fonctionne bien tel quel et Recharts n'a pas de type funnel natif
  propre) — améliore juste le style (dégradé de couleur du plus foncé au
  plus clair selon l'étape, transitions).
- **Tendance des inscriptions** (`signupsTrend`, section "Inscriptions &
  Acquisition", lignes ~397-424 actuellement en barres CSS faites main) :
  remplace par un `BarChart` Recharts empilé (Joueurs/Gérants), avec
  tooltip Recharts natif au survol (remplace le tooltip CSS actuel lignes
  412-414).
- **Ajoute le `PeriodSelector`** (import depuis `../../components/PeriodSelector`)
  au-dessus de la section "Tendance des inscriptions" pour permettre de
  choisir la fenêtre (au lieu des 30 jours fixes actuels). Convertis le
  preset sélectionné en nombre de jours pour l'appel existant
  `callRpc('admin_get_signups_trend', { p_jours: ... })` — mapping simple
  côté client, ex. `{ '24h': 1, '72h': 3, '7d': 7, '14d': 14, '31d': 31,
  '45d': 45, '3m': 90, '6m': 180, '1y': 365, 'all': 730 }`. En mode
  `custom`, calcule le nombre de jours entre `startDate` et `endDate`.
- **Ne branche pas** le `PeriodSelector` sur le MRR/ARR/LTV (métriques
  instantanées, "maintenant", pas de notion de fenêtre temporelle) ni sur
  le taux de churn ou l'historique MRR 12 mois — ces RPCs
  (`admin_get_revenue_kpis`, `admin_get_ltv_funnel`, `admin_get_churn_rate`)
  n'acceptent pas encore de paramètre de période côté serveur. Garde-les
  tels quels pour cette itération (avec leur legend actuelle "30j"/"12
  mois" bien visible pour que ce ne soit pas ambigu), sans essayer de les
  refiltrer côté client sur des données partielles.

## Vérification

- `npm run build` (ou `npm run dev`) sans erreur après ajout de Recharts.
- Dashboard admin : les 4 graphiques (donut plan, historique MRR, funnel,
  tendance inscriptions) s'affichent avec de vraies données (même
  clairsemées, comme actuellement avec 1 gérant) sans zone blanche vide
  ni erreur console.
- `PeriodSelector` sur la tendance des inscriptions : changer de
  préréglage recharge bien `signupsTrend` avec le bon nombre de jours.
- Calendrier (`CustomDatePicker`) : ouvrir un des date-pickers de l'app
  (ex. mode "Sur-mesure" du `PeriodSelector`), cliquer sur le label
  mois/année, arriver en vue mois, cliquer l'année pour la vue années,
  sélectionner une année 2 ans en arrière, un mois, un jour — confirme
  qu'on arrive à destination en 3-4 clics au lieu de ~24.
- Vérifie qu'aucune page utilisant `PeriodSelector` ou `CustomDatePicker`
  n'est cassée par le renommage des clés de préréglage (grep final sur
  `'48h'`, `'3d'`, `'1w'`, `'2w'`, `'1m'` dans tout `src/` — doit être
  vide).

## Interdictions

- Ne touche pas aux 4 RPC backend existantes ni à `resolve_period_range()`
  (déjà mis à jour côté DB) — tout le travail de cette tâche est
  frontend.
- Ne modifie pas `Telemetrie.jsx` : son système de plage horaire
  (`'live'/'24h'/'48h'/'7j'/'30j'`) est indépendant de
  `PeriodSelector`/`resolve_period_range` et hors scope ici.
- Les 4 blocs analytics MRR/LTV/Churn/Funnel restent strictement réservés
  au super admin (contrainte déjà actée) — n'expose rien de nouveau à un
  autre rôle en réutilisant ces composants ailleurs.
