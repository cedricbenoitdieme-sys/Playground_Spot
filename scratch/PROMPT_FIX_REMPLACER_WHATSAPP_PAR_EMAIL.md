# PROMPT — Remplacer les liens WhatsApp support (numéro fictif) par des liens email

## Contexte

Le numéro WhatsApp `+221 77 00 00 00 00` (`221770000000`) utilisé partout
dans l'app comme "contact support" est **fictif** — l'utilisateur n'a pas
de numéro professionnel. Ces boutons sont donc actuellement cassés :
cliquer dessus ouvre WhatsApp vers un numéro qui n'existe pas côté
support. À remplacer par des liens `mailto:drixoftm@gmail.com`, avec un
objet pré-rempli pertinent au contexte (ça règle au passage l'exigence
"toujours mettre un objet" demandée pour l'email support — voir
`PROMPT_FIX_SUPPORT_CLIENT_CONTENU.md`, même email, mêmes règles d'usage).

**Ne pas confondre** avec ces autres usages de `wa.me` dans le code, qui
sont légitimes et à laisser tels quels (numéro réel/dynamique, pas le
fictif) :
- `src/pages/GerantDashboard.jsx:193` — contacte le vrai numéro d'un
  joueur (`res.tel`) pour une réservation donnée.
- `src/pages/TerrainDetail.jsx:138` — partage un lien de terrain via
  WhatsApp (pas un contact support).

## Occurrences à remplacer (9 liens + 1 mention texte)

Toutes construites sur le modèle `mailto:drixoftm@gmail.com?subject=<objet
encodé>` — reprends le texte du message WhatsApp existant comme base de
l'objet (traduit en objet d'email court), et adapte le texte/libellé du
bouton de "Contacter le support WhatsApp" à quelque chose comme "Contacter
le support par email".

1. `src/components/BoostCheckoutModal.jsx:122` —
   `wa.me/221770000000?text=Bonjour,%20je%20souhaite%20booster...`
   → `mailto:drixoftm@gmail.com?subject=Question%20boost%20de%20visibilit%C3%A9`

2. `src/components/BoostCheckoutModal.jsx:327` —
   `...mon%20paiement%20de%20boost%20est%20en%20attente`
   → `mailto:drixoftm@gmail.com?subject=Paiement%20boost%20en%20attente`

3. `src/components/SubscriptionCheckoutModal.jsx:107` —
   `...je%20souhaite%20souscrire%20au%20plan%20g%C3%A9rant`
   → `mailto:drixoftm@gmail.com?subject=Question%20souscription%20abonnement`

4. `src/components/SubscriptionCheckoutModal.jsx:310` —
   `...mon%20paiement%20d'abonnement%20est%20en%20attente`
   → `mailto:drixoftm@gmail.com?subject=Paiement%20abonnement%20en%20attente`

5. `src/components/paiement/ChoixPaiement.jsx:207` —
   `...je%20souhaite%20r%C3%A9server%20un%20terrain`
   → `mailto:drixoftm@gmail.com?subject=Aide%20r%C3%A9servation%20terrain`

6. `src/components/paiement/ChoixPaiement.jsx:226` —
   `...la%20passerelle%20de%20paiement%20rencontre%20un%20souci%20(502)...`
   → `mailto:drixoftm@gmail.com?subject=Souci%20passerelle%20de%20paiement%20(502)`

7. `src/pages/GerantTarifs.jsx:418` — `wa.me/221770000000` (sans message)
   → `mailto:drixoftm@gmail.com?subject=Question%20abonnement%20%26%20tarifs`

8. `src/pages/PaymentSuccess.jsx:116` —
   `...mon%20paiement%20n'est%20pas%20confirm%C3%A9`
   → `mailto:drixoftm@gmail.com?subject=Paiement%20non%20confirm%C3%A9`

9. `src/pages/Abonnement.jsx:465` — `wa.me/221770000000` (sans message)
   → `mailto:drixoftm@gmail.com?subject=Question%20abonnement%20g%C3%A9rant`

10. `src/pages/Landing.jsx:1213` — mention texte (pas un lien) :
    ```
    Pas le temps de remplir le formulaire ? Envoyez-nous une simple photo
    de votre planning papier ou un vocal WhatsApp au +221 77 000 00 00.
    ```
    → remplacer par un texte équivalent basé sur l'email, par exemple :
    ```
    Pas le temps de remplir le formulaire ? Envoyez-nous une simple photo
    de votre planning papier par email à drixoftm@gmail.com (objet :
    "Configuration terrain").
    ```
    Adapte le lien/texte pour que ce soit cliquable (`mailto:drixoftm@gmail.com?subject=Configuration%20terrain`)
    si le composant le permet facilement.

## Détails techniques

- Retire `target="_blank"` là où il n'a plus de sens pour un `mailto:`
  (optionnel selon navigateur, mais généralement inutile pour mailto).
  `rel="noopener noreferrer"` peut rester sans problème.
- Change les icônes `IconBrandWhatsapp` (import `@tabler/icons-react`) en
  une icône email (`IconMail`) là où l'icône WhatsApp est affichée à côté
  du texte du bouton, pour rester cohérent visuellement avec le nouveau
  canal de contact.
- Adapte les libellés visibles ("Contacter le support WhatsApp" →
  "Contacter le support par email", etc.) dans chacun des fichiers listés.

## Vérification

- Vérifie que chaque lien `mailto:` s'ouvre correctement (ouvre le client
  mail par défaut avec le bon objet pré-rempli) sur desktop et mobile.
- Confirme qu'aucune régression visuelle n'apparaît (icône, alignement du
  bouton) sur les écrans concernés.
- Ne touche PAS `GerantDashboard.jsx:193` ni `TerrainDetail.jsx:138` (numéro
  réel de réservation / partage de lien — hors périmètre).
