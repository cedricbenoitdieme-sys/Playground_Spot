# PROMPT — Badge "Plan Actuel" écrasé sur la carte tarif Entreprise

## Symptôme

Sur la page "Abonnement & Tarifs" (`GerantTarifs.jsx`), le badge "Plan
Actuel" affiché sur la carte du plan actif (ex: Entreprise) est écrasé :
le texte passe sur deux lignes ("PLAN" / "ACTUEL") à l'intérieur d'une
pastille `rounded-full`, ce qui donne une forme resserrée/moche au lieu
d'un badge pilule net, en plus de venir chevaucher visuellement le ruban
"OFFRE PREMIUM" juste au-dessus. Capture utilisateur jointe.

## Cause identifiée

`src/pages/GerantTarifs.jsx`, lignes ~247-257 :

```jsx
<div className="flex items-center justify-between">
  <h3 className={`text-xl font-bold font-display ${isEntreprise ? 'text-amber-300' : 'text-white'}`}>
    {plan.nom || configObj.nom}
  </h3>
  {isCurrent && (
    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
      Plan Actuel
    </span>
  )}
</div>
```

Le titre du plan (`h3`, `text-xl`) et le badge "Plan Actuel" sont posés
côte à côte avec `justify-between` dans une carte de largeur contrainte
(grille à 4 colonnes). Pour "Entreprise" (titre plus long), il ne reste pas
assez de place horizontale pour le badge, dont le texte se retrouve à
casser sur deux lignes tout en gardant une forme `rounded-full` — d'où
l'aspect écrasé/en pastille bizarre au lieu d'une vraie pilule.

## Ta tâche

Empêche le texte du badge de casser en deux lignes et donne-lui assez
d'espace, par exemple :

```jsx
<div className="flex items-start justify-between gap-2 flex-wrap">
  <h3 className={`text-xl font-bold font-display ${isEntreprise ? 'text-amber-300' : 'text-white'}`}>
    {plan.nom || configObj.nom}
  </h3>
  {isCurrent && (
    <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shrink-0">
      Plan Actuel
    </span>
  )}
</div>
```

Points clés :
- `whitespace-nowrap` sur le `<span>` pour empêcher la casse en deux lignes.
- `shrink-0` pour que le badge garde sa taille même si le titre est long.
- `flex-wrap` + `gap-2` sur le conteneur parent pour que le badge tombe
  proprement à la ligne suivante (pleine largeur, pas de mot coupé) si la
  carte est vraiment trop étroite pour les deux côte à côte.
- Légère augmentation du padding (`px-2.5 py-1` au lieu de `px-2 py-0.5`)
  pour que le badge respire un peu plus, cohérent avec les autres badges
  de la page (`px-4 py-1` pour "Le plus populaire"/"Offre Premium").

Vérifie aussi visuellement qu'il n'y a plus de chevauchement avec le
ruban "Offre Premium" positionné en absolu juste au-dessus
(`absolute -top-3.5 ...`, lignes ~240-245) une fois le badge corrigé.

## Vérification

Teste l'affichage des 4 cartes (Free/Starter/Pro/Entreprise) avec chaque
plan comme "actuel" tour à tour (`isCurrent` vrai sur chacune), en desktop
et en mobile, pour confirmer que le badge reste une pilule propre sur une
seule ligne dans tous les cas.
