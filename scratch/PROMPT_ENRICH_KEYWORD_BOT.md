# Prompt — Enrichir le bot à mots-clés existant (ChatWidget.jsx)

## Contexte

Décision prise : le canal "Bot" de `src/components/ChatWidget.jsx` reste
un système à règles/mots-clés (pas d'IA externe, pas de dépendance
réseau, zéro coût) — pas de bascule vers Gemini. Objectif : élargir la
couverture de sujets qu'il sait traiter, en restant sur le même système
`if/else` déjà en place (`handleSendMessage`, bloc `if (activeChannel === 'bot')`).

Ne PAS toucher à `bot_knowledge_base` (table SQL) ni à l'Edge Function
`chatbot-query` — elles restent en place mais dormantes, pas utilisées
par ce prompt.

## Sujets actuellement couverts (à garder tels quels)

`prix/tarif` (terrains), `wave/orange/payer/paiement`, `annul/rembours`,
`ouakam`, `reserv/réserv` — cf. le bloc `saasKeywords` +
`if/else` existant.

## Sujets à ajouter

Reprendre le même style (courtoisie, "Capitaine", émoji ⚽ occasionnel,
2-3 phrases max) et ajouter des branches `if lowerText.includes(...)`
pour ces thèmes, avant le `else` générique final. Contenu source (déjà
validé, à reformuler dans le ton du bot plutôt que copier-coller brut) :

1. **Validation d'un terrain (mots-clés : `valid`, `approuv`, `statut terrain`,
   `en attente` côté gérant)** :
   "Quand vous créez votre fiche terrain, elle passe automatiquement en
   'en attente' le temps qu'un admin la valide — elle n'est pas visible
   des joueurs ni réservable pendant ce temps. Si elle est refusée, vous
   verrez le motif écrit par l'admin et pourrez corriger et resoumettre.
   Une fois approuvée, vous pouvez modifier votre fiche (photos, tarif...)
   librement, sans redéclencher de validation."

2. **Boost / visibilité (mots-clés : `boost`, `visibilité`, `sponsor`,
   `mettre en avant`)** :
   "Le Budget Visibilité permet de faire remonter votre terrain dans les
   résultats de recherche, en allouant un budget pour une durée choisie —
   réservé aux plans Starter, Pro et Entreprise (pas disponible sur
   Free). Vous trouverez ça dans l'onglet 'Budget Visibilité' de votre
   espace gérant."

3. **Abonnements / plans gérant (mots-clés : `abonnement`, `plan`,
   `forfait`, `free`, `starter`, `entreprise` — attention à ne pas
   capter le mot "pro" seul, trop ambigu en français, préférer `plan pro`)** :
   Répondre avec les 4 plans et leurs GRANDES lignes (Free/Starter/Pro/
   Entreprise), MAIS **ne pas coder les prix en dur dans cette réponse**
   — les récupérer dynamiquement. Ajouter en haut du fichier ou dans un
   hook dédié :
   ```js
   import { supabase } from '../lib/supabase';
   // ...
   const [plansInfo, setPlansInfo] = useState([]);
   useEffect(() => {
     if (!isOpen) return;
     supabase.from('plan_limits').select('plan_id, nom, prix_mensuel, prix_annuel, commission_rate').order('prix_mensuel')
       .then(({ data }) => setPlansInfo(data || []));
   }, [isOpen]);
   ```
   Puis construire la réponse à partir de `plansInfo` (map → texte), pas
   d'un texte figé — pour que si les prix changent dans `plan_limits`
   plus tard, le bot ne donne jamais un chiffre obsolète. C'est le même
   principe que la Tâche 3 de la demande initiale (ne pas coder les
   tarifs en dur), juste appliqué au système à mots-clés plutôt qu'à un
   prompt IA.

4. **Redirection support humain (mots-clés : `humain`, `parler à
   quelqu'un`, `mon compte`, `mon paiement`, `pourquoi` suivi de rien de
   reconnu, ou tout message qui tombe dans le `else` générique final
   actuel)** :
   Remplacer le message générique actuel ("Je suis à votre disposition
   Capitaine !...") par quelque chose qui, en plus, mentionne
   explicitement l'option humaine :
   "Je suis à votre disposition Capitaine ! Si votre question porte sur
   votre compte ou une réservation précise, ou si je ne peux pas vous
   aider, basculez sur l'onglet 'Admin' ci-dessus pour parler directement
   à notre équipe support."

## Contraintes

- Rester dans le même fichier, même style, même structure `if/else` +
  `setTimeout` — pas de refonte, pas d'appel réseau vers un service tiers.
- Le fetch de `plan_limits` (point 3) est la seule requête réseau
  nouvelle nécessaire, et elle interroge directement Supabase (déjà
  utilisé partout dans l'app), pas un nouveau service.
- Ne pas supprimer ni modifier `bot_knowledge_base`/`chatbot-query` —
  laissés en l'état pour une éventuelle bascule future.
