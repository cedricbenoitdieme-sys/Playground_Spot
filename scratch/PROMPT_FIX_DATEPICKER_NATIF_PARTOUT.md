# PROMPT — Remplacer tous les sélecteurs de date/heure natifs par un composant custom

## Symptôme

Sur la modale "Génération récurrente (En masse)" de `GerantPlanning.jsx`
(capture utilisateur jointe), cliquer sur le champ "Date de début" ouvre le
calendrier **natif du navigateur/OS** (`<input type="date">`), qui
s'affiche par-dessus la modale sans respecter le design du SaaS (fond
blanc, police système, boutons "Ven/Sam/Dim" et champ "Heure de fermeture"
recouverts). Demande explicite : **tout ce qui est calendrier dans le SaaS
doit être stylé/géré par l'app**, pas laissé au rendu natif du navigateur.

## Périmètre — inventaire complet

Un `<input type="date">` ou `<input type="time">` natif rend TOUJOURS son
propre calendrier/horloge avec le style de l'OS/navigateur — impossible à
personnaliser en CSS au-delà de quelques détails mineurs (couleur du texte,
bordure du champ). La seule vraie solution est de ne plus utiliser ces
types d'input et de les remplacer par un composant React custom (calendrier
+ sélecteur d'heure) qui rend son propre popup stylé cohérent avec le
thème sombre de l'app.

Occurrences actuelles à remplacer (13 au total, 4 fichiers) :

- `src/pages/GerantPlanning.jsx` : lignes 650, 660, 815, 825, 866, 876,
  986, 996 (8 occurrences — le plus gros foyer, inclut la modale de la
  capture)
- `src/components/PeriodSelector.jsx` : lignes 82, 92
- `src/pages/admin/AdminLogs.jsx` : lignes 104, 112
- `src/components/BookingFlow.jsx` : ligne 552

## Ta tâche

1. Crée deux composants partagés réutilisables (ex:
   `src/components/DatePicker.jsx` et `src/components/TimePicker.jsx`, ou
   un seul fichier si plus pratique) :
   - Rendu du popup via le composant `Modal`/`createPortal` déjà existant
     dans le projet (voir `src/components/Modal.jsx`) pour éviter tout
     problème de positionnement/z-index/coupure par un conteneur parent.
   - Design cohérent avec le thème sombre de l'app (mêmes couleurs
     `bg-[#0F2318]`, bordures `border-white/10`, accent `bg-primary`,
     `rounded-2xl`/`rounded-3xl`, police `font-display` pour les titres —
     regarde `SubscriptionCheckoutModal.jsx` ou `GerantTarifs.jsx` pour les
     tokens de design déjà utilisés ailleurs).
   - API simple compatible avec l'usage actuel : `value` (string
     `YYYY-MM-DD` pour date, `HH:mm` pour heure) + `onChange(value)`, pour
     minimiser les changements dans les fichiers appelants.
   - Pas besoin de gérer les fuseaux horaires (usage 100% local, Sénégal).
2. Remplace les 13 occurrences listées ci-dessus par ces composants.
3. Si une bibliothèque légère existe déjà dans `package.json`
   (`react-day-picker`, `react-datepicker`, etc.), vérifie avant de tout
   construire à la main — sinon un composant custom léger est acceptable
   vu le besoin simple (pas de plages complexes, pas de récurrence
   avancée à afficher dans le picker lui-même).

## Vérification

- Teste chaque écran concerné (génération récurrente + horaires par jour
  dans `GerantPlanning.jsx`, filtres de `PeriodSelector.jsx` et
  `AdminLogs.jsx`, sélection de date dans `BookingFlow.jsx`) : le popup
  doit s'ouvrir avec le style de l'app, jamais le calendrier natif du
  navigateur.
- Vérifie mobile ET desktop (le rendu natif diffère fortement entre
  Chrome desktop, Safari iOS, Chrome Android — s'assurer qu'aucun des
  trois ne laisse passer le natif).
- Confirme que la valeur sélectionnée se propage bien aux states existants
  (`bulkStartDate`, `bulkEndDate`, `newSlotStart`, etc.) sans changer leur
  format (`YYYY-MM-DD` / `HH:mm`), pour ne rien casser dans la logique
  métier qui consomme ces valeurs plus loin.

## Interdictions

- Ne change pas le format de valeur (`YYYY-MM-DD`, `HH:mm`) consommé par
  le reste du code (RPC, calculs de créneaux, etc.) — seul le rendu visuel
  du sélecteur change.
- N'introduis pas une bibliothèque lourde (ex: un calendrier complet avec
  timezone, récurrence, etc.) pour un besoin aussi simple — priorité à la
  légèreté et à la cohérence visuelle avec le reste du SaaS.
