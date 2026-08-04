# PROMPT — Retirer la fausse promo Ramadan + fix "Quartier null"

## 1. Fausse promotion codée en dur (JoueurHome.jsx)

### Symptôme
Sur l'accueil joueur, un bandeau "OFFRE FLASH — Promotion Ramadan : -20%
sur les créneaux du matin !" invite à réserver, mais **aucune réduction
n'est réellement appliquée** — c'est du texte statique, trompeur pour
l'utilisateur. Capture utilisateur jointe.

### Cause
`src/pages/JoueurHome.jsx`, lignes 178-191 :
```jsx
{/* Promos slider */}
<div className="bg-gradient-to-r from-secondary\15 to-primary\5 border border-secondary\20 p-5 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-4" ...>
  <div className="space-y-1 text-center sm:text-left">
    <span ...>Offre Flash</span>
    <h3 ...>Promotion Ramadan : -20% sur les créneaux du matin !</h3>
    <p ...>Valable sur tous les terrains de Dakar de 08:00 à 12:00.</p>
  </div>
  <button onClick={() => setView('discovery')} ...>
    Réserver maintenant <IconArrowRight size={14} />
  </button>
</div>
```
Aucun système de promo/réduction n'existe ailleurs dans le projet (vérifié
ce jour lors d'un audit plus large) — le bouton ne fait que naviguer vers
"Découverte", sans passer la moindre réduction.

### Ta tâche
Supprime entièrement ce bloc (lignes 178-191). Ne le remplace pas par
autre chose — c'était une maquette jamais raccordée à une vraie
fonctionnalité, à retirer purement et simplement, pas à "corriger" en
inventant un système de promo (hors scope, pas demandé).

## 2. "Quartier null" affiché pour un joueur sans quartier renseigné

### Symptôme
Visible dans la même capture : l'en-tête affiche "Quartier null" au lieu
de rien du tout, quand le profil joueur n'a pas de quartier renseigné.

### Cause
`src/components/Header.jsx`, fonction qui construit titre/sous-titre par
rôle (lignes ~131-144) :
```jsx
case 'gerant':
  return {
    title: passedTitle || `Bonjour ${currentUser.nom.split(' ')[0]} 👋`,
    sub: currentUser.quartier ? `Quartier ${currentUser.quartier}` : '',
    badge: "GÉRANT TERRAIN"
  };
case 'joueur':
default:
  return {
    title: `Bonjour ${currentUser.nom.split(' ')[0]} 👋`,
    sub: `Quartier ${currentUser.quartier}`,
    badge: "JOUEUR PLATFORM"
  };
```
Le cas `gerant` a bien la garde conditionnelle (`currentUser.quartier ? ... : ''`),
le cas `joueur`/`default` ne l'a pas — d'où "Quartier null"/"Quartier
undefined" affiché tel quel quand la valeur est vide.

### Ta tâche
Applique la même garde que pour `gerant`, ligne ~141 :
```jsx
sub: currentUser.quartier ? `Quartier ${currentUser.quartier}` : '',
```

## Vérification

- Recharge l'accueil joueur : le bandeau "Promotion Ramadan" a disparu,
  rien à sa place (pas d'espace vide disgracieux — vérifie le spacing
  autour du bloc supprimé).
- Sur un compte joueur sans quartier renseigné : l'en-tête n'affiche plus
  "Quartier null"/"Quartier undefined", juste "Bonjour Prénom 👋" sans
  sous-titre (cohérent avec le comportement déjà correct côté gérant).
- Sur un compte joueur AVEC quartier renseigné : le sous-titre "Quartier
  X" continue de s'afficher normalement, aucune régression.
