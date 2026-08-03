# PROMPT — Mettre à jour les infos de contact "Support Client"

## Demande

Dans la modale "Support Client" (Paramètres), changer les coordonnées :
- Email → `drixoftm@gmail.com` (au lieu de `support@playgroundspot.sn`)
- **Supprimer** la ligne Téléphone (le numéro ne doit pas être exposé)
- **Supprimer** la ligne Bureau/adresse (pas de locaux physiques)
- Ajouter deux précisions textuelles explicites, demandées par l'utilisateur :
  1. Cet email est réservé aux **demandes de support** et aux **propositions
     de collaboration commerciale** — tout autre message ne sera pas lu.
  2. Les expéditeurs doivent **impérativement mettre un objet** à leur
     email, sinon il risque de tomber en spam — et ça n'engage qu'eux
     (l'absence de réponse dans ce cas n'est pas de la responsabilité du
     support).

## Emplacement

`src/pages/Parametres.jsx` :

1. Ligne 344 — aperçu dans la liste des paramètres :
   ```jsx
   <Row label="Support" sub="support@playgroundspot.sn" onClick={() => setShowSupport(true)}>
   ```
   → remplacer `sub="support@playgroundspot.sn"` par `sub="drixoftm@gmail.com"`.

2. Lignes 505-512 — contenu de la modale :
   ```jsx
   <Sheet open={showSupport} onClose={() => setShowSupport(false)} title="Support Client">
     <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
       <p>Besoin d'aide ou d'une assistance pour vos réservations ? Notre équipe support est à votre entière disposition.</p>
       <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
         <p className="font-semibold text-gray-800">✉ Email : <a href="mailto:support@playgroundspot.sn" className="text-primary font-bold">support@playgroundspot.sn</a></p>
         <p className="font-semibold text-gray-800">📞 Téléphone : <span className="text-primary font-bold">+221 77 000 00 00</span></p>
         <p className="font-semibold text-gray-800">📍 Bureau : <span className="text-primary font-bold">Almadies, Dakar, Sénégal</span></p>
       </div>
     </div>
   ```
   → remplacer par (email mis à jour, lignes téléphone/bureau supprimées,
   précisions d'usage ajoutées) :
   ```jsx
   <Sheet open={showSupport} onClose={() => setShowSupport(false)} title="Support Client">
     <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
       <p>Besoin d'aide ou d'une assistance pour vos réservations ? Notre équipe support est à votre entière disposition.</p>
       <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
         <p className="font-semibold text-gray-800">✉ Email : <a href="mailto:drixoftm@gmail.com?subject=Support%20PlaygroundSpot" className="text-primary font-bold">drixoftm@gmail.com</a></p>
       </div>
       <p className="text-xs text-gray-400 leading-relaxed">
         Cet email est réservé aux demandes de support et aux propositions de
         collaboration commerciale — tout autre message ne sera pas traité.
         Merci de toujours indiquer un objet clair : un email sans objet
         tombe souvent en spam, et l'absence de réponse dans ce cas n'engage
         pas notre responsabilité.
       </p>
     </div>
   ```

## Vérification

Ne touche QUE `Parametres.jsx` (les deux emplacements ci-dessus). Les liens
WhatsApp (`wa.me/221770000000`) utilisés ailleurs dans l'app comme contact
support (`BoostCheckoutModal.jsx`, `SubscriptionCheckoutModal.jsx`,
`ChoixPaiement.jsx`, `GerantTarifs.jsx`, `Abonnement.jsx`,
`PaymentSuccess.jsx`, `Landing.jsx`) sont traités séparément — voir
`PROMPT_FIX_REMPLACER_WHATSAPP_PAR_EMAIL.md`. Les placeholders d'exemple
dans les champs de saisie téléphone (`"77 000 00 00 (ex: ...)"`) ne sont
pas concernés, ce sont des exemples de format, pas des coordonnées.
