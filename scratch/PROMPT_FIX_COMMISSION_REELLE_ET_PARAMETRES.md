# PROMPT — Commission plateforme réelle (par plan) + dérogation temporaire + fix Mode maintenance

## Contexte

Deux réglages de la section "Plateforme" (`Parametres.jsx`) sont cassés
pour la même raison : ils passent par un ancien backend Express
(`backend/server.js`, routes `/api/settings`) **injoignable en
production** — déjà repéré ce jour ("Cannot GET /api/settings" dans le
Network tab). `handleUpdateSetting` (ligne ~209) et le chargement initial
(`fetchSettings`, ligne ~181-205) utilisent tous les deux ce endpoint mort.

Autre point : "Commission plateforme" affichait un taux **unique global
éditable** (`system_settings.commission_plateforme`), alors qu'un vrai
système de commission **par plan** existe déjà et est correctement
configuré (`plan_limits.commission_rate` — 12%/8%/2%/0% selon
Free/Starter/Pro/Entreprise, déjà visible sur la page tarifs publique). Ce
système n'était juste jamais appliqué aux vrais paiements (bug backend,
déjà corrigé côté migration — voir plus bas).

**Déjà fait côté backend**, migration
`supabase/migrations/20260803220000_commission_reelle_et_derogation.sql` :
- `calculate_commission(reservation_id)` (qui existait déjà mais n'était
  jamais appelée) est maintenant réellement branchée dans
  `handle_unitech_webhook`, à chaque confirmation de paiement de
  réservation — la commission réelle (taux du plan du gérant, verrouillé
  définitivement à ce moment-là) est désormais calculée pour de vrai.
- Nouveau mécanisme de **dérogation temporaire globale** : deux RPC,
  `set_commission_override(p_rate NUMERIC, p_duree_heures NUMERIC)` et
  `clear_commission_override()` (admin uniquement), qui posent/retirent
  une clé `commission_override` dans `system_settings`
  (`{rate, expires_at, set_by, set_at}`). Tant qu'elle est active (avant
  `expires_at`), `calculate_commission()` utilise ce taux pour TOUS les
  gérants au lieu du taux de leur plan — puis retombe automatiquement sur
  le taux du plan une fois `expires_at` dépassé (pas de job de "retour à
  la normale" à gérer, c'est juste une comparaison de date à chaque
  calcul).

## Ta tâche

### 1. Corriger le chargement/écriture de "Mode maintenance"

Remplace le `fetch('/api/settings')` (GET, ligne ~185) par un accès
Supabase direct — RLS déjà en place, lecture publique, écriture réservée
aux admins (`create_system_settings.sql`, déjà en prod) :
```jsx
const { data } = await supabase
  .from('system_settings')
  .select('key, value')
  .in('key', ['mode_maintenance']);
const maint = data?.find(d => d.key === 'mode_maintenance')?.value ?? false;
setPlateforme(prev => ({ ...prev, modeMainten: maint }));
```

Remplace `handleUpdateSetting('mode_maintenance', v)` (le `fetch POST`
vers l'endpoint mort) par une écriture directe :
```jsx
const handleToggleMaintenance = async (v) => {
  showToast(v ? '⚠️ Mode maintenance activé' : '✓ Plateforme en ligne');
  setPlateforme(prev => ({ ...prev, modeMainten: v }));
  const { error } = await supabase
    .from('system_settings')
    .update({ value: v, updated_at: new Date().toISOString() })
    .eq('key', 'mode_maintenance');
  if (error) {
    showToast(`❌ ${error.message}`);
    setPlateforme(prev => ({ ...prev, modeMainten: !v })); // rollback
  }
};
```
Branche ça sur le `Toggle` "Mode maintenance" (ligne ~408) à la place de
l'ancien `onChange`.

Tu peux supprimer complètement `handleUpdateSetting` s'il ne sert plus à
rien d'autre après ce changement (vérifie qu'aucun autre appelant ne
l'utilise avant de le retirer).

### 2. Remplacer "Commission plateforme" par l'affichage réel + la dérogation

Supprime le `Row` "Commission plateforme" éditable (ligne 398) et le
champ correspondant dans le sheet `editPlat` (autour de la ligne 529) —
ce n'était de toute façon jamais vraiment appliqué (voir contexte).

Remplace par deux blocs dans la section "Plateforme" :

**a) Affichage des taux réels par plan (lecture seule)** — charge au
montage :
```jsx
const [planRates, setPlanRates] = useState([]);
useEffect(() => {
  supabase.from('plan_limits').select('plan_id, nom, commission_rate')
    .order('prix_mensuel')
    .then(({ data }) => setPlanRates(data || []));
}, []);
```
Affiche une ligne par plan (ex: sous forme de petit tableau ou de liste
`Row` répétée) : `Free — 12%`, `Starter — 8%`, `Pro — 2%`, `Entreprise — 0%`
(valeurs réelles issues de la requête, pas codées en dur).

**b) Dérogation temporaire globale** — charge l'état actuel au montage :
```jsx
const [override, setOverride] = useState(null);
useEffect(() => {
  supabase.from('system_settings').select('value').eq('key', 'commission_override').maybeSingle()
    .then(({ data }) => {
      const v = data?.value;
      if (v && new Date(v.expires_at) > new Date()) setOverride(v);
      else setOverride(null);
    });
}, []);
```
Si `override` actif : affiche clairement "Dérogation active : 0% jusqu'au
<date/heure formatée>" avec un bouton "Désactiver maintenant" qui appelle
`await supabase.rpc('clear_commission_override')` puis `setOverride(null)`.

Si pas d'override actif : un petit formulaire (taux % + durée, en heures
ou jours au choix côté UX) avec un bouton "Activer" qui appelle :
```jsx
const { data, error } = await supabase.rpc('set_commission_override', {
  p_rate: tauxSaisi,
  p_duree_heures: dureeSaisieEnHeures,
});
if (!error) setOverride(data);
```
Affiche clairement un avertissement que ça s'applique à **tous les
gérants**, sur **toute nouvelle réservation confirmée** pendant la
période (pas rétroactif sur les paiements déjà confirmés).

## Vérification

- Recharge la page : "Mode maintenance" doit refléter le vrai état en
  base et le toggle doit persister après rechargement.
- Les taux par plan affichés doivent correspondre exactement à ceux de la
  page tarifs publique (`GerantTarifs.jsx`).
- Active une dérogation courte (ex: 0% pendant 1h) en tant qu'admin,
  confirme qu'elle s'affiche bien avec la bonne date d'expiration, teste
  "Désactiver maintenant".
- Si possible, confirme via une réservation de test payée que
  `paiements.commission_rate_applique`/`commission_montant` ne sont plus
  NULL après confirmation (visible en SQL, pas forcément dans l'UI).

### 3. Mettre à jour l'affichage du résumé de commissions (AdminSubscriptions.jsx)

Point traité en plus, même sujet : `admin_get_commission_summary` (migration
`20260803230000_admin_commission_summary_reelle.sql`) ne réapplique plus
un taux fixe global au volume total — il somme désormais les vraies
commissions verrouillées par paiement (`paiements.commission_montant`,
maintenant réellement calculées). Le JSON retourné change de forme :
`taux_commission` devient `taux_moyen_effectif` (moyenne réelle observée,
pas un taux configuré), et un nouveau champ `nb_paiements_sans_commission`
indique combien de paiements confirmés dans la période n'ont pas de
commission calculée (paiements antérieurs à ce correctif).

Dans `src/pages/admin/AdminSubscriptions.jsx` ligne ~126 :
```jsx
<p className="text-xs text-white/60">
  Calculé sur le taux fixe de {commissionSummary?.taux_commission ?? 10}% appliqué au volume global.
</p>
```
→ remplacer par :
```jsx
<p className="text-xs text-white/60">
  Taux moyen effectif : {commissionSummary?.taux_moyen_effectif ?? 0}% (calculé par plan de chaque gérant, pas un taux fixe).
  {commissionSummary?.nb_paiements_sans_commission > 0 && (
    <> {commissionSummary.nb_paiements_sans_commission} paiement(s) de cette période n'ont pas de commission calculée (antérieurs au correctif).</>
  )}
</p>
```

## Interdictions

- Ne redonne pas à l'admin la possibilité d'éditer directement un taux
  global permanent (`commission_plateforme`) — c'est l'ancien concept
  remplacé par le système par plan + dérogation temporaire.
- Ne touche pas à `backend/server.js` — hors scope, ce backend Express
  n'est de toute façon plus dans le chemin utilisé par le frontend après
  ce correctif.
