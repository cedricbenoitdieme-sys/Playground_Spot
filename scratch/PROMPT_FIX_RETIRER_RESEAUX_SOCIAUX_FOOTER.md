# PROMPT — Retirer les liens Facebook/Instagram/LinkedIn du footer

## Demande

L'utilisateur n'a aucun de ces réseaux sociaux et ne souhaite pas s'exposer
inutilement — ces liens (qui ne mènent nulle part, simples `<span>` sans
`href`) doivent disparaître complètement du footer de la Landing page.
Capture jointe.

## Emplacement

`src/pages/Landing.jsx`, lignes 1091-1095 :

```jsx
<div className="mt-6 flex gap-4">
  <span className="text-gray-400 hover:text-white transition-colors cursor-pointer">Facebook</span>
  <span className="text-gray-400 hover:text-white transition-colors cursor-pointer">Instagram</span>
  <span className="text-gray-400 hover:text-white transition-colors cursor-pointer">LinkedIn</span>
</div>
```

## Ta tâche

Supprime entièrement ce bloc (les 3 `<span>` et leur conteneur `<div>`).
Vérifie l'affichage du footer après suppression : pas d'espace vide
disgracieux à la place, pas de `<div>` parent qui deviendrait vide/inutile
si ce bloc en était l'unique contenu.
