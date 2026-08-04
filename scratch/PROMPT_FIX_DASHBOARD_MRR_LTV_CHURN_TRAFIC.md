# PROMPT — Dashboard admin : MRR/ARR, LTV/Funnel, Churn, Trafic (Amplitude)

## Contexte

Suite à une comparaison avec un autre SaaS (Boutique OS), l'utilisateur
veut enrichir `AdminDashboard.jsx` (Vue d'ensemble Super Admin) avec 4
nouveaux blocs analytics. Périmètre volontairement réduit sur demande
explicite : **pas de motifs de résiliation** (aucun flux d'auto-annulation
gérant n'existe) et **pas de CAC** (aucune donnée de coût marketing
trackée) — juste le taux de churn brut, LTV, le funnel, et le trafic via
Amplitude.

**Déjà fait côté backend**, migration
`supabase/migrations/20260804110000_admin_analytics_mrr_ltv_churn.sql`,
4 nouvelles RPC (toutes `super_admin` uniquement, même garde que le reste
de l'admin) :

- `admin_get_revenue_kpis()` → `{ mrr, arr, par_plan: [{plan_id, plan_nom, nb_abonnes, mrr_contribue}], tendance_12_mois: [{mois, nouveau_mrr}] }`
- `admin_get_ltv_funnel()` → `{ ltv_moyen, funnel: { total_gerants, avec_terrain, avec_terrain_approuve, avec_reservation, avec_plan_payant } }`
- `admin_get_churn_rate()` → `{ taux_churn_pct, abonnes_payants_actuels, perdus_30j }`
- `admin_get_signups_trend(p_jours)` → `[{ jour, joueurs, gerants }, ...]` (30 jours par défaut)

## Ta tâche

### 1. Réactiver Amplitude (`src/main.jsx`) — analytics seul, SANS session replay

Décommente l'initialisation existante (lignes 8-11) en retirant la clé
`sessionReplay` — décision explicite de l'utilisateur (2026-08-04) pour
éviter le coût/volume de l'enregistrement vidéo de 100% des sessions,
inutile pour le besoin actuel (trafic/conversion) :
```jsx
amplitude.initAll('76ae6217b9165b8d86d33ca292743f5c', {
  "analytics": { "autocapture": true }
});
```
Ne réintroduis PAS la clé `sessionReplay` — garde uniquement le tracking
analytics (pages vues, clics, événements), pas le replay vidéo.

Amplitude gère lui-même le tracking détaillé (sources de trafic, replay,
funnels avancés) — consultable directement sur le dashboard Amplitude, pas
besoin de le répliquer dans l'app. Le point 5 ci-dessous ajoute un signal
minimal complémentaire directement dans notre propre dashboard (inscriptions
par jour), qui ne dépend pas d'Amplitude.

### 2. Bloc MRR / ARR

Nouvelle section dans `AdminDashboard.jsx` (après la grille de KPI
existante ou en zone dédiée) :
```jsx
const [revenueKpis, setRevenueKpis] = useState(null);
useEffect(() => {
  callRpc('admin_get_revenue_kpis').then(setRevenueKpis).catch(console.error);
}, []);
```
Affiche `mrr`/`arr` en cartes (format FCFA, `formatFCFA` déjà présent
dans le fichier), la répartition par plan (`par_plan`, ex. mini-liste ou
barres), et la tendance 12 mois (`tendance_12_mois`) en graphique simple
(réutilise le style des barres déjà utilisé pour "Volume de Réservations"
plus bas dans le même fichier — même pattern visuel, pas de nouvelle
librairie de charts à ajouter).

### 3. Bloc LTV + Funnel d'activation

```jsx
const [ltvFunnel, setLtvFunnel] = useState(null);
useEffect(() => {
  callRpc('admin_get_ltv_funnel').then(setLtvFunnel).catch(console.error);
}, []);
```
Affiche `ltv_moyen` (carte FCFA), et le funnel (`funnel.total_gerants` →
`avec_terrain` → `avec_terrain_approuve` → `avec_reservation` →
`avec_plan_payant`) sous forme d'entonnoir visuel (barres décroissantes
avec le nombre et le % par rapport au total, ex. `Math.round(avec_terrain / total_gerants * 100)`).

### 4. Bloc Taux de churn

```jsx
const [churn, setChurn] = useState(null);
useEffect(() => {
  callRpc('admin_get_churn_rate').then(setChurn).catch(console.error);
}, []);
```
Affiche `taux_churn_pct` en carte (avec code couleur : vert si bas,
orange/rouge si élevé — seuils à ton appréciation, ex. <5% vert, 5-15%
orange, >15% rouge), avec le détail `abonnes_payants_actuels`/`perdus_30j`
en sous-texte.

### 5. Bloc Trafic/Conversion (signal maison, complémentaire à Amplitude)

```jsx
const [signupsTrend, setSignupsTrend] = useState(null);
useEffect(() => {
  callRpc('admin_get_signups_trend', { p_jours: 30 }).then(setSignupsTrend).catch(console.error);
}, []);
```
Affiche un graphique (ligne ou barres empilées joueurs/gérants) sur les
30 derniers jours — nouveaux inscrits par jour. Ajoute une petite mention
"Voir le trafic détaillé (sources, funnel de conversion) sur Amplitude"
avec un lien externe si pertinent (pas obligatoire).

## Vérification

- Connecté en admin, le Dashboard doit charger les 4 nouveaux blocs sans
  erreur, avec des valeurs cohérentes (compare le MRR affiché à un calcul
  manuel rapide sur 2-3 abonnements actifs connus).
- Vérifie que la page reste utilisable si une des 4 RPC échoue
  individuellement (chaque bloc a son propre `useEffect`/état, donc un
  échec isolé ne doit pas casser les autres — confirme que c'est bien le
  cas avec la structure ci-dessus).
- Confirme qu'Amplitude envoie bien des événements après réactivation
  (onglet Network du navigateur, requêtes vers `api2.amplitude.com` ou
  équivalent).

## Interdictions

- N'ajoute pas de champ CAC ni de saisie de budget marketing — hors
  scope, explicitement écarté par l'utilisateur pour cette itération.
- N'ajoute pas de flux d'auto-annulation avec motif — idem, écarté.
- N'installe pas de nouvelle librairie de graphiques — réutilise le style
  barres déjà présent dans `AdminDashboard.jsx`.
- **Ces 4 blocs sont strictement réservés au super admin** (confirmé
  explicitement par l'utilisateur). Ajoute-les uniquement dans
  `AdminDashboard.jsx`, jamais dans un composant partagé avec un autre
  rôle (attention au même type d'erreur que celle déjà corrigée sur
  `Parametres.jsx`, qui était accidentellement rendu à la fois pour
  l'admin et le gérant). Vérifie qu'aucune route `gerant-*` dans
  `App.jsx` ne pointe vers `AdminDashboard.jsx` ou un composant qui
  l'inclurait, avant de considérer la tâche terminée.
