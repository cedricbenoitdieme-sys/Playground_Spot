# PROMPT — Photo de terrain cassée à l'étape "Résumé" du booking

## Symptôme

Sur l'écran "Résumé" du flux de réservation (étape 2/4 du `BookingFlow`,
capture jointe par l'utilisateur), la miniature du terrain s'affiche comme
une image cassée (icône native du navigateur + texte alt "Drix terrain"),
au lieu d'une vraie photo ou d'un placeholder propre.

## Cause identifiée

`src/components/BookingFlow.jsx` ligne 500 :

```jsx
<img src={terrain?.image} className="w-24 h-24 rounded-2xl object-cover" alt={terrain?.name} />
```

C'est une balise `<img>` brute, alors que **partout ailleurs dans l'app**
(TerrainCard, MapDiscovery, TopTerrains, JoueurHome, JoueurFavoris,
MyReservations, TerrainDetail, GerantVisibilityBoost), l'affichage d'une
photo de terrain passe par le composant `src/components/TerrainImage.jsx`.

Ce composant existe précisément parce que le bucket Storage
`terrain-photos` est **privé** (nécessaire pour cacher les photos d'un
terrain en attente de validation `pending`) : il n'y a jamais d'URL stable
stockée dans `terrains.image_url`, il faut résoudre une URL **signée** à la
demande via `getTerrainPrincipalPhotoUrl(terrainId)`, et afficher un
placeholder neutre (icône + logo PlaygroundSpot) si ça échoue — jamais une
image cassée brute.

`terrain?.image` dans `BookingFlow.jsx` vient directement de
`terrains.image_url` (voir `src/services/terrains.js`), qui pour un bucket
privé est soit vide, soit une URL signée déjà expirée. D'où l'image cassée
visible à l'écran.

## Ta tâche

Dans `BookingFlow.jsx`, remplace la balise `<img>` ligne 500 par le
composant `TerrainImage`, comme dans les autres écrans :

```jsx
import { TerrainImage } from './TerrainImage'; // à ajouter en tête de fichier si absent

...

<TerrainImage
  terrainId={terrain?.id}
  fallbackUrl={terrain?.image}
  alt={terrain?.name}
  className="w-24 h-24 rounded-2xl"
/>
```

Vérifie l'import existant de `TerrainImage` dans le fichier avant d'en
ajouter un doublon.

## Vérification

- Recherche dans tout `src/` d'autres balises `<img src={...terrain...}>`
  ou `<img src={...image_url...}>` brutes qui devraient aussi passer par
  `TerrainImage` (une recherche rapide n'en a montré aucune autre dans
  `BookingFlow.jsx`, mais un passage sur l'ensemble du repo est plus sûr).
- Teste le flux de réservation complet (étape Créneau → Résumé → Paiement)
  sur un terrain qui a une vraie photo, et sur un terrain sans photo, pour
  confirmer que les deux cas s'affichent proprement (photo réelle ou
  placeholder neutre — jamais d'icône cassée).

## Interdictions

- Ne stocke jamais d'URL signée dans `terrains.image_url` pour "corriger"
  ça côté données — c'est explicitement proscrit par un commentaire déjà
  présent dans `TerrainFormModal.jsx` ("Ne plus jamais envoyer d'URL
  signée dans terrains.image_url !"). Le bucket doit rester privé et la
  résolution d'URL signée doit rester à la demande, via `TerrainImage`.
