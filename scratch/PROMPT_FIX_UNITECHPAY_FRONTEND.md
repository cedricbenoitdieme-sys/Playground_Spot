# Prompt — Corrections suite à l'intégration UnitechPay

## Contexte

Le parcours de paiement (`ChoixPaiement.jsx`, `PaiementAttente.jsx`,
`QrOrangeMoney.jsx`, `payment.js`) a été implémenté et vérifié — la logique
Realtime, l'anti double-clic, les codes d'erreur et le contrat
`create-payment` sont corrects. Mais un audit du code réel (pas juste des
composants ajoutés, aussi de leur point de branchement dans
`BookingFlow.jsx`) fait ressortir 3 problèmes, dont un bloquant.

## 🔴 Problème 1 (BLOQUANT) — Aucun vrai `creneau_id` n'est jamais envoyé

`BookingFlow.jsx:493-494` affiche une grille de créneaux **statique et
codée en dur** :

```js
{['08:00', '10:00', '12:00', '16:00', '18:00', '20:00', '21:00', '22:00', '23:00'].map(t => { ... })}
```

`selectedSlot` n'est donc jamais qu'une chaîne horaire ("18:00"), jamais un
identifiant réel de la table `creneaux`. Pire : à la ligne 561, le code
construit :

```js
creneau={{
  id: selectedSlotId || terrain?.creneau_id,
  ...
```

`selectedSlotId` **n'est déclaré nulle part dans tout le fichier** (aucun
`useState`, aucune assignation) — c'est un identifiant `undefined` en
permanence. `terrain?.creneau_id` n'existe pas non plus sur l'objet
`terrain` (un terrain n'a pas un "creneau_id" unique). Résultat concret :
`creneau.id` vaut toujours `undefined`, et `payment.js:9-11` rejette
immédiatement côté client avec `creneau_introuvable` avant même d'appeler
le serveur. **Le paiement en ligne est cassé à 100% aujourd'hui**, quel que
soit le créneau choisi.

### Correctif attendu

Remplacer la grille statique par une vraie liste de créneaux, en
réutilisant `fetchCreneauxDisponibles(terrainId, date)`, déjà présente et
inchangée dans `src/services/stats.js:375-385` :

```js
// Retourne { id, heure_debut, heure_fin, prix_override }[] filtré sur statut='disponible'
const creneaux = await fetchCreneauxDisponibles(terrain.id, dateChoisie);
```

Ça implique :
1. Ajouter un état `[creneaux, setCreneaux]` et un `useEffect` qui appelle
   `fetchCreneauxDisponibles` quand le terrain et/ou la date sélectionnée
   changent (`dateChoisie` — actuellement le code prend systématiquement
   `new Date().toISOString().split('T')[0]`, càd aujourd'hui ; il faudra
   probablement un sélecteur de date si ce n'est pas déjà prévu ailleurs
   dans le flow).
2. Remplacer la grille `['08:00', ...].map(...)` par un `.map()` sur les
   vrais créneaux retournés, en gardant le même style visuel (boutons
   `heure_debut.slice(0,5)`), mais en stockant l'objet complet (ou au
   minimum son `id`) dans l'état sélectionné plutôt qu'une simple string.
3. Ligne 559-566, passer le vrai créneau :
   ```js
   <ChoixPaiement
     creneau={{
       id: selectedCreneau.id,
       date: selectedCreneau.date ?? dateChoisie,
       heure_debut: selectedCreneau.heure_debut,
       heure_fin: selectedCreneau.heure_fin,
       prix_override: selectedCreneau.prix_override,
     }}
     ...
   ```
4. `bookedSlots`/`wantedSlots` (alertes "créneau qui se libère", déjà
   câblées en Realtime plus haut dans le fichier) doivent être adaptées
   pour comparer des `id` de créneaux réels plutôt que des strings
   horaires, sinon la comparaison `bookedSlots.includes(t)` ne
   correspondra plus à rien.

Ce n'est pas un simple renommage de variable — c'est le morceau qui
manquait pour que tout le reste (déjà bien fait) fonctionne réellement.

## 🟠 Problème 2 — Regex téléphone trop permissive

`src/lib/validators.js:66` :

```js
const cleanedCheck = /^(\+221)?7[0-9678]\d{7}$/.test(cleaned);
```

`[0-9678]` est équivalent à `[0-9]` (0-9 couvre déjà 6,7,8 — la classe de
caractères ne fait rien de plus que 0-9). Le format sénégalais attendu est
`7[0678]XXXXXXX` (2e chiffre uniquement 0, 6, 7 ou 8). Aujourd'hui, un
numéro commençant par 71, 72, 73, 74, 75 ou 79 passe la validation
frontend — il sera bien rejeté par le backend (`create-payment` utilise la
bonne regex `^7[0678]\d{7}$`), donc pas de faille de sécurité, juste une
validation inline qui ne remplit pas son rôle (l'utilisateur ne voit
l'erreur qu'après l'appel serveur au lieu d'un feedback immédiat).

**Correctif** : remplacer `[0-9678]` par `[0678]` à cette ligne (et
vérifier s'il y a une occurrence similaire ailleurs dans le fichier, ex.
`PHONE_REGEX` définie plus haut).

## 🟡 Problème 3 (mineur, cosmétique) — Montant indicatif basé sur un champ inexistant

`ChoixPaiement.jsx:49` :

```js
const montantIndicatif = creneau?.prix_override ?? ((terrain?.price || 0) * (creneau?.duree || 1));
```

`creneau.duree` n'existe pas dans la table `creneaux` (qui a
`heure_debut`/`heure_fin`, pas de colonne `duree`). Une fois le Problème 1
corrigé et un vrai créneau passé (avec `heure_debut`/`heure_fin` réels),
calculer la durée réellement :

```js
const dureeHeures = creneau?.heure_debut && creneau?.heure_fin
  ? Math.round((new Date(`1970-01-01T${creneau.heure_fin}`) - new Date(`1970-01-01T${creneau.heure_debut}`)) / 3600000)
  : 1;
const montantIndicatif = creneau?.prix_override ?? ((terrain?.price || 0) * dureeHeures);
```

Aucun impact de sécurité (le serveur recalcule toujours le montant réel via
`creer_reservation_en_attente`) — c'est uniquement l'affichage avant
paiement qui serait erroné sans ce correctif.

## Ne pas toucher

- `payment.js`, `PaiementAttente.jsx`, `QrOrangeMoney.jsx` — déjà corrects,
  aucun changement nécessaire.
- Le contrat `create-payment` — inchangé, ces correctifs sont uniquement
  côté sélection de créneau et validation locale.
