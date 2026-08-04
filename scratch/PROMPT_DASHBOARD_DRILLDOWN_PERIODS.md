# PROMPT — Cartes cliquables + sélecteurs de période (Funnel, Volume de réservations, Évolution du MRR)

## Contexte

Sur `AdminDashboard.jsx`, l'utilisateur veut :
1. Pouvoir **cliquer** sur les cartes "Taux Occupation (30j)", "MRR
   (Mensuel)", "ARR (Annuel)", "LTV Moyen" et "Taux de Churn (30j)" pour
   voir des infos supplémentaires **avec un sélecteur de période** (ex.
   voir le MRR tel qu'il était il y a 3 mois, pas juste "maintenant").
2. Un sélecteur de période directement sur la section "Funnel
   d'Activation des Gérants".
3. Un sélecteur de période sur "Volume de Réservations dans le temps"
   (actuellement 3 cartes figées Aujourd'hui/Cette Semaine/Ce Mois).
4. Un sélecteur de période sur "Évolution du MRR (12 derniers mois)".

**Déjà fait côté backend** (migration
`supabase/migrations/20260804150000_dashboard_drilldown_periods.sql`,
appliquée) — toutes rétrocompatibles (appelées sans argument = comportement
actuel inchangé) :

- `admin_get_revenue_kpis(p_preset, p_date_debut, p_date_fin)` — sans
  argument : MRR/ARR "maintenant" (inchangé). Avec un préréglage/période :
  MRR/ARR/`par_plan` reconstitués tels qu'ils étaient à la date de DÉBUT
  de la période résolue (ex. `'3m'` → MRR il y a 3 mois). Nouveaux champs
  dans la réponse : `as_of_date`, `is_now`. **Limite à afficher à
  l'utilisateur dans l'UI** : cette reconstruction historique est une
  approximation basée sur `date_debut`/`date_fin` des abonnements, pas un
  vrai snapshot journalier — un petit texte "Estimation basée sur les
  dates de début/fin d'abonnement" doit accompagner l'affichage dès que
  `is_now` est `false`.
- `admin_get_mrr_trend(p_preset DEFAULT '1y')` — NOUVELLE RPC dédiée au
  graphique "Évolution du MRR", fenêtre ajustable (remplace la fenêtre
  fixe 12 mois qui reste par ailleurs inchangée dans
  `admin_get_revenue_kpis.tendance_12_mois` pour la vue par défaut).
- `admin_get_ltv_funnel(p_preset, p_date_debut, p_date_fin)` — sans
  argument : tout historique confondu (inchangé). Avec préréglage/période :
  funnel + LTV limités à la cohorte de gérants inscrits
  (`profiles.created_at`) dans cette fenêtre.
- `admin_get_churn_rate(p_preset DEFAULT '31d', p_date_debut, p_date_fin)`
  — fenêtre ajustable via le système unifié (défaut 31j, remplace l'ancien
  30j câblé en dur). Champ renommé `perdus_30j` → `perdus_periode`.
- `admin_get_occupation_rate(p_preset DEFAULT '31d', p_date_debut, p_date_fin)`
  — NOUVELLE RPC, équivalent du taux d'occupation déjà calculé dans
  `get_admin_dashboard_stats()` mais avec fenêtre ajustable, pour la
  modale de détail de la carte "Taux Occupation".
- `admin_get_reservations_trend(p_preset DEFAULT '31d')` — NOUVELLE RPC,
  série journalière `[{jour, nb_reservations, montant}]` sur la fenêtre
  choisie, pour remplacer/compléter les 3 cartes figées Jour/Semaine/Mois.

## Ta tâche

### 1. Composant modale de détail réutilisable

Crée un petit composant (ex. `src/components/admin/KpiDetailModal.jsx`)
qui prend en props : `title`, `isOpen`, `onClose`, `periode`,
`onPeriodeChange`, et `children` (le contenu spécifique à la métrique).
Structure : `Modal` existant (`src/components/Modal.jsx`) + header avec
titre + `PeriodSelector` + zone de contenu. Réutilisé par les 5 cartes
cliquables ci-dessous pour éviter de dupliquer la structure de modale 5
fois.

### 2. Cartes cliquables avec modale + période

Dans `AdminDashboard.jsx`, les cartes "Taux Occupation (30j)" (grille
`kpiCards`, ligne ~157-163), "MRR (Mensuel)" (ligne ~235-246), "ARR
(Annuel)" (ligne ~249-260), "LTV Moyen" (ligne ~263-274) et "Taux de
Churn (30j)" (ligne ~277-300) doivent devenir cliquables (`cursor-pointer`,
`onClick`) et ouvrir `KpiDetailModal` avec :

- **Taux Occupation** : état local `occupationPeriode` (défaut
  `{ mode: 'preset', preset: '31d' }`), appel `admin_get_occupation_rate`
  au changement de période, affichage `taux_occupation_pct` +
  `creneaux_reserves`/`creneaux_total`.
- **MRR / ARR** : un seul état partagé `revenueDetailPeriode` (les deux
  cartes ouvrent la même modale avec un onglet ou juste le MRR affiché,
  ARR = MRR × 12 côté client comme actuellement), appel
  `admin_get_revenue_kpis(preset, startDate, endDate)` au changement de
  période, affichage `mrr`/`arr`/`par_plan` avec la mention "Estimation
  basée sur les dates de début/fin d'abonnement" quand `is_now === false`.
- **LTV Moyen** : état `ltvDetailPeriode`, réutilise
  `admin_get_ltv_funnel(preset, ...)` (même RPC que le funnel, mais appel
  indépendant avec son propre état de période — n'essaie pas de partager
  l'état avec la section Funnel du bas, ce sont deux contextes d'usage
  différents), affiche `ltv_moyen` avec mention "cohorte de gérants
  inscrits sur la période" quand une période est sélectionnée.
- **Taux de Churn** : état `churnDetailPeriode` (défaut `'31d'`), appel
  `admin_get_churn_rate(preset, ...)`, affiche `taux_churn_pct`,
  `abonnes_payants_actuels`, `perdus_periode`.

### 3. Sélecteur de période sur le Funnel d'Activation

Section "Funnel d'Activation des Gérants" (lignes ~325-373) : ajoute un
état `funnelPeriode` (défaut `{ mode: 'preset', preset: 'all' }` — tout
historique par défaut, pour ne pas changer le rendu initial actuel), un
`<PeriodSelector>` dans le header de la section (à côté ou sous le titre),
et modifie l'appel existant (actuellement `callRpc('admin_get_ltv_funnel')`
sans argument dans le `useEffect` ligne ~81) pour passer
`{ p_preset: ..., p_date_debut: ..., p_date_fin: ... }` selon
`funnelPeriode`. Affiche `periode_debut`/`periode_fin` retournés par la
RPC en sous-titre quand une cohorte est active (pour clarifier "sur les
gérants inscrits entre X et Y").

### 4. Nouvelle section "Volume de Réservations" avec Recharts + période

Remplace la logique `chartData`/3 cartes actuelle (lignes ~166-172, et sa
zone de rendu plus bas) par :
- Un état `reservationsPeriode` (défaut `{ mode: 'preset', preset: '31d' }`).
- Un `<PeriodSelector>` dans le header de cette section.
- Un appel `callRpc('admin_get_reservations_trend', { p_preset: ... })`
  (ou `p_date_debut`/`p_date_fin` en mode custom — même mapping que déjà
  fait pour `signupsTrend`, lignes ~86-100) dans un `useEffect` dédié.
- Un `BarChart` ou `AreaChart` Recharts (déjà installé, cf. prompt
  précédent sur le redesign des graphiques) affichant `nb_reservations`
  et/ou `montant` par jour sur la période choisie, remplaçant les 3
  cartes de comparaison figées. Garde éventuellement un petit résumé
  chiffré au-dessus du graphique (total réservations + montant total sur
  la période sélectionnée, calculable côté client en sommant le tableau
  retourné).

### 5. Sélecteur de période sur "Évolution du MRR"

Section "Évolution du MRR (12 derniers mois)" (déjà en Recharts suite au
prompt précédent) : ajoute un état `mrrTrendPeriode` (défaut
`{ mode: 'preset', preset: '1y' }`), un `<PeriodSelector>` dans le header
de cette section (remplace le badge statique "12 mois" visible dans la
capture), et un appel dédié `callRpc('admin_get_mrr_trend', { p_preset: ... })`
dans son propre `useEffect`, indépendant de `admin_get_revenue_kpis`
(qui garde sa fenêtre fixe 12 mois pour l'affichage par défaut avant tout
changement de période — évite un appel RPC en double au premier chargement).

## Vérification

- Chargement initial du dashboard : aucune régression, toutes les
  sections affichent les mêmes valeurs qu'avant (les 5 RPC modifiées sont
  rétrocompatibles sans argument).
- Cliquer sur chacune des 5 cartes ouvre bien une modale avec un
  `PeriodSelector` fonctionnel, et les valeurs affichées changent
  correctement en changeant de préréglage (vérifier surtout MRR historique
  vs MRR "maintenant" — la mention d'estimation doit apparaître/disparaître
  correctement selon `is_now`).
- Changer la période sur Funnel, Volume de Réservations et Évolution du
  MRR recharge bien leurs sections respectives indépendamment les unes
  des autres (pas de re-fetch global involontaire de tout le dashboard).
- `npm run build` sans erreur.

## Interdictions

- Ne modifie pas `admin_get_signups_trend`/la section "Inscriptions &
  Acquisition" — déjà traitée dans un prompt précédent, hors scope ici.
- Ne fusionne pas les états de période entre sections différentes (chaque
  section garde son propre `useState` de période) — elles doivent pouvoir
  être filtrées indépendamment les unes des autres.
- Ces fonctionnalités restent strictement super admin (cohérent avec le
  reste du dashboard) — ne les expose pas ailleurs.
