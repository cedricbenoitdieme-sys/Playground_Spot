# Audit complet — données fictives/mockées dans PlaygroundSpot

Périmètre couvert : vue Joueur, vue Gérant, vue Super Admin, Landing page.
Recherche exhaustive (lecture complète des pages + grep ciblé), pas un
sondage partiel.

**Légende classification :**
- **A** — Valeur codée en dur en JSX/état local, jamais liée à Supabase.
- **B** — Vrai appel Supabase, mais un *fallback* remplace silencieusement
  une donnée manquante par une valeur qui a l'air réelle (sans le signaler
  à l'utilisateur).
- **C** — Témoignage/nom/avis fabriqué, non lié à un vrai profil/avis.
- **D** — UI construite pour une fonctionnalité dont le calcul backend
  n'existe nulle part (colonne/agrégation jamais faite) — pas un mock au
  sens strict, plutôt une feature à moitié câblée.

---

## ✅ Déjà traité cette session (backend écrit, migration prête, prompt frontend fourni)

| # | Écran | Donnée | Cause | Fichiers |
|---|---|---|---|---|
| 1 | Mon Profil (joueur) | Matchs/heures/dépenses codés en dur, rang "VIP Or" figé | A | `20260802200000_joueur_profile_stats.sql`, `20260802220000_loyalty_tiers.sql`, `PROMPT_FIX_JOUEUR_PROFILE_MOCK_STATS.md`, `PROMPT_LOYALTY_TIERS.md` |
| 2 | Mon Profil (joueur) | Sauvegarde du profil ne persiste rien ; téléphone jamais pré-rempli | A | même prompt que #1 (RLS déjà correcte, 100% frontend) |
| 3 | Utilisateurs (admin) | URL avatar Google affichée en texte brut | A | **déjà corrigé par le front pendant cette session** (vérifié) |
| 4 | Utilisateurs (admin) | `totalDepenses` = NaN silencieux (`fetchJoueurs` ne calculait pas dépenses/réservations) | D→corrigé | **déjà corrigé par le front pendant cette session** (vérifié) |
| 5 | Mes Favoris (joueur) | Favoris = en fait "top terrains plateforme", pas de vraie table ; note 4.9★ et "34 réservations" codés en dur | A | `20260802230000_favoris_and_reservations_count.sql`, `PROMPT_REAL_FAVORIS_FRONTEND.md` |
| 6 | Inscription | Option "Autre" quartier enregistre littéralement "Autre" | A | `20260802210000_quartier_personnalise_fix.sql`, `PROMPT_QUARTIER_AUTRE_FRONTEND.md` |
| 7 | Réservation, étape Créneau | Image terrain cassée (URL signée expirée écrite en dur) | — | `PROMPT_FIX_BOOKING_FLOW_TERRAIN_IMAGE.md` (déjà en grande partie corrigé ailleurs) |
| 8 | Stats gérant | Filtre période figé Semaine/Mois/3 mois | — | `20260802180000_unified_period_filter.sql`, `PROMPT_UNIFIED_PERIOD_FILTER_FRONTEND.md` |
| 9 | Réservation, créneaux | Créneaux gérant non configurables, pas de génération auto | — | `20260802190000_terrain_horaires_and_overlap_fix.sql`, `PROMPT_TERRAIN_HORAIRES_FRONTEND.md` |
| 10 | Landing page | Cartes "Terrains Populaires" + stats hero 100% codées en dur | A | `PROMPT_LANDING_REAL_TERRAINS.md` (écrit lors d'une session antérieure, backend déjà en place : `get_terrains_populaires`, `stats_plateforme_cache`) — **toujours pas appliqué côté front à ce jour** |

---

## 🆕 Nouveaux trouvés dans cet audit — aucun correctif écrit, en attente de validation

### Vue Gérant

| # | Fichier:ligne | Donnée actuelle | Classification |
|---|---|---|---|
| 11 | `GerantVisibilityBoost.jsx:43` | `socialProofCount = 14` codé en dur → *"14 gérants à Dakar boostent leurs terrains cette semaine"* | A |
| 12 | `GerantVisibilityBoost.jsx:76` | "Estimation des vues bonus" = formule linéaire arbitraire (~100 vues/1000 FCFA), présentée comme *"l'algorithme d'exposition prioritaire"* | A |
| 13 | `components/QuotaLimitBanner.jsx:48` | *"conserver 92% de vos ventes"* codé en dur dans le texte, pas dérivé du vrai `commission_rate` du plan Starter | A |
| 14 | `services/subscriptions.js:40-45` (`fetchAllPlanLimits`) | Si erreur Supabase → bascule silencieuse sur une grille de prix figée (Free/Starter/Pro/Entreprise), affichée dans `GerantTarifs.jsx` sans aucune indication que c'est une donnée de secours | B |
| 15 | `services/stats.js:51-86` (`fetchOccupationByQuartier`) | Taux d'occupation **explicitement "simulé"** (commentaire du code lui-même) — formule synthétique, pas un vrai taux d'occupation. Consommé par `OccupationChart.jsx`, qui affiche en plus un badge **"Live"** à côté | B — trompeur |
| 16 | `GerantDashboard.jsx:154,612,616,620` | Fallback prix `15000` FCFA si `terrain.price` absent, utilisé pour calculer un "gain net" affiché au gérant | B (mineur) |
| 17 | `GerantTarifs.jsx:300,304` | *"Essai 30 jours gratuit"*, *"Annulable sous 7 jours"* — affirmations non vérifiées contre une vraie donnée d'essai/abonnement | A (mineur, copy marketing) |

### Vue Joueur

| # | Fichier:ligne | Donnée actuelle | Classification |
|---|---|---|---|
| 18 | `JoueurHome.jsx:100` | Badge **"Joueur VIP 🥇"** codé en dur pour tout le monde — **doublon non câblé** du vrai système `loyalty_tiers` déjà construit cette session (#1) | A/D |
| 19 | `JoueurHome.jsx:105` | *"Rejoins plus de 5000 joueurs actifs"* — chiffre plateforme inventé, aucune table ne le calcule | A |
| 20 | `BookingFlow.jsx:392,461-462` | Le ticket PDF/PNG téléchargeable affiche toujours la date fixe **"15 Mai 2026"** au lieu de la vraie date de réservation — commentaire du code l'admet (*"Pour l'instant, c'est la date de démo"*) | A — **vrai bug utilisateur, pas juste cosmétique démo** |
| 21 | `BookingFlow.jsx:280-281` (`handlePaymentConfirm`) | `date_slot = new Date()` codé en dur au lieu de `selectedDate` — chemin possiblement mort (l'étape 3 semble être passée à `<ChoixPaiement>` à la place) — **à confirmer avant d'y toucher, pas à supprimer aveuglément** | A (statut incertain) |

### Vue Super Admin

| # | Fichier:ligne | Donnée actuelle | Classification |
|---|---|---|---|
| 22 | `admin/AdminUsers.jsx` vs `pages/Utilisateurs.jsx` | Deux UI de gestion des utilisateurs **parallèles et distinctes**, fonctionnalités différentes (l'une fait révélation RGPD + reset accès, l'autre les stats/profils) — pas un mock, mais une duplication structurelle à trancher | — décision produit |
| 23 | `admin/AdminSubscriptions.jsx:126` | Si `commissionSummary.taux_commission` est vide → affiche silencieusement "10%" comme si c'était le vrai taux configuré | B |
| 24 | `pages/Gerants.jsx:75-79,369,373,377` | Affiche `g.revenus`, `g.note`, `reservations` par gérant — **mais `fetchGerants()` ne calcule jamais ces champs** (contrairement à `fetchJoueurs()` qui le fait bien pour les joueurs) → toujours vide/tiret, feature jamais terminée côté back | D |
| 25 | `Landing.jsx:968-1023` | Section témoignages : **3 avis entièrement fabriqués** ("Moussa Diop", "Ibrahima Fall — Gérant, Arena Plateau" qui affirme *"mes revenus ont augmenté de 30%"*, "Fatou Sow") — noms, photos-initiales et chiffres inventés, aucun lien avec un vrai profil/avis | C |
| 26 | `Landing.jsx:944` | Dans le rendu **déjà réel** de `get_terrains_populaires` (nouveau code, postérieur au prompt landing existant) : si un vrai terrain n'a pas de note → fallback silencieux sur **"5.0"** (note parfaite fictive) au lieu d'un état "Nouveau"/pas encore noté | B |
| 27 | `Landing.jsx:953` | Même rendu : si `price` est vide → fallback silencieux sur **"15 000 FCFA"** | B |
| 28 | `Landing.jsx:767-768,803-804,866` | Mockups illustratifs "comment ça marche" avec chiffres fictifs ("Revenus de la semaine : 425 000 FCFA · +18%"), réutilisant le nom fictif "Arena Plateau" — priorité basse (illustration, pas une stat revendiquée) | A |

---

## Décisions produit nécessaires avant correction (par construction du CHANTIER, pas de ma part)

1. **Bannière "Offre Flash — Promotion Ramadan -20%"** (`JoueurHome.jsx:124-126`) — aucune mécanique de promo/code promo n'existe nulle part dans le schéma. Vrai système de promos configurables par un admin, ou simplement retirer la bannière tant que ce n'est pas développé ?
2. **Témoignages Landing (#25)** — vrais témoignages à collecter, ou section à retirer tant qu'il n'y en a pas ?
3. **`Gerants.jsx` revenus/note/réservations (#24)** — feature à terminer (ajouter l'agrégation manquante, sur le modèle de `fetchJoueurs()`) ou champs à retirer de l'UI tant que non câblés ?
4. **Duplication `AdminUsers.jsx` / `Utilisateurs.jsx` (#22)** — fusionner, ou les deux sont-elles volontairement distinctes (RGPD vs stats) ?
5. **`OccupationChart.jsx` (#15)** — le badge "Live" sur une donnée explicitement "simulée" est trompeur en l'état. Vrai calcul d'occupation à construire (créneaux réservés / créneaux disponibles par quartier, données déjà disponibles), ou retirer le badge "Live" en attendant ?

## Item hors périmètre technique

- **Landing.jsx (#10)** : le prompt frontend existe déjà depuis une session antérieure et le backend est prêt (`get_terrains_populaires`, `stats_plateforme_cache`) — mais **rien n'a encore été appliqué côté front**, ce qui explique pourquoi #26/#27 (nouveaux fallbacks fictifs) existent déjà dans du code qui semble être une tentative partielle d'intégration. À vérifier avec l'agent front où en est ce chantier avant de le rouvrir.

---

## Prochaine étape

Cette liste est fournie pour validation, comme demandé — je n'ai pas encore
écrit de migration ni de prompt frontend pour les points #11 à #28. Dites-moi
lesquels corriger (et les décisions produit ci-dessus) et je prépare le
backend + les prompts dans le même format que le reste de cette session.
