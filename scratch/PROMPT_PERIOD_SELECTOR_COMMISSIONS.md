# PROMPT — Sélecteur de période sur "Abonnements & Commissions"

## Contexte

Sur `AdminSubscriptions.jsx` (page "Abonnements & Commissions"), le bloc
résumé des commissions affiche une période fixe non modifiable ("Ce mois"
par défaut, ligne 120), sans aucun moyen de changer la fenêtre — alors que
partout ailleurs dans l'app (dashboard admin, stats gérant), le
`PeriodSelector` unifié (24h/72h/7j/14j/31j/45j/3 mois/6 mois/1 an/depuis
toujours/personnalisé) est déjà disponible.

**Déjà fait côté backend** (migration
`supabase/migrations/20260804140000_commission_summary_preset.sql`,
appliquée) : la RPC `admin_get_commission_summary` accepte maintenant
`p_preset` (délégué à `resolve_period_range()`, même système que le reste
de l'app) en plus de `p_date_debut`/`p_date_fin` pour le mode personnalisé.
Appelée sans aucun argument, elle garde son comportement historique
("ce mois-ci") — donc rien ne casse tant que le frontend n'est pas mis à
jour, mais il faut maintenant brancher le sélecteur pour que l'utilisateur
puisse réellement changer la période.

## Ta tâche

Dans `src/pages/admin/AdminSubscriptions.jsx` :

1. Importe `PeriodSelector` depuis `../../components/PeriodSelector`.
2. Ajoute un état de période, ex. `const [periode, setPeriode] = useState({ mode: 'preset', preset: '31d' })` (à côté des états existants lignes 26-34).
3. Affiche `<PeriodSelector value={periode} onChange={setPeriode} />` dans le header du bloc résumé (ligne ~115-135), au-dessus ou à côté du badge "Période : ...".
4. Modifie `fetchCommissions` (lignes 59-69) pour passer la période sélectionnée à la RPC :
```jsx
const fetchCommissions = async () => {
  setSummaryLoading(true);
  try {
    const pPreset = periode.mode === 'preset' ? periode.preset : null;
    const pDateDebut = periode.mode === 'custom' ? periode.startDate : null;
    const pDateFin = periode.mode === 'custom' ? periode.endDate : null;
    const data = await callRpc('admin_get_commission_summary', {
      p_preset: pPreset,
      p_date_debut: pDateDebut,
      p_date_fin: pDateFin,
    });
    setCommissionSummary(data);
  } catch (err) {
    console.error('Erreur admin_get_commission_summary:', err);
  } finally {
    setSummaryLoading(false);
  }
};
```
5. Ajoute `periode` aux dépendances du `useEffect` ligne 71-74 (`[statut, search, page, periode]`) pour que le résumé se rafraîchisse au changement de période — attention à ne PAS relancer `fetchSubscriptions()` (liste des abonnements, non filtrée par période) dans ce même effet pour rien : sépare en deux `useEffect` si besoin, un pour `fetchCommissions()` dépendant de `periode`, un pour `fetchSubscriptions()` dépendant de `[statut, search, page]` comme avant.
6. Le badge "Période : {commissionSummary?.periode_debut} au {commissionSummary?.periode_fin}" (ligne 120) continue de fonctionner tel quel puisque la RPC renvoie toujours ces deux champs, quelle que soit la méthode de résolution.

## Vérification

- Changer de préréglage dans le nouveau sélecteur recharge bien le bloc
  résumé (Commissions Totales, Volume total réservé, Nombre de
  réservations, Taux moyen effectif) avec les bonnes bornes de dates.
- Le mode "Sur-mesure" (dates personnalisées) fonctionne aussi.
- La liste des abonnements en dessous (tableau gérants/plans) n'est PAS
  affectée par ce changement de période — elle garde son propre filtre
  statut/recherche/pagination indépendant.

## Interdictions

- Ne touche pas à `admin_list_subscriptions` ni à la table des abonnements
  — seul le bloc résumé commissions est concerné par cette tâche.
