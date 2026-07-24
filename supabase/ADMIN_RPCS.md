# Backend Super Admin Dashboard — Récapitulatif

Migration : `supabase/migrations/20260721120000_super_admin_dashboard.sql`
Route Express complémentaire : `backend/routes/admin.js` (montée sur `/api/admin`)

## Rôle super_admin

`role_utilisateur` n'a qu'un seul rôle pleinement privilégié aujourd'hui : `'admin'`
(bootstrap manuel, un seul compte). Aucune valeur d'enum `super_admin` n'a été
ajoutée — `ALTER TYPE ... ADD VALUE` est quasi irréversible en Postgres et
aurait nécessité de retoucher les ~14 policies RLS déjà basées sur
`get_my_role() = 'admin'`. À la place : `public.is_super_admin()` est un alias
explicite sur ce rôle existant, utilisé par toutes les RPC ci-dessous. Si un
vrai second palier d'admin est introduit plus tard, seul ce helper doit changer.

## RPC créées

| RPC | Paramètres | Retour | Rôle requis |
|---|---|---|---|
| `is_super_admin()` | — | `BOOLEAN` | — (helper interne) |
| `log_admin_action(action, resource_type, resource_id, metadata)` | | `VOID` | — (helper interne, insère dans `audit_logs`) |
| `get_admin_dashboard_stats()` | — | JSON : `terrains_actifs`, `reservations_jour/semaine/mois`, `revenus_commissions_jour/semaine/mois`, `taux_occupation_moyen_30j` | super_admin |
| `admin_list_terrains(p_search, p_zone, p_statut, p_page, p_page_size)` | filtres recherche/zone/statut + pagination | JSON `{items, total_count, page, page_size}` | super_admin |
| `admin_update_terrain_status(p_terrain_id, p_statut)` | | JSON `{success, terrain_id, statut}` | super_admin |
| `mask_email(email)` / `mask_phone(tel)` | | `TEXT` | — (helpers de masquage) |
| `admin_list_users(p_role, p_search, p_statut, p_page, p_page_size)` | | JSON `{items, total_count, ...}` — `email`/`tel` masqués par défaut | super_admin |
| `admin_update_user_role(p_user_id, p_new_role)` | | JSON `{success, user_id, role}` | super_admin |
| `admin_reveal_user_contact(p_user_id)` | | JSON `{user_id, email, tel}` — **non masqué**, action toujours loguée | super_admin |
| `admin_reset_user_access(p_user_id)` | | JSON `{success, user_id, email}` — valide + logue ; l'invalidation réelle se fait via `POST /api/admin/users/:id/reset-access` | super_admin |
| `admin_list_subscriptions(p_statut, p_search, p_page, p_page_size)` | | JSON `{items, total_count, ...}` (jointure `abonnements` + `abonnement_paliers` + `profiles`) | super_admin |
| `admin_get_commission_summary(p_date_debut, p_date_fin)` | défaut : mois en cours | JSON : total, nb_reservations, ventilation par jour | super_admin |
| `admin_list_logs(p_action, p_date_debut, p_date_fin, p_admin_id, p_page, p_page_size)` | | JSON `{items, total_count, ...}` sur `audit_logs` | super_admin |

Toutes les RPC `admin_*`/`get_admin_*` sont `SECURITY DEFINER` et vérifient
`public.is_super_admin()` en première ligne (`RAISE EXCEPTION` sinon) —
aucune ne fait confiance à un rôle envoyé par le client.

## Tables / schéma ajoutés

- `abonnement_paliers` (id, code, nom, prix_mensuel, actif) — 3 paliers seedés (Starter/Pro/Premium).
- `abonnements` (id, gerant_id, palier_id, statut, date_debut, date_fin_essai, prochaine_echeance, dernier_paiement_mode/ref/montant) — un abonnement par gérant (`UNIQUE(gerant_id)`).
- `statut_abonnement` ENUM : `essai | actif | en_retard | expire`.
- `audit_logs.metadata JSONB` (colonne ajoutée sur la table existante, réutilisée comme journal d'audit admin plutôt que dupliquée en `admin_audit_logs`).

## Policies RLS ajoutées/modifiées

- `abonnement_paliers` : lecture publique (authentifiés), écriture super_admin uniquement.
- `abonnements` : lecture super_admin **ou** le gérant propriétaire (`gerant_id = auth.uid()`) ; écriture super_admin uniquement.
- Aucune policy existante modifiée sur `terrains`, `reservations`, `profiles`, `paiements`, `audit_logs` : elles accordent déjà un accès complet au rôle `admin`, qui est le rôle super_admin de cette app.

## Ce qui ne peut pas être fait en SQL pur

`admin_reset_user_access` ne peut valider et **loguer** l'action — invalider une
session ou changer un mot de passe requiert l'Auth Admin API de Supabase (clé
`service_role`), inaccessible depuis PL/pgSQL. `backend/routes/admin.js` fournit
`POST /api/admin/users/:id/reset-access`, qui rejoue exactement le schéma déjà
utilisé par `POST /api/create-gerant` dans `server.js` : re-vérifie le rôle de
l'appelant, appelle la RPC (pour l'audit), puis effectue la rotation du mot de
passe via `supabase.auth.admin.updateUserById`. Note : GoTrue n'expose pas de
méthode "déconnecter cet user_id partout" — la rotation de mot de passe est le
mécanisme documenté pour révoquer l'accès sans détenir le JWT de la cible.

## Simplifications connues (à documenter pour la suite)

- **Masquage** : convention équivalente (premier caractère + domaine pour l'email,
  2 premiers/2 derniers chiffres pour le téléphone), pas une copie du code de
  Sama Boutik — ce dernier vit dans un autre projet/codebase non accessible ici.
- **`nb_photos`** : `terrains` n'a qu'une colonne `image_url` unique aujourd'hui
  (pas de table de galerie), donc `nb_photos` vaut 0 ou 1.
- **Commission** : calculée avec le taux `commission_plateforme` **actuel** de
  `system_settings`, appliqué rétroactivement à l'historique des réservations —
  le taux n'est pas historisé par transaction ailleurs dans le schéma. Si le
  taux change, les résumés de périodes passées se recalculeront avec le
  nouveau taux plutôt que l'ancien.
- **Double log sur le changement de rôle** : `admin_update_user_role` insère une
  entrée `admin_update_user_role` dans `audit_logs` en plus du log générique
  déjà produit par le trigger existant `trg_audit_profiles`
  (action `update_role_utilisateur`) — redondant mais intentionnel, pour que
  `admin_list_logs` puisse filtrer sur un nom d'action admin explicite.
- **Pas de vue matérialisée** pour le dashboard : le volume de données actuel
  ne justifie pas l'ops overhead d'un rafraîchissement planifié (pas de
  `pg_cron` déjà en place dans ce projet) ; `get_admin_dashboard_stats()` est
  une requête agrégée directe sur des colonnes indexées, dans le même style
  que `get_admin_stats()` déjà existant.
