# Google OAuth — Configuration Supabase + Google Cloud Console

Projet Supabase PlaygroundSpot : `https://ahqtcgxrewrfbowblygu.supabase.co`
(projet séparé de Sama Boutik — cette config n'affecte que PlaygroundSpot)

## 1. Google Cloud Console

1. Créer/ouvrir un projet dans [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → OAuth consent screen** : configurer l'écran de consentement (type "External" si les utilisateurs ne sont pas tous dans une org Google Workspace), renseigner nom de l'app, email support, domaine.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** :
   - Type d'application : **Web application**
   - **Authorized JavaScript origins** :
     - `http://localhost:5173` (dev)
     - `https://<votre-domaine-prod>` (⚠️ à remplacer par le vrai domaine Vercel de prod)
   - **Authorized redirect URIs** — **une seule valeur, celle de Supabase, PAS un domaine de l'app** :
     - `https://ahqtcgxrewrfbowblygu.supabase.co/auth/v1/callback`
4. Récupérer le **Client ID** et le **Client Secret** générés.

## 2. Supabase Dashboard

1. **Authentication → Providers → Google** :
   - Activer le toggle.
   - Coller le Client ID et le Client Secret de l'étape précédente.
   - Enregistrer.
2. **Authentication → URL Configuration** :
   - **Site URL** : votre domaine de prod (ou `http://localhost:5173` en dev).
   - **Redirect URLs** : ajouter
     - `http://localhost:5173/**`
     - `https://<votre-domaine-prod>/**`
   (PlaygroundSpot est une SPA à vue unique pilotée par un state React (`view` dans `App.jsx`), pas par des routes réelles — un pattern large `/**` suffit, aucune route de callback dédiée n'est nécessaire.)
3. **Authentication → Providers → (réglages généraux) / Auth Settings** : **ne pas activer** l'option de liaison automatique de comptes par email ("Allow manual linking" / auto-linking) si elle existe dans votre version du dashboard. Décision produit prise pour ce projet : **blocage explicite**, pas de fusion automatique (cf. §4).

## 3. Migration SQL à appliquer

Voir `supabase/migrations/20260721130000_google_oauth_profile_sync.sql` — met à jour le trigger `handle_new_user()` pour extraire `nom` et `avatar` depuis les metadata Google (`full_name`/`name`, `avatar_url`/`picture`), en plus du flow email/password existant. Le rôle par défaut reste `joueur` (déjà le comportement existant).

## 4. Stratégie de fusion / blocage de compte

**Décision : blocage explicite, pas de fusion automatique.**

Si un utilisateur s'est déjà inscrit en email/mot de passe puis tente de se connecter via Google avec le **même email**, Supabase (réglage par défaut, "manual linking" désactivé) refuse de lier automatiquement la nouvelle identité Google à ce compte existant. C'est le comportement voulu : on ne fusionne jamais silencieusement deux identités, ce qui évite le scénario de prise de compte suivant :
- Un attaquant crée un compte email/mot de passe non confirmé avec l'email de la victime.
- Si l'auto-linking était actif, la victime qui se connecte ensuite via Google avec ce même email se retrouverait liée au compte de l'attaquant, qui garde l'accès via le mot de passe qu'il contrôle.

Le frontend (`src/pages/Login.jsx`) intercepte l'erreur renvoyée par Supabase après la redirection Google et affiche : *"Un compte existe déjà avec cet email. Connectez-vous avec votre mot de passe."*

## 5. Sécurité des données Google

Aucun access token / refresh token Google n'est stocké dans le schéma applicatif PlaygroundSpot (`profiles` ou ailleurs) : Supabase Auth (GoTrue) les gère en interne dans `auth.identities`/`auth.sessions`, hors du schéma `public` accessible par l'app. Seules les données de profil publiques (nom, email, avatar) sont copiées dans `public.profiles` par le trigger `handle_new_user()`.

## 6. Test de bout en bout

1. Compte Google avec un email **inconnu** de `profiles` → connexion réussie, nouveau profil créé avec rôle `joueur`, `nom` et `avatar` renseignés depuis Google.
2. Compte Google avec un email **déjà utilisé** par un compte email/mot de passe existant → retour sur la page de login avec le message de blocage explicite, pas de connexion silencieuse.
