# Prompt — Stats landing "jamais à la baisse" + interrupteur admin + repositionnement du simulateur

## Contexte

Le ruban de stats du hero (`src/pages/Landing.jsx:463-491`, "Joueurs
Dakarois" / "Terrains Homologués" / "Taux de Satisfaction") lit déjà
`stats_plateforme_cache` en base (migration `20260725120000_stats_plateforme.sql`),
mais deux problèmes produit à régler :

1. Le chiffre pouvait redescendre d'un rafraîchissement mensuel à l'autre
   (compte désactivé, terrain suspendu, moyenne d'avis qui baisse) — pas
   crédible pour un ruban marketing.
2. Impossible de masquer le ruban depuis l'admin si besoin (ex. lancement,
   trop peu de données pour être convaincant), et quand il est masqué le
   simulateur de réservation en dessous (lignes ~493 et suivantes,
   "Simulateur Dakar") laisse un grand vide au lieu de remonter.

**Déjà fait côté backend** (migration `20260804160000_landing_stats_watermark_toggle.sql`,
appliquée en production) :

- `stats_plateforme_cache` a maintenant 3 colonnes `_live` en plus des
  colonnes publiques historiques : `nombre_joueurs_live`,
  `nombre_terrains_live`, `taux_satisfaction_live`. Les colonnes publiques
  (`nombre_joueurs`, `nombre_terrains`, `taux_satisfaction`) sont désormais
  un **high-water mark** : `refresh_stats_plateforme()` les met à jour avec
  `GREATEST(ancienne_valeur, nouvelle_valeur)`, elles ne redescendent donc
  plus jamais. Les colonnes `_live` gardent le calcul réel du moment, pour
  transparence admin.
- `nombre_joueurs` compte maintenant **tous** les comptes `role='joueur'**
  dès leur création, actif ou non (le filtre `statut='actif'` a été retiré).
  `nombre_terrains` compte tous les terrains avec `status='approved'` (workflow
  d'homologation, colonne indépendante — inchangé), en ignorant leur `statut`
  opérationnel actif/inactif/en_maintenance (filtre retiré aussi). Donc un
  compte suspendu ou un terrain temporairement désactivé reste comptabilisé.
- Nouveau réglage `system_settings` : `key = 'landing_stats_ribbon_visible'`,
  `value` booléen JSON (`true` par défaut → comportement actuel inchangé).
- Nouvelle RPC `admin_refresh_stats_plateforme()` (réservée `super_admin`) :
  force un recalcul immédiat et renvoie la ligne à jour de
  `stats_plateforme_cache` — au lieu d'attendre le cron mensuel.

## Tâche 1 — `src/pages/Landing.jsx` : respecter le toggle + repositionner le simulateur

Le `useEffect` existant (lignes ~149-167) qui charge `platformStats` doit
aussi charger la visibilité du ruban :

```js
const [ribbonVisible, setRibbonVisible] = useState(true); // valeur par défaut avant chargement = comportement actuel

useEffect(() => {
  const fetchRibbonVisibility = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'landing_stats_ribbon_visible')
      .maybeSingle();
    if (data?.value !== undefined) {
      setRibbonVisible(!!data.value);
    }
  };
  fetchRibbonVisibility();
}, []);
```

(Peut être fusionné dans le `useEffect` `fetchPlatformStats` existant en un
seul aller-retour si tu préfères, pas obligatoire.)

Puis :

- Rendre le bloc ruban (lignes ~463-491, `{/* Real-time Dynamic Stats
  Ribbon */}`) conditionnel : `{ribbonVisible && ( ... )}`.
- Le bloc simulateur juste en dessous (ligne ~494,
  `<div className="relative w-full max-w-sm mx-auto mt-8 animate-slide-up-extra-slow">`)
  doit remonter quand le ruban est caché : remplacer la classe fixe `mt-8`
  par une classe conditionnelle, par ex. :

  ```jsx
  <div className={`relative w-full max-w-sm mx-auto ${ribbonVisible ? 'mt-8' : 'mt-2'} animate-slide-up-extra-slow`}>
  ```

  Ajuste la valeur `mt-2` au feeling visuel (l'objectif : le simulateur suit
  directement les boutons CTA — ligne ~446-460 — sans le grand vide
  laissé par le ruban absent, mais sans les coller non plus).

## Tâche 2 — `src/pages/Parametres.jsx` : interrupteur + données live

Suivre exactement le pattern déjà utilisé pour "Mode maintenance"
(`plateforme.modeMainten`, lignes 162-206 et 436-438) :

- État : ajouter `statsRibbonVisible: true` dans le `useState(plateforme)`
  (ligne ~162), et un état séparé pour les valeurs live, ex.
  `const [statsLive, setStatsLive] = useState(null);`.
- Chargement au montage (à côté du `fetchMaintenance` existant, lignes
  178-192) : lire `system_settings.landing_stats_ribbon_visible` +
  `stats_plateforme_cache.*` (colonnes publiques et `_live`), réservé aux
  rôles `admin`/`super_admin` comme le reste de la section.
- Handler `handleToggleStatsRibbon(v)` : même structure que
  `handleToggleMaintenance` — update optimiste, `UPDATE system_settings SET
  value = v WHERE key = 'landing_stats_ribbon_visible'`, rollback + toast
  d'erreur si ça échoue.
- UI : dans la `Section title="Plateforme"` (ligne ~434), ajouter un
  `<Row>` juste après celui du mode maintenance :

  ```jsx
  <Row label="Ruban de stats (landing page)" sub={plateforme.statsRibbonVisible ? 'Visible sur la page d\'accueil publique' : 'Masqué — le simulateur remonte à sa place'}>
    <Toggle value={plateforme.statsRibbonVisible} onChange={handleToggleStatsRibbon} />
  </Row>
  ```

- Juste en dessous de ce `Row`, afficher les données affichées publiquement
  **et** les données live réelles côte à côte, pour que l'admin comprenne
  l'écart éventuel (ex. si un compte a été supprimé, le chiffre public reste
  plus haut que le live) :

  ```jsx
  {statsLive && (
    <div className="text-xs text-gray-500 mt-2 space-y-1">
      <p>Joueurs affichés : <b>{statsLive.nombre_joueurs}</b> (réel actuel : {statsLive.nombre_joueurs_live})</p>
      <p>Terrains affichés : <b>{statsLive.nombre_terrains}</b> (réel actuel : {statsLive.nombre_terrains_live})</p>
      <p>Satisfaction affichée : <b>{statsLive.taux_satisfaction ?? '—'}</b> (réel actuel : {statsLive.taux_satisfaction_live ?? '—'})</p>
    </div>
  )}
  ```

  Un chiffre affiché plus haut que le "réel actuel" est normal (c'est le
  high-water mark qui fait son travail) — pas la peine d'ajouter un warning
  alarmant, juste de l'information.

- Optionnel mais utile : un bouton "Recalculer maintenant" qui appelle
  `supabase.rpc('admin_refresh_stats_plateforme')` et remplace `statsLive`
  par le résultat, pour ne pas attendre le cron mensuel après un changement
  de statut de compte/terrain important.

## Vérification

- Toggle à `false` dans Paramètres → le ruban disparaît de la landing (page
  publique, non connecté) et le simulateur remonte visuellement à la place
  laissée libre ; toggle à `true` → comportement identique à aujourd'hui.
- Créer un compte joueur de test (même sans jamais le rendre actif) →
  `nombre_joueurs`/`nombre_joueurs_live` augmentent après
  `admin_refresh_stats_plateforme()` (ou le prochain cron mensuel).
- `npm run build` sans erreur.

## Ne pas toucher

- La logique de calcul de `taux_satisfaction` (seuil de 20 avis, `NULL` si
  en dessous) — inchangée par ce prompt, déjà gérée côté `Landing.jsx`
  (`platformStats?.taux_satisfaction != null`, ligne ~480).
- Le cron mensuel `refresh-stats-plateforme-monthly` — reste la source de
  rafraîchissement par défaut, `admin_refresh_stats_plateforme()` est un
  complément à la demande, pas un remplacement.
