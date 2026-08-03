-- ============================================================
-- Fix : "Autre" enregistré littéralement comme quartier joueur
-- ============================================================
-- Bug confirmé sur la base réelle : src/pages/Register.jsx a une liste
-- QUARTIERS incluant l'option 'Autre', mais aucun champ texte n'apparaît
-- pour saisir le vrai nom quand elle est choisie — la chaîne littérale
-- "Autre" part telle quelle dans profiles.quartier via handle_new_user().
-- Un seul compte réellement affecté à ce jour : "Drix" (drixtplc@gmail.com,
-- quartier='Autre', créé 2026-08-02). Vérifié aussi côté terrains.quartier :
-- aucun terrain affecté.
--
-- DÉCISION DE CONCEPTION (le rapport de bug demandait un choix) : on GARDE
-- profiles.quartier comme unique champ affiché partout (aucun autre écran
-- de l'app — filtres gérant, stats démographiques, cartes joueur — n'a
-- besoin d'être modifié : dès que la vraie valeur est dans `quartier`, tout
-- continue de fonctionner sans changement). On ajoute uniquement un
-- booléen de provenance pour retrouver plus tard les quartiers "hors
-- liste officielle" les plus fréquents (utile pour enrichir QUARTIERS
-- dans Register.jsx) — pas une deuxième colonne texte qui obligerait à
-- faire un COALESCE partout où quartier est déjà lu aujourd'hui.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quartier_hors_liste BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.quartier_hors_liste IS
  'true si la valeur de quartier a été saisie librement (option "Autre" à l''inscription) plutôt que choisie dans la liste officielle QUARTIERS (Register.jsx). Sert à repérer les quartiers hors-liste les plus demandés pour enrichir cette liste plus tard : SELECT quartier, COUNT(*) FROM profiles WHERE quartier_hors_liste GROUP BY quartier ORDER BY 2 DESC.';

-- Nettoyage du seul compte affecté à ce jour : "Autre" n'est pas un nom de
-- quartier valide, on ne le garde pas comme s'il en était un (cf. principe
-- déjà appliqué ailleurs dans ce projet : ne jamais laisser une donnée
-- inventée se faire passer pour une vraie). NULL plutôt qu'une valeur
-- inventée — le profil devra être complété par l'utilisateur (cf. prompt
-- frontend pour l'invite "compléter votre quartier" au prochain login,
-- basée sur quartier IS NULL, déjà le signal utilisé pour les comptes
-- Google OAuth qui n'ont jamais eu cette info).
UPDATE public.profiles
SET quartier = NULL, quartier_hors_liste = false
WHERE quartier = 'Autre';

-- ============================================================
-- Vérification post-migration :
-- SELECT id, nom, quartier, quartier_hors_liste FROM public.profiles WHERE nom = 'Drix';
-- -- -> quartier IS NULL, quartier_hors_liste = false
-- SELECT COUNT(*) FROM public.profiles WHERE quartier = 'Autre';
-- -- -> 0
-- ============================================================
