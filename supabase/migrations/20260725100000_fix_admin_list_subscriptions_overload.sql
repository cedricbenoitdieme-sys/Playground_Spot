-- ============================================================
-- Fix : onglet Abonnements du Super Admin Dashboard en erreur
-- ("Une erreur inattendue s'est produite")
--
-- Cause racine : la migration 20260722150000 a remplacé
-- `admin_list_subscriptions(statut_abonnement, ...)` par
-- `admin_list_subscriptions(statut_abonnement_gerant, ...)` et est censée
-- avoir supprimé les anciens objets (`abonnements`, `abonnement_paliers`,
-- le type `statut_abonnement`) via DROP ... CASCADE. En prod, ces anciens
-- objets sont pourtant toujours présents (table `abonnements` vide mais
-- existante) : la migration 20260721120000 a dû être ré-appliquée après
-- coup (ex: re-run manuel dans le SQL Editor), recréant l'ancienne
-- fonction `admin_list_subscriptions(statut_abonnement, ...)` en plus de
-- la nouvelle.
--
-- Conséquence : PostgREST voit DEUX fonctions `admin_list_subscriptions`
-- avec des types de premier paramètre différents et ne peut pas choisir
-- (erreur PGRST203 "Could not choose the best candidate function"), donc
-- CHAQUE appel RPC échoue avant même d'exécuter le moindre SQL métier —
-- confirmé en appelant la RPC en direct via REST (curl + service_role) :
-- PGRST203 systématique, peu importe les paramètres.
--
-- Ce message PGRST203 ne correspond à aucun des codes gérés explicitement
-- par src/lib/errorHandler.js (PGRST301, 42501, PGRST116, 23514/23505...),
-- il retombe donc sur le message générique SERVER_ERROR affiché à l'écran.
-- ============================================================

-- Supprime explicitement l'ancienne signature (au cas où le type
-- statut_abonnement aurait déjà été supprimé sans emporter la fonction
-- avec lui, ex: DROP TYPE sans CASCADE effectif lors d'un run partiel).
DROP FUNCTION IF EXISTS public.admin_list_subscriptions(public.statut_abonnement, TEXT, INT, INT);

-- Nettoyage des objets orphelins de l'ancien système d'abonnement
-- (remplacés par public.subscriptions / public.plan_limits depuis
-- 20260722150000). CASCADE ici supprime aussi l'ancienne fonction
-- ci-dessus si elle dépendait encore du type.
DROP TABLE IF EXISTS public.abonnements CASCADE;
DROP TABLE IF EXISTS public.abonnement_paliers CASCADE;
DROP TYPE IF EXISTS public.statut_abonnement CASCADE;

-- Garde-fou : si jamais admin_get_commission_summary avait aussi été
-- dupliquée par le même incident de ré-application, on s'assure qu'il
-- n'existe qu'une seule signature (date_debut DATE, date_fin DATE).
-- (Pas de DROP nécessaire ici : cette fonction n'a qu'une seule
-- définition dans les deux migrations, donc pas d'ambiguïté possible —
-- vérifié par lecture des deux fichiers de migration. Commentaire laissé
-- pour documenter que le cas a été considéré.)

-- Vérification post-migration (à exécuter manuellement si besoin) :
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'admin_list_subscriptions';
-- -> doit renvoyer EXACTEMENT une ligne.
