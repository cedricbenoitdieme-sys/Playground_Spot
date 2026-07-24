# Audit des données fictives — PlaygroundSpot

Audit exécuté en lecture seule le 2026-07-21 contre le projet Supabase `ahqtcgxrewrfbowblygu` via `scratch/audit-seed-data.js` (clé service_role, contourne RLS pour voir l'état réel de chaque table).

## Critère d'identification

Toutes les données de `supabase/seed.sql` utilisent des **UUID fixes et reconnaissables**, jamais générés par `gen_random_uuid()`/`uuid_generate_v4()` :
- Profils admin : `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`
- Profils gérants : `b0eebc99-9c0b-4ef8-bb6d-6bb9bd380aXX`
- Profils joueurs : `c0eebc99-9c0b-4ef8-bb6d-6bb9bd380aXX` / `...380bXX`
- Terrains : `d0eebc99-9c0b-4ef8-bb6d-6bb9bd380cXX`
- Créneaux : `e0eebc99-9c0b-4ef8-bb6d-6bb9bd380dXX`
- Réservations : `f0eebc99-9c0b-4ef8-bb6d-6bb9bd380eXX`

Le préfixe commun `9c0b-4ef8-bb6d-6bb9bd38...` sur toutes les lignes est la signature du script de seed — un UUID généré aléatoirement ne partage jamais un tel préfixe entre plusieurs lignes. **C'est le critère le plus fiable** (bien plus précis qu'un pattern sur l'email, puisque le seed utilise volontairement des emails réalistes type `fatou.ndiaye@gmail.com`, indiscernables d'un vrai compte par simple lecture).

## Résultat par table (état constaté le 2026-07-21)

| Table | Total | Dont seed | Dont réel | Détail |
|---|---|---|---|---|
| `profiles` | 14 | 13 | 1 | Seul `cedricbenoitdieme@gmail.com` (admin) est réel. **Les 13 profils seed sont déjà orphelins** : aucune ligne correspondante dans `auth.users` (voir constat urgent ci-dessus) — ils ne peuvent déjà plus se connecter, mais polluent toujours les jointures (`terrains.gerant_id`, `reservations.joueur_id`, etc.) |
| `terrains` | 6 | 6 | **0** | **100% des terrains actuels sont du seed.** Aucun vrai gérant n'a encore ajouté de terrain réel. |
| `reservations` | 5 | 5 | 0 | Toutes liées à un terrain et un joueur seed |
| `paiements` | 3 | 3 | 0 | Toutes liées à une réservation seed |
| `avis` | 1 | 1 | 0 | Liée à la réservation seed `f0eebc99-...e33` |
| `terrain_amenities` | 12 | 12 | 0 | |
| `gerant_terrains` | 6 | 6 | 0 | |
| `creneaux` | 8 | 8 | 0 | |
| `tickets` | 4 | 4 | 0 | Générés lors de tests de scan de billets sur les réservations seed |
| `abonnements` | 0 | — | — | Table vide (module abonnements pas encore utilisé en réel) |
| `scan_logs` | 0 | — | — | Vide |
| `webhook_logs` | 0 | — | — | Vide |
| `chat_messages` | 0 | — | — | Vide |
| `audit_logs` | 3 | 3 (indirect) | 0 | 3 entrées `admin_reveal_user_contact` générées par mes propres tests de RPC cette session (pas du seed.sql à proprement parler, mais du bruit de test à nettoyer aussi) |
| `system_settings` | 2 | 0 | 2 | `mode_maintenance`, `commission_plateforme` — config légitime, **à conserver** |

## Conclusion

**Il n'existe aujourd'hui aucune vraie donnée métier dans cette base** en dehors d'un seul compte admin réel (`cedricbenoitdieme@gmail.com`). Tout le reste — terrains, gérants, joueurs, réservations, paiements, avis, tickets — est soit du seed, soit du bruit de test généré pendant le développement (audit_logs). C'est en réalité le **meilleur moment possible** pour nettoyer : un `TRUNCATE`/`DELETE` ciblé ne fera perdre aucune vraie donnée de production, puisqu'il n'y en a pas encore.

Voir `supabase/cleanup_seed_data.sql` pour le script (dry-run par défaut) et `supabase/PROD_READINESS_CHECKLIST.md` pour la suite (RLS, clés, webhooks).

## Nettoyage effectué (2026-07-22)

`cleanup_seed_data.sql` a été exécuté en mode réel (`v_dry_run := false`) sur le projet `ahqtcgxrewrfbowblygu` et vérifié par re-comptage : toutes les tables (`tickets`, `avis`, `paiements`, `reservations`, `creneaux`, `terrain_amenities`, `gerant_terrains`, `terrains`, `audit_logs` de test, `profiles`) sont retombées à **0** ligne seed. Il ne reste plus que le compte admin réel `cedricbenoitdieme@gmail.com` dans `profiles`, et aucune autre donnée métier. La base est propre — reste à traiter le reste de `PROD_READINESS_CHECKLIST.md` (webhook UnitechPay, `VITE_API_URL`, confirmation d'environnement) avant l'ouverture réelle.
