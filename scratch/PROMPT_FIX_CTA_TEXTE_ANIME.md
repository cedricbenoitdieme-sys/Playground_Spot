# PROMPT — CTA principal Landing : texte fixe + suffixe animé qui tourne

## Contexte

Le bouton CTA principal de la Landing page (déjà stylé, animations déjà
en place, RIEN à changer côté classes CSS/responsive/glow — voir
`src/pages/Landing.jsx` lignes 403-410) doit maintenant afficher :
- Une partie **fixe** : "Réserve ton terrain"
- Une partie **animée**, qui tourne automatiquement entre ces 5 phrases,
  chacune affichée quelques secondes avant de passer à la suivante :
  ```
  en 30 secondes
  sans passer d'appel
  où que tu sois
  en un clic
  à toute heure
  ```

## Ta tâche

### 0. Important — ne pas utiliser `animate-in`/`fade-in`/`slide-in-from-*`

Ces classes (utilisées un peu partout ailleurs dans le projet, ex.
`CustomAlertModal.jsx`) reposent normalement sur le plugin
`tailwindcss-animate` — **qui n'est pas installé dans ce projet**
(`tailwind.config.js` a `plugins: []`, package absent de `package.json`).
Elles ne produisent donc **aucune animation réelle** partout où elles
sont utilisées dans l'app (constat fait en préparant ce prompt, sujet
séparé, pas à corriger ici). Par contre, `animate-slide-up-fast` (déjà
sur le conteneur du bouton, ligne 403) fonctionne vraiment : c'est un
`@keyframes` injecté via une balise `<style dangerouslySetInnerHTML>`
directement dans `Landing.jsx` (lignes ~318-361). C'est CE mécanisme
qu'il faut réutiliser pour l'animation du mot qui tourne, pas
`animate-in`.

### 1. Ajoute la liste et le state de rotation

En haut de `Landing.jsx` (avec les autres constantes du fichier) :
```jsx
const CTA_ROTATING_PHRASES = [
  'en 30 secondes',
  "sans passer d'appel",
  'où que tu sois',
  'en un clic',
  'à toute heure',
];
```

Dans le composant `Landing`, à côté des autres `useState`/`useEffect` déjà
présents :
```jsx
const [ctaPhraseIndex, setCtaPhraseIndex] = useState(0);

useEffect(() => {
  const interval = setInterval(() => {
    setCtaPhraseIndex(prev => (prev + 1) % CTA_ROTATING_PHRASES.length);
  }, 2200); // ~2.2s par phrase, ajustable si ça semble trop rapide/lent à l'usage
  return () => clearInterval(interval);
}, []);
```

### 2. Ajoute un vrai keyframe au bloc `<style>` déjà présent (lignes ~318-361)

Dans le même `<style dangerouslySetInnerHTML>` déjà présent dans
`Landing.jsx` (à côté de `slideUpFast`/`slideUpMedium`/etc.), ajoute :
```css
@keyframes ctaWordCycle {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-cta-word {
  animation: ctaWordCycle 0.5s cubic-bezier(.22,1,.36,1) both;
}
```

### 3. Modifie le bouton principal (lignes 404-410)

Remplace UNIQUEMENT le contenu texte du bouton, garde toutes les classes
CSS du `<button>` telles quelles (animation d'apparition, glow, hover,
responsive — rien à toucher là-dessus) :

```jsx
<button 
  onClick={() => handleGoToApp('joueur', 'discovery')} 
  className="w-full sm:w-auto bg-primary text-white font-bold text-base px-8 py-4 min-h-[48px] rounded-2xl flex items-center justify-center gap-2 shadow-glow hover:-translate-y-1 hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer hover:bg-emerald-600"
>
  <IconMapPin size={22} />
  <span className="whitespace-nowrap">Réserve ton terrain</span>
  <span
    key={ctaPhraseIndex}
    className="whitespace-nowrap font-semibold text-sm text-[#E8DCC8] animate-cta-word"
  >
    {CTA_ROTATING_PHRASES[ctaPhraseIndex]}
  </span>
</button>
```

Points clés du choix de design (respecte les contraintes données) :
- **Police** : inchangée, `font-bold` conservé sur la partie fixe.
- **Taille adaptée pour rester lisible** : la partie fixe reste
  `text-base` (comme avant), la partie qui tourne passe en `text-sm
  font-semibold` — légèrement plus petite/moins grasse pour bien
  distinguer visuellement "l'action" du "modificateur", et pour que les
  phrases plus longues ("sans passer d'appel") ne fassent pas déborder le
  bouton ou casser la mise en page.
- **Effets de couleur conservés** : le bouton garde exactement son style
  actuel (fond vert, glow, hover). La partie animée utilise `#E8DCC8`
  (la couleur crème déjà utilisée ailleurs sur cette même page — bouton
  secondaire et dégradé du titre H1) pour se démarquer subtilement sans
  introduire une nouvelle couleur hors palette.
- **Animation** : `key={ctaPhraseIndex}` force React à remonter le
  `<span>` à chaque changement, ce qui redéclenche l'animation CSS
  `.animate-cta-word` (vrai `@keyframes`, ajouté au bloc `<style>` déjà
  présent dans ce fichier — pas de nouvelle dépendance).

## Vérification

- Charge la Landing page : le bouton doit afficher "Réserve ton terrain"
  suivi d'une phrase qui change automatiquement toutes les ~2,2 secondes,
  avec une transition douce (pas de saut brutal).
- Teste sur mobile (largeur étroite) : confirme que le bouton reste
  lisible et ne déborde pas de l'écran même avec la phrase la plus longue
  ("sans passer d'appel").
- Confirme que le clic sur le bouton fonctionne toujours normalement
  (navigation vers `discovery`), peu importe la phrase affichée au moment
  du clic.
- Confirme que l'intervalle est bien nettoyé (`clearInterval`) quand on
  quitte la Landing page — pas de fuite mémoire/timer qui continue de
  tourner en arrière-plan.

## Interdictions

- Ne touche pas au bouton secondaire ("Inscrire mon terrain") — cette
  demande concerne uniquement le CTA principal.
- Ne change aucune classe CSS existante du bouton (glow, hover, responsive,
  animation d'apparition `animate-slide-up-fast` du conteneur parent) —
  uniquement le contenu texte à l'intérieur.
- N'ajoute pas de nouvelle librairie d'animation, et n'utilise pas
  `animate-in`/`fade-in`/`slide-in-from-*` (classes inertes dans ce
  projet, voir point 0) — utilise le vrai `@keyframes` ajouté au point 2.
