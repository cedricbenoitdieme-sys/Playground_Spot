# PROMPT — Brancher la saisie du compte de versement gérant (Wave/Orange Money)

## Contexte

Reconstruction du versement automatique gérant pour UnitechPay (migration
`supabase/migrations/20260804170000_rebuild_gerant_payout_unitechpay.sql`,
déjà appliquée) : dès qu'un paiement de réservation est confirmé, la
plateforme calcule la commission puis déclenche un virement automatique
vers le compte Wave/Orange Money du gérant (montant réservation moins
commission). Ce mécanisme a une dépendance stricte : `admin_review_terrain`
**refuse d'approuver un terrain** tant que son gérant n'a pas renseigné
`gerant_payout_info` (téléphone + opérateur) via la RPC
`upsert_gerant_payout_info(p_phone, p_operator, p_country)`.

**Problème découvert** : `TerrainFormModal.jsx` a déjà les champs UI pour
ça (state `payoutPhone`/`payoutOperator` lignes 95-97, validation ligne
441-444, inputs lignes 961-983) — mais `handleSubmitForm` (lignes 429-476)
ne les inclut JAMAIS dans le `payload` envoyé à `onSubmit` (lignes 451-465).
Ces champs sont donc actuellement inertes : saisis et validés côté UI,
puis silencieusement perdus. Résultat concret : `gerant_payout_info` reste
vide pour tout le monde, donc **aucun terrain ne peut plus être approuvé**
avec la nouvelle migration tant que ce n'est pas corrigé.

## Ta tâche

### 1. Brancher l'existant dans `TerrainFormModal.jsx`

Dans `handleSubmitForm` (lignes 429-476), juste avant `await onSubmit(payload)`
(ligne 469), ajoute l'appel RPC qui enregistre le compte de versement (à
faire à chaque soumission, création ET modification — `upsert_gerant_payout_info`
est idempotente) :

```jsx
import { supabase } from '../lib/supabase'; // si pas déjà importé dans ce fichier

// ... dans handleSubmitForm, juste avant `await onSubmit(payload)` :
const { error: payoutInfoError } = await supabase.rpc('upsert_gerant_payout_info', {
  p_phone: formData.payoutPhone.replace(/\s+/g, ''),
  p_operator: formData.payoutOperator,
});
if (payoutInfoError) {
  setFormError(payoutInfoError.message || "Impossible d'enregistrer vos informations de versement.");
  setSubmitting(false);
  return;
}
```

Ne retire pas la validation existante ligne 441-444 (numéro obligatoire) —
elle reste pertinente puisque ces champs alimentent maintenant réellement
le versement.

### 2. Section dédiée dans les Paramètres gérant (`src/pages/Parametres.jsx`)

Pour que le gérant puisse **mettre à jour** son compte de versement sans
repasser par le formulaire terrain (numéro perdu, changement d'opérateur),
ajoute une nouvelle `<Section>` réservée au rôle gérant, sur le modèle de
la section "Plateforme" déjà gated par rôle (ligne 434,
`{['admin', 'super_admin'].includes(currentUser?.role) && (...)}`) — à
placer par exemple juste après la section "Notifications" (ligne 431) :

```jsx
{currentUser?.role === 'gerant' && (
  <Section title="Compte de versement" icon={IconCash} delay={0.18}>
    <div className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        Vos revenus de réservations (montant moins la commission de votre
        plan) sont versés automatiquement sur ce compte après chaque
        paiement confirmé.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Opérateur</label>
          <select
            value={payoutInfo.operator}
            onChange={(e) => setPayoutInfo(prev => ({ ...prev, operator: e.target.value }))}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm"
          >
            <option value="wave">Wave Mobile Money</option>
            <option value="orange_money">Orange Money Sénégal</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Numéro de téléphone</label>
          <input
            type="tel"
            value={payoutInfo.phone}
            onChange={(e) => setPayoutInfo(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="77 123 45 67"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm"
          />
        </div>
      </div>
      <button
        onClick={handleSavePayoutInfo}
        disabled={savingPayoutInfo}
        className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
      >
        {savingPayoutInfo ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  </Section>
)}
```

Avec l'état et les handlers associés (à ajouter avec les autres `useState`
du composant) :

```jsx
const [payoutInfo, setPayoutInfo] = useState({ phone: '', operator: 'wave' });
const [savingPayoutInfo, setSavingPayoutInfo] = useState(false);

useEffect(() => {
  const fetchPayoutInfo = async () => {
    if (currentUser?.role !== 'gerant') return;
    const { data } = await supabase
      .from('gerant_payout_info')
      .select('phone, operator')
      .eq('gerant_id', currentUser.id)
      .maybeSingle();
    if (data) setPayoutInfo({ phone: data.phone, operator: data.operator });
  };
  fetchPayoutInfo();
}, [currentUser?.id]);

const handleSavePayoutInfo = async () => {
  setSavingPayoutInfo(true);
  const { error } = await supabase.rpc('upsert_gerant_payout_info', {
    p_phone: payoutInfo.phone.replace(/\s+/g, ''),
    p_operator: payoutInfo.operator,
  });
  setSavingPayoutInfo(false);
  if (error) {
    showToast(`❌ ${error.message}`);
  } else {
    showToast('✓ Compte de versement mis à jour');
  }
};
```

(`showToast` existe déjà dans ce fichier — cf. `handleToggleMaintenance`
ligne 195-206 pour le pattern exact ; adapte si la signature diffère.)
Importe `IconCash` depuis `@tabler/icons-react` si pas déjà présent dans
les imports du fichier.

### 3. Aucun changement nécessaire

- `GerantVersementsSection.jsx` (historique des versements, déjà affiché
  dans `GerantDashboard.jsx` ligne 474) — déjà compatible avec le schéma
  `gerant_payouts` recréé par la migration, fonctionnera automatiquement.
- `services/payment.js#fetchGerantPayouts` — inchangé, déjà compatible.

## Vérification

- Un gérant sans `gerant_payout_info` qui crée ou modifie un terrain voit
  son compte de versement enregistré silencieusement en arrière-plan à la
  soumission (pas de nouvelle étape UI visible, juste la correction du
  bug de payload).
- La page Paramètres gérant affiche bien la nouvelle section "Compte de
  versement", pré-remplie si déjà renseigné, modifiable et sauvegardable
  indépendamment.
- `admin_review_terrain('approved', ...)` ne lève plus d'exception pour un
  terrain dont le gérant a bien un `gerant_payout_info` (testable une fois
  qu'au moins un gérant l'a renseigné via l'un des deux chemins ci-dessus).

## Interdictions

- Ne construis pas de flux de vérification du numéro (SMS OTP, etc.) —
  hors scope, la validation reste le simple regex déjà en place.
- Ne modifie pas `GerantVersementsSection.jsx` ni `services/payment.js` —
  déjà compatibles, aucun changement requis.
