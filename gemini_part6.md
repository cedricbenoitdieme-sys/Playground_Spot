# 🟢 PlaygroundSpot - Rapport d'Audit & Correction d'Authentification (Partie 6)

## 🐛 Analyse du Bug : Pourquoi l'inscription était bloquée en production

L'investigation du code source a permis d'identifier **trois causes majeures** ayant empêché les joueurs et gérants de créer un compte avec succès sur Vercel :

1. **Race Condition sur la Création du Profil (Supabase Trigger vs Frontend)** :
   Lors de l'inscription via `supabase.auth.signUp()`, un trigger Supabase (`handle_new_user`) crée le profil associé en base de données. Cependant, côté frontend, le `UserContext` tentait de récupérer ce profil **immédiatement** via la fonction `getProfile()`. Sur Vercel (environnement de production avec la latence réseau), le frontend allait plus vite que la base de données : le profil n'était pas encore créé, `getProfile` retournait une erreur "NOT FOUND", et le frontend déconnectait de force le nouvel utilisateur (via un `supabase.auth.signOut()`).

2. **Le Fallback d'Insertion corrompait les Rôles et était bloqué par RLS** :
   Dans `UserContext.jsx`, une logique de "fallback" avait été ajoutée pour insérer le profil manuellement en cas d'erreur `NOT_FOUND`. Mais ce fallback **forçait le rôle à 'joueur'** en dur, écrasant ainsi la volonté d'un utilisateur voulant s'inscrire comme 'gerant'. De plus, si l'utilisateur s'inscrivait en tant que Gérant, cette tentative d'insertion manuelle était bloquée par les politiques RLS (`profiles_insert_self` qui exigeait `role = 'joueur'`).

3. **Perte Silencieuse de Données (Téléphone & Quartier)** :
   Le trigger `handle_new_user` dans le schéma de base de données initial insérait bien l'ID, l'email, le nom et le rôle, mais **ignorait complètement** le numéro de téléphone et le quartier (`tel`, `quartier`) passés lors du signup.

---

## 🛠️ Corrections Apportées

| Fichier Modifié | Description de la Correction |
| :--- | :--- |
| `src/context/UserContext.jsx` | Remplacement de l'appel `getProfile()` immédiat par une fonction **`withRetry()`** qui effectue jusqu'à 4 tentatives (avec "backoff exponentiel") pour attendre que le trigger DB ait terminé son travail. Suppression totale du bloc "fallback d'insertion manuel" dangereux qui outrepassait les RLS et écrasait le rôle "gérant". |
| `src/pages/Login.jsx` | Intégration de `withRetry()` lors de la récupération immédiate du profil post-connexion, assurant une connexion robuste sans erreur fantôme liée à un retard réseau. |
| `supabase/schema.sql` | Mise à jour du trigger PostgreSQL `handle_new_user` pour extraire les champs `tel` et `quartier` directement depuis les `raw_user_meta_data`. Ajout d'une clause `ON CONFLICT DO UPDATE` pour parer à tout dédoublement. |
| `supabase/migrations/0019_fix_auth_trigger_and_rls.sql` | Création d'une migration SQL dédiée pour mettre à jour la base de données de production avec le nouveau trigger corrigé, sans perturber les données existantes. |

---

## 🔄 Le Nouveau Flux d'Authentification

1. **Inscription (`Register.jsx`)** : L'utilisateur remplit le formulaire et choisit son rôle (Joueur ou Gérant). L'appel natif `supabase.auth.signUp()` est déclenché. Le numéro de téléphone et le quartier sont envoyés de manière sécurisée via l'objet `user_metadata`.
2. **Création Côté Serveur (Trigger)** : Le trigger Supabase `handle_new_user` intercepte la création dans `auth.users` et insère **immédiatement et de façon fiable** le profil complet avec toutes les informations, en contournant proprement le RLS de manière sécurisée (`SECURITY DEFINER`).
3. **Synchronisation Frontend (`UserContext`)** : Le listener `onAuthStateChange` détecte la nouvelle session. Il utilise la fonction `withRetry` pour poller la base de données. Dès que le trigger a terminé, le profil complet est chargé sans erreur.
4. **Redirection (App.jsx)** : Selon le rôle retourné, le composant `<ProtectedRoute>` laisse passer l'utilisateur vers `joueur-home` (Joueur) ou `gerant-dashboard` (Gérant), sans erreur de permissions.

---

## 🌐 Configuration Vercel & Railway

Le backend Railway n'est **absolument pas requis pour l'inscription**, qui repose à 100% sur Supabase Auth natif. Cependant, certaines URL d'API (comme les webhooks UnitechPay ou les paramètres) pointaient encore vers `http://localhost:3000`.

Pour que l'ensemble de l'application fonctionne parfaitement sur Vercel, voici les **Variables d'Environnement** strictes à configurer dans les réglages de votre projet Vercel :

```env
# Authentification et Accès BDD (Frontend)
VITE_SUPABASE_URL=https://[VOTRE_PROJET].supabase.co
VITE_SUPABASE_ANON_KEY=ey...

# API Base URL (Frontend) -> À configurer avec le domaine de prod
VITE_API_URL=https://playground-spot-qv2n.vercel.app

# Accès Privilégié BDD (Pour l'API / Backend Vercel)
SUPABASE_URL=https://[VOTRE_PROJET].supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...
```

**⚠️ Important :** N'oubliez pas d'exécuter la migration SQL `0019_fix_auth_trigger_and_rls.sql` via votre éditeur SQL Supabase pour que les corrections côté base de données soient actives en production.
