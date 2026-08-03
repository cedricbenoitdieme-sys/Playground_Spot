# Playground Spot — Installation UnitechPay (100 % dashboard)

Domaine : `https://playground-spot.vercel.app`

## 1. Base de données

SQL Editor → coller `0001_schema_playground_spot.sql` → Run.

⚠️ **Avant de lancer**, deux endroits à adapter dans le fichier :
- la FK `terrain_id … REFERENCES terrains(id)` → le nom réel de ta table de terrains
- si ta colonne propriétaire ne s'appelle pas `owner_id`, note-le pour l'étape 4

## 2. Secrets

Edge Functions → Secrets → Add new secret.

| Key | Value |
|---|---|
| `UNITECH_API_KEY` | ta clé de `pay.unitech.sn` → Paramètres → API |
| `APP_URL` | `https://playground-spot.vercel.app` |

**Une seule clé.** UnitechPay est un agrégateur : elle sert pour Wave, pour Orange Money, et pour vérifier la signature des webhooks.

## 3. Edge Functions

Edge Functions → Deploy a new function → Via editor.

| Nom exact | Fichier | Verify JWT |
|---|---|---|
| `create-payment` | `create-payment.index.ts` | **ON** |
| `webhook-unitech` | `webhook-unitech.index.ts` | **OFF** ⚠️ |

> **Le piège n°1** : « Verify JWT with legacy secret » se réactive tout seul à chaque fois que tu réédites une fonction. Après chaque modification de `webhook-unitech`, revérifie qu'il est sur OFF. Sinon la gateway renvoie 401, ton code ne s'exécute jamais, et les paiements restent bloqués en `pending` alors que les clients ont bien payé.

## 4. À adapter dans `create-payment.index.ts`

Deux blocs signalés par `👉` :

- **Le contrôle de propriété du terrain** (`.from("terrains").eq("owner_id", user.id)`) → tes vrais noms. Sans ça, n'importe qui peut sponsoriser le terrain d'un concurrent.
- **Le gating du module Budget Visibilité** : ta grille ne le liste pas dans l'offre Free, donc les comptes Free sont bloqués. Si c'est un oubli et que Free y a droit, supprime le bloc « Gating par plan ».

## 5. Webhook côté UnitechPay

URL de callback :
```
https://<project-ref>.supabase.co/functions/v1/webhook-unitech
```
Le `project-ref` est dans Project Settings → General.

## 6. CSP Vercel

Dans `vercel.json` :
```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.unitech.sn"
    }]
  }]
}
```

---

## Côté front

### Abonnement

```js
const { data } = await supabase.functions.invoke('create-payment', {
  body: {
    kind: 'subscription',
    plan: 'pro',                 // starter | pro | entreprise
    payment_method: 'wave',      // wave | orange_money
    customer_number: '771234567',
  },
});

const url = data.deep_links?.MAXIT || data.deep_links?.OM || data.payment_url;
if (url) window.location.href = url;
```

### Campagne de visibilité

```js
const { data } = await supabase.functions.invoke('create-payment', {
  body: {
    kind: 'campaign',
    terrain_id: selectedTerrainId,
    budget: 5000,                // 2000–50000, paliers de 500
    duration_days: 7,            // 3 | 7 | 14 | 30
    payment_method: 'wave',
    customer_number: '771234567',
  },
});
```

### Attendre la confirmation

```js
const { data } = await supabase.rpc('get_payment_status', { p_payment_id: paymentId });
if (data.status === 'completed') { /* débloquer */ }
```

**Ne débloque jamais sur la redirection « succès »** — l'utilisateur peut fermer la page trop tôt, ou forger l'URL `?p=...`. Le webhook est la seule source de vérité.

### Free et essai

```js
await supabase.rpc('activate_free_plan');
await supabase.rpc('start_trial', { p_plan: 'pro' });   // 30 jours, 1× par compte
```

### Commission sur les réservations

```js
const { data } = await supabase.rpc('get_my_plan');
// { plan: 'pro', platform_fee_pct: 2.00, expires_at, is_trial }
```

Taux figé à la souscription : changer ta grille ne modifie pas rétroactivement le taux d'un client déjà abonné.

### Classement des recherches

Un terrain est mis en avant si :
```sql
EXISTS (SELECT 1 FROM campaigns c
        WHERE c.terrain_id = t.id AND c.status = 'active' AND c.ends_at > NOW())
```
Le `ends_at > NOW()` en plus du statut est une ceinture de sécurité : si le cron ne tourne pas, une campagne finie ne reste pas affichée indéfiniment.

---

## Grille implémentée

| Plan | Prix/mois | Commission | Budget Visibilité |
|---|---|---|---|
| Free | 0 | 12 % | ❌ bloqué |
| Starter | 4 900 | 8 % | ✅ |
| Pro | 9 900 | 2 % | ✅ |
| Entreprise | 24 900 | 0 % | ✅ |

Prix et taux apparaissent à **trois endroits** : `PLANS` dans `create-payment`, le SQL (`start_trial` + fallback de `get_my_plan`), et ta page tarifs. Change-les partout ensemble — c'est exactement le bug déjà corrigé sur BoutikOS (prix désynchronisés entre deux pages).

---

## Restant à traiter

**Rétractation 7 jours** — annoncée sur ta page, pas implémentée. Il faut une RPC qui vérifie `confirmed_at > now() - 7 days`, passe l'abonnement en `cancelled`, et déclenche le remboursement (vérifie si UnitechPay expose une action `refund`, sinon c'est manuel depuis leur dashboard).

**Quotas par plan** — 1 / 3 / illimité terrains, 20 réservations/mois sur Free. À appliquer en RLS ou en RPC, jamais dans le front : une limite front est une suggestion, pas une barrière.

**Cohérence de ta grille** — l'offre Free liste « Tableau de bord statistique avancé » et « Multi-sites & accès API dédié », qui sonnent comme des fonctions premium. Si c'est un copier-coller de la liste Pro, ça vaut le coup de corriger la page avant que des clients s'en réclament.

**Estimation des vues** — `estimateViews()` utilise `budget / 10` pour coller à ton affichage actuel (5 000 → +500). Ce n'est pas un modèle, juste une formule provisoire. À remplacer dès que tu auras des données d'exposition réelles, sinon tu promets des chiffres que tu ne peux pas tenir.

---

## Debug

| Symptôme | Cause probable |
|---|---|
| 502 + `unitech_initiation_failed` | Clé API mauvaise ou secret mal nommé |
| 404 sur l'appel Unitech | Passer `UNITECH_API` sur `https://api.unitech.sn/api.php` |
| Payé mais reste `pending` | Verify JWT rallumé, ou URL callback pas configurée chez Unitech |
| Erreur CORS | Domaine absent de `ALLOWED_ORIGINS` |
| 403 sur une campagne | Compte Free, ou `owner_id` mal nommé dans le contrôle de propriété |
| Campagne active pour toujours | `pg_cron` pas activé → ajoute `ends_at > NOW()` dans ta requête de recherche |

Logs : Edge Functions → *la fonction* → onglet Logs.
