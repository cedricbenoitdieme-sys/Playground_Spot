# PROMPT — Utiliser les vrais logos Wave/Orange Money dans le footer

## Demande

Dans le footer de la Landing page, section "Paiements acceptés", remplacer
les badges texte actuels par les vrais logos fournis par l'utilisateur.

## Fichiers fournis

À la racine du repo (PAS dans `src/` ni `public/` pour l'instant) :
- `logo/LOGO WAVE.png`
- `logo/LOGO OM.png`

## Emplacement à modifier

`src/pages/Landing.jsx`, lignes 1086-1091 :

```jsx
<div>
  <h4 className="text-white font-bold mb-4 font-display">Paiements acceptés</h4>
  <div className="flex flex-wrap gap-3">
    <div className="bg-white px-3 py-1.5 rounded-lg flex items-center justify-center text-[#1a56db] font-bold text-sm tracking-tight">Wave</div>
    <div className="bg-black px-3 py-1.5 rounded-lg flex items-center justify-center border border-white/10 text-[#ff6600] font-bold text-xs tracking-tight">Orange Money</div>
  </div>
</div>
```

## Ta tâche

1. Copie (ou déplace) les deux fichiers depuis `logo/` vers `src/assets/`,
   avec des noms cohérents avec la convention déjà utilisée ailleurs dans
   le projet (`src/assets/wave.png`, `src/assets/orange_money.png` sont
   déjà importés dans `SubscriptionCheckoutModal.jsx`/`BoostCheckoutModal.jsx`
   — vérifie si ces fichiers existants sont déjà les mêmes logos ou des
   versions différentes ; si ce sont les mêmes, réutilise-les directement
   au lieu de dupliquer, sinon donne un nom distinct genre
   `wave-payment-badge.png` / `orange-money-payment-badge.png`).
2. Importe-les en haut de `Landing.jsx` :
   ```jsx
   import waveLogoFooter from '../assets/<nom-du-fichier-wave>.png';
   import omLogoFooter from '../assets/<nom-du-fichier-om>.png';
   ```
3. Remplace le contenu des deux `<div>` par des `<img>`, en gardant un
   fond cohérent avec le style actuel (fond blanc pour Wave, fond noir
   pour Orange Money, coins arrondis) mais en affichant le vrai logo au
   lieu du texte :
   ```jsx
   <div className="flex flex-wrap gap-3">
     <div className="bg-white px-3 py-1.5 rounded-lg flex items-center justify-center h-9">
       <img src={waveLogoFooter} alt="Wave" className="h-5 w-auto object-contain" />
     </div>
     <div className="bg-black px-3 py-1.5 rounded-lg flex items-center justify-center border border-white/10 h-9">
       <img src={omLogoFooter} alt="Orange Money" className="h-5 w-auto object-contain" />
     </div>
   </div>
   ```
   Ajuste `h-5`/`h-9` selon les proportions réelles des fichiers fournis
   pour un rendu propre (ni écrasé, ni débordant du badge).

## Vérification

Affiche la Landing page et confirme que les deux logos sont nets, bien
proportionnés, et lisibles sur leur fond respectif (blanc pour Wave, noir
pour Orange Money) sans déformation.
