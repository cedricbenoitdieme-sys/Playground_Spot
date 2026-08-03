# Prompt — Système de rang fidélité réel et configurable (intégration frontend)

## Contexte

Migration déjà écrite : `supabase/migrations/20260802220000_loyalty_tiers.sql`
(pas encore appliquée à la base distante). Elle ajoute :

1. **`public.loyalty_tiers`** — table de config (lecture publique, écriture
   admin) avec les 5 paliers proposés :
   `debutant`(0) / `regulier`(5) / `confirme`(15) / `vip_argent`(30) / `vip_or`(50).
   Le nombre = seuil minimum de matchs joués pour atteindre ce palier.
2. **`public.get_loyalty_rang(p_matchs_joues INTEGER)`** — fonction pure,
   renvoie le palier actuel + le suivant + le nombre de matchs restants.
3. **`public.get_joueur_profile_stats()`** (déjà utilisée pour les autres
   stats du profil, cf. `PROMPT_FIX_JOUEUR_PROFILE_MOCK_STATS.md`) inclut
   maintenant un champ `rang` calculé automatiquement — rien à appeler en
   plus si vous branchez déjà cette RPC.

**Important — pas de backfill à faire.** Le rang n'est stocké nulle part en
base (calcul pur à chaque appel) : dès que le frontend appelle
`get_joueur_profile_stats()` (ou `get_loyalty_rang()`), tous les comptes —
anciens et nouveaux — obtiennent leur vrai rang immédiatement. Pas de
script de migration de données à écrire.

## Forme du champ `rang`

```jsonc
// get_joueur_profile_stats() → data.rang
{
  "code": "regulier",
  "label": "Régulier",
  "emoji": "⚽",
  "seuil_matchs": 5,
  "matchs_joues": 7,
  "prochain_palier": {
    "code": "confirme",
    "label": "Confirmé",
    "emoji": "🔥",
    "seuil_matchs": 15,
    "matchs_restants": 8
  }
}
// prochain_palier est `null` quand le joueur est déjà au dernier palier (vip_or)
```

## Tâche 1 — `JoueurProfile.jsx`

Remplacer le badge "VIP Or 🥇" en dur (ligne 62) par le rang réel, et
ajouter une barre/texte de progression vers le palier suivant :

```jsx
<div className="bg-secondary/15 border border-secondary/25 text-secondary px-4 py-2 rounded-2xl flex items-center gap-2">
  <IconTrophy size={16} />
  <div>
    <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">Rang Fidélité</p>
    <p className="text-xs font-black">{stats.rang?.label} {stats.rang?.emoji}</p>
  </div>
</div>

{stats.rang?.prochain_palier && (
  <p className="text-[11px] text-gray-400 mt-1">
    {stats.rang.prochain_palier.matchs_restants} match(s) avant {stats.rang.prochain_palier.label} {stats.rang.prochain_palier.emoji}
  </p>
)}
```
(`stats` = le state déjà mis en place pour brancher `get_joueur_profile_stats()`
dans le prompt précédent — le champ `rang` y est déjà inclus, pas d'appel
réseau supplémentaire.)

Une vraie barre de progression est un plus sympa mais pas obligatoire :
`progress = 1 - (matchs_restants / (prochain_palier.seuil_matchs - rang.seuil_matchs))`.

## Tâche 2 — Dédupliquer avec `Utilisateurs.jsx` (recommandé)

`src/pages/Utilisateurs.jsx` (lignes 18-23) a son **propre** système de
paliers ad hoc (`niveau()`), avec des seuils et des noms différents
(VIP≥15/Régulier≥8/Actif≥3/Nouveau) — maintenant divergent du vrai système.
Pour éviter que l'admin et le joueur voient deux rangs différents pour la
même personne, remplacez `niveau()` par le même calcul :

Comme cette page liste plusieurs joueurs d'un coup, éviter un appel RPC par
ligne : chargez `loyalty_tiers` **une fois** (lecture publique, RLS déjà en
place) et calculez le palier client-side pour chaque `u.reservations` :

```js
const { data: tiers } = await supabase
  .from('loyalty_tiers')
  .select('code, label, emoji, seuil_matchs')
  .order('seuil_matchs', { ascending: true });

const getRang = (matchsJoues) => {
  const applicable = tiers.filter(t => t.seuil_matchs <= (matchsJoues || 0));
  return applicable[applicable.length - 1] || tiers[0];
};
```

Remplacez les usages de `niveau(u.reservations)` par `getRang(u.reservations)`
(adapter les classes CSS de couleur par palier si besoin — `niveau()` avait
des couleurs par label, à recréer pour les 5 nouveaux codes).

## Contraintes

- Ne pas coder les seuils (0/5/15/30/50) en dur côté frontend nulle part —
  toujours lire `loyalty_tiers` ou passer par `get_loyalty_rang`/
  `get_joueur_profile_stats`. C'est tout l'intérêt de la table de config
  (un admin peut ajuster les seuils par un simple `UPDATE
  loyalty_tiers SET seuil_matchs = ... WHERE code = ...`, sans déploiement).
- `get_joueur_profile_stats()` reste scopée à l'utilisateur connecté
  (`auth.uid()`) — ne fonctionne que pour "mon propre" rang. Pour la liste
  admin (Tâche 2), c'est `loyalty_tiers` + calcul client qu'il faut utiliser,
  pas cette RPC en boucle.
