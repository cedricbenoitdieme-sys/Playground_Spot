# Audit de Sécurité - Application Web "Vibe-Codée"

Tu effectues un audit de sécurité complet d'une application web vibe-codée. "Vibe-codée" signifie que cette application a été principalement construite en utilisant des assistants de code IA comme Claude, Cursor, Copilot, ou des outils similaires. Ces outils produisent du code fonctionnel rapidement mais introduisent régulièrement des failles de sécurité qu'un développeur humain détecterait habituellement.
Ton travail est de trouver chacune de ces failles.

## Méthodologie

### PASSE 1 — DÉCOUVERTE
Lis l'intégralité de la base de code avant de produire des conclusions. Construis un modèle mental de l'architecture : framework, base de données, fournisseur d'authentification, couche API, configuration de déploiement. Identifie chaque point d'entrée (pages, routes API, actions serveur, webhooks, tâches cron). Trace le flux de données depuis l'entrée utilisateur jusqu'à la base de données et retour.

### PASSE 2 — AUDIT SYSTÉMATIQUE
Parcours chaque section de la checklist ci-dessous. Pour chaque élément de la checklist, fais l'une de ces trois choses :
*   ✅ **PASSE** — La base de code gère cela correctement. Cite le fichier/ligne.
*   ❌ **ÉCHOUE** — Une vulnérabilité existe. Documente-la complètement (voir format).
*   ⚠️ **PARTIEL** — Une couverture partielle mais des lacunes subsistent. Explique ce qui manque.
*   ⬚ **N/A** — Non applicable à cette base de code. Indique brièvement pourquoi.

Ne saute aucun élément. Ne résume pas des groupes d'éléments ensemble. Chaque élément de la checklist reçoit son propre verdict explicite.

---

## Format de Sortie

Pour chaque conclusion ❌ **ÉCHOUE**, utilise exactement cette structure :

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #[numero]                                    │
├──────────┬──────────────────────────────────────────────┤
│ Severite │ CRITIQUE / HAUTE / MOYENNE / BASSE           │
│ Categorie│ ex., Exposition de Secret, RLS Manquant, etc.│
│ Emplacement│ chemin/fichier.ts:numero_ligne             │
│ CWE      │ CWE-XXX (Nom)                               │
├──────────┴──────────────────────────────────────────────┤
│ Ce qui ne va pas :                                      │
│ [Description en langage clair de la vulnerabilite]      │
│                                                         │
│ Pourquoi c'est important :                              │
│ [Ce qu'un attaquant pourrait reellement faire avec ca]  │
│                                                         │
│ Le code vulnerable :                                    │
│                                                     │ │ [extrait de code exact]                                 │ │                                                     │
│                                                         │
│ La correction :                                         │
│                                                     │ │ [extrait de code corrige, pret a copier/coller]         │ │                                                     │
│                                                         │
│ Effort : ~[X] minutes                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Checklist d'Audit

### Section 1 : Variables d'Environnement et Gestion des Secrets
Cherche dans chaque fichier de la base de code chacun des éléments suivants. Cela inclut les fichiers source, les fichiers de configuration, les scripts, et tout fichier .env qui aurait pu être commité dans le dépôt.
*   **1.1 — Secrets codés en dur** : Cherche les clés API, tokens, mots de passe, chaînes de connexion, et URLs de webhook intégrés directement dans le code source. Patterns courants à rechercher avec grep :
    `sk_live_`, `sk_test_`, `sk-`, `pk_live_`, `Bearer`, `eyJ` (préfixe base64 JWT), `ghp_`, `gho_`, `github_pat_`, `xoxb-`, `xoxp-` (tokens Slack), `AKIA` (clés d'accès AWS), toute chaîne alphanumérique de 32+ caractères entre guillemets.
*   **1.2 — Couverture .gitignore** : Vérifie que `.env`, `.env.local`, `.env.production`, et `.env*.local` sont tous dans `.gitignore`. Vérifie l'historique git pour tout fichier `.env` précédemment commité (même s'il a été supprimé depuis, les secrets dans l'historique git sont toujours exposés).
*   **1.3 — Fuites de préfixe public** : Vérifie que les secrets réservés au serveur N'UTILISENT PAS les préfixes publics des frameworks. Dans Next.js, tout ce qui a `NEXT_PUBLIC_` est intégré dans le JavaScript client et visible par n'importe qui. Dans Vite, le préfixe est `VITE_`. Dans Create React App, c'est `REACT_APP_`. Les clés qui ne doivent JAMAIS avoir de préfixe public incluent :
    *   Clés de rôle service de base de données
    *   Clés secrètes Stripe
    *   Clés API OpenAI / Anthropic
    *   Identifiants SMTP
    *   Toute clé qui donne un accès en écriture/administrateur
*   **1.4 — Fuites dans la console/erreurs** : Cherche les `console.log`, `console.error`, et les composants de frontière d'erreur qui pourraient afficher des variables d'environnement ou des secrets dans la console du navigateur ou dans des messages d'erreur visibles par le client.
*   **1.5 — Exposition des artefacts de build** : Vérifie si les source maps sont activées en production (`productionBrowserSourceMaps` dans `next.config.js`, config sourcemap de vite, etc). Les source maps permettent à n'importe qui de reconstituer ton code source original incluant tout secret intégré.
*   **1.6 — Validation au démarrage** : Vérifie que l'app échoue rapidement si des variables d'environnement requises sont manquantes, plutôt que de tourner silencieusement avec des valeurs indéfinies (ce qui cause souvent des erreurs runtime cryptiques ou, pire, un repli sur des valeurs par défaut non sécurisées).

### Section 2 : Sécurité de la Base de Données
Si l'app utilise Supabase, Firebase, ou toute base de données avec un accès côté client, cette section est critique. Si elle utilise une base de données traditionnelle côté serveur uniquement (ex., Prisma avec PostgreSQL, pas de SDK côté client), adapte les vérifications en conséquence et note l'architecture.
*   **2.1 — RLS activé** : Vérifie que le Row Level Security est activé sur CHAQUE table dans le schéma public. Vérifie s'il y a des tables créées via des migrations ou l'éditeur SQL qui auraient pu être manquées. Une seule table non protégée expose toutes ses données à quiconque possède la clé anon.
*   **2.2 — Les policies RLS existent** : Une table avec le RLS activé mais AUCUNE policy retourne silencieusement des résultats vides pour toutes les requêtes. Ça ressemble à un bug, pas à un problème de sécurité, et c'est une erreur courante de l'IA. Vérifie que chaque table avec RLS activé a au moins des policies SELECT et INSERT.
*   **2.3 — Clauses WITH CHECK** : Vérifie que toutes les policies INSERT et UPDATE incluent des clauses WITH CHECK. Sans WITH CHECK sur INSERT, un utilisateur peut insérer des lignes avec n'importe quel `user_id` (usurpation d'identité d'autres utilisateurs). Sans WITH CHECK sur UPDATE, un utilisateur peut changer le `user_id` d'une ligne pour voler la propriété.
*   **2.4 — Source d'identité des policies** : Assure-toi que les policies RLS utilisent `auth.uid()` pour l'identité, PAS `auth.jwt()->'user_metadata'`. Les métadonnées utilisateur peuvent être modifiées par les utilisateurs finaux authentifiés, ce qui en fait une source d'identité non fiable.
*   **2.5 — Isolation de la clé service_role** : La clé `service_role` contourne tout le RLS. Vérifie qu'elle n'est JAMAIS utilisée dans le code côté client, jamais importée dans les composants, et utilisée uniquement dans le code côté serveur où le contournement du RLS est véritablement nécessaire (opérations admin, webhooks).
*   **2.6 — Policies des buckets de stockage** : Si Supabase Storage est utilisé, vérifie que les buckets de stockage ont des policies RLS. Par défaut, les buckets de stockage sont accessibles publiquement.
*   **2.7 — Injection SQL** : Vérifie s'il y a des requêtes SQL brutes utilisant la concaténation de chaînes ou des template literals au lieu de requêtes paramétrées. La librairie client Supabase est sécurisée par défaut, mais les appels bruts `.rpc()` ou les requêtes pg/postgres.js peuvent ne pas l'être.
*   **2.8 — Fonctions SECURITY DEFINER** : Vérifie s'il y a des fonctions de base de données marquées SECURITY DEFINER. Celles-ci s'exécutent avec les privilèges du créateur de la fonction (généralement superuser), pas de l'utilisateur appelant. Vérifie qu'elles n'exposent pas de données et ne contournent pas le RLS.

### Section 3 : Authentification et Gestion des Sessions
*   **3.1 — Le middleware d'auth existe** : Vérifie que le middleware d'authentification (ex., middleware.ts de Next.js, middleware Express, etc.) existe et s'exécute sur les routes protégées. Vérifie la configuration du matcher pour s'assurer qu'il couvre tous les chemins nécessaires.
*   **3.2 — Routage par défaut en refus** : Vérifie si le middleware protège les routes par défaut (liste blanche de routes publiques) vs. protection par exception (liste noire de routes protégées). Le refus par défaut (liste blanche) est significativement plus sûr parce que les nouvelles routes sont automatiquement protégées.
*   **3.3 — getUser() vs getSession()** : Pour les apps Supabase, vérifie que les opérations côté serveur sensibles à la sécurité utilisent `supabase.auth.getUser()` (qui valide le JWT auprès des serveurs Supabase) plutôt que `supabase.auth.getSession()` (qui lit seulement le JWT local sans vérification).
*   **3.4 — Gestionnaire de callback auth** : Vérifie que la route `/auth/callback` (ou équivalent) échange correctement les codes d'auth pour des sessions, gère les erreurs de manière élégante, et n'expose pas les tokens dans les URLs ou les logs.
*   **3.5 — Stockage de session** : Vérifie que les tokens de session sont stockés dans des cookies `httpOnly`, PAS dans `localStorage` ou `sessionStorage` (qui sont accessibles par tout JavaScript sur la page, incluant les charges XSS).
*   **3.6 — Routes API protégées** : Vérifie que CHAQUE route API gérant des données utilisateur vérifie l'authentification avant le traitement. Cherche les routes API qui sautent complètement la vérification d'auth, surtout celles que l'IA a pu ajouter plus tard dans le développement.
*   **3.7 — Sécurité OAuth** : Si OAuth est implémenté, vérifie que les URLs de callback sont validées, que les paramètres `state` sont utilisés pour la protection CSRF, et que les tokens sont gérés de manière sécurisée.
*   **3.8 — Flux de réinitialisation de mot de passe** : Si applicable, vérifie que les tokens de réinitialisation expirent, sont à usage unique, et sont transmis de manière sécurisée.

### Section 4 : Validation Côté Serveur
*   **4.1 — Validation par schéma** : Vérifie que toutes les routes API et actions serveur valident les entrées en utilisant une librairie de validation par schéma (Zod, Yup, Valibot, ArkType, etc.) côté serveur. La validation frontend est de l'UX, pas de la sécurité. Chaque entrée doit être re-vérifiée côté serveur.
*   **4.2 — Identité depuis la session** : Vérifie que l'identité de l'utilisateur pour les opérations d'écriture est TOUJOURS dérivée de la session authentifiée ou du token JWT, jamais des champs du corps de la requête comme `{ userId: "..." }`. Un attaquant peut envoyer n'importe quel `userId` dans un corps de requête.
*   **4.3 — Nettoyage des entrées** : Vérifie que le contenu généré par l'utilisateur et rendu en HTML est correctement nettoyé pour prévenir le Cross-Site Scripting (XSS). Cherche `dangerouslySetInnerHTML`, `v-html`, `[innerHTML]`, ou les template literals non échappés qui rendent du contenu utilisateur.
*   **4.4 — Application des méthodes HTTP** : Vérifie que les opérations qui modifient l'état utilisent `POST/PUT/PATCH/DELETE`, pas `GET`. Les requêtes `GET` peuvent être déclenchées par des balises image, le prefetching de liens, et les extensions de navigateur sans intention de l'utilisateur.
*   **4.5 — Fuites d'informations dans les erreurs** : Vérifie que les réponses d'erreur ne fuient pas de détails internes (traces de pile, erreurs SQL, chemins de fichiers, noms de variables d'environnement) vers le client. Vérifie à la fois les routes API et les composants de frontière d'erreur.
*   **4.6 — Vérification de signature de webhook** : Si l'app reçoit des webhooks (Stripe, GitHub, etc.), vérifie qu'elle valide la signature du webhook avant le traitement. Sans vérification, n'importe qui peut envoyer de faux événements webhook à ton endpoint.

### Section 5 : Sécurité des Dépendances et Packages
*   **5.1 — Résultats d'audit** : Lance la commande d'audit du gestionnaire de packages (`npm audit`, `pnpm audit`, `yarn audit`, `bun audit`) et rapporte toutes les vulnérabilités trouvées, groupées par sévérité.
*   **5.2 — Packages hallucinés** : Vérifie s'il y a des packages installés avec des nombres de téléchargements anormalement bas, des dates de publication très récentes, ou des noms qui ne correspondent pas à des packages bien connus. Les outils IA hallucinent parfois des noms de packages, et les attaquants publient des malwares sous ces noms.
*   **5.3 — Lockfile commité** : Vérifie qu'un lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`) est commité dans le dépôt. Sans lui, `npm install` peut silencieusement télécharger des versions différentes (potentiellement compromises).
*   **5.4 — Packages obsolètes** : Vérifie s'il y a des packages obsolètes, surtout ceux avec des CVE connues. Porte une attention particulière aux librairies d'auth, aux librairies crypto, et aux versions de framework.
*   **5.5 — Dépendances inutilisées** : L'IA a tendance à installer des packages qu'elle n'utilise finalement pas. Chaque package inutilisé est une surface d'attaque inutile. Vérifie s'il y a des packages dans `package.json` qui ne sont importés nulle part dans la base de code.

### Section 6 : Limitation de Débit (Rate Limiting)
*   **6.1 — Opérations coûteuses** : Identifie toutes les routes API qui appellent des APIs externes payantes (OpenAI, Anthropic, Stripe, fournisseurs email/SMS, etc.) et vérifie qu'elles ont une limitation de débit. Sans elle, un attaquant peut spammer l'endpoint et faire exploser une facture massive sur le compte du développeur.
*   **6.2 — Endpoints d'auth** : Vérifie que les endpoints de connexion, inscription, réinitialisation de mot de passe, et OTP ont une limitation de débit pour prévenir les attaques par force brute et le bourrage d'identifiants.
*   **6.3 — Vérification de l'implémentation** : Si la limitation de débit existe, vérifie qu'elle est appliquée côté serveur (pas juste un debouncing frontend) et utilise un stockage fiable (Redis, Upstash, ou similaire) plutôt qu'un stockage en mémoire qui se réinitialise au déploiement.

### Section 7 : Configuration CORS
*   **7.1 — CORS des routes API** : Si l'app expose des routes API destinées uniquement à son propre frontend, vérifie que les en-têtes CORS restreignent l'accès au(x) propre(s) domaine(s) de l'app. Cherche `Access-Control-Allow-Origin: *` sur les endpoints sensibles.
*   **7.2 — Mode credentials** : Si le CORS est configuré, vérifie que `Access-Control-Allow-Credentials` est à `true` uniquement lorsqu'il est associé à des origines spécifiques (pas un joker).

### Section 8 : Sécurité des Téléchargements de Fichiers
*   **8.1 — Validation côté serveur** : Si l'app gère les téléchargements de fichiers, vérifie que le type et la taille du fichier sont valides sur le serveur, pas juste le frontend. Vérifie le type MIME, pas juste l'extension du fichier (les utilisateurs peuvent renommer `malware.exe` en `photo.jpg`).
*   **8.2 — Permissions de stockage** : Vérifie que les fichiers téléchargés sont stockés avec des contrôles d'accès appropriés. Les fichiers publics (photos de profil) et les fichiers privés (documents) doivent avoir des politiques différentes.
*   **8.3 — Prévention d'exécution** : Vérifie que les fichiers téléchargés ne peuvent pas être exécutés sur le serveur. Vérifie que les répertoires de téléchargement ne sont pas dans le chemin exécutable de la racine web.

---

## Rapport Final (Structure Attendue)

1.  **Évaluation de la Posture de Sécurité** (avec niveau : 🔴 CRITIQUE, 🟠 A AMÉLIORER, 🟡 ACCEPTABLE, 🟢 SOLIDE et un résumé exécutif).
2.  **Conclusions Critiques et Hautes** (les failles majeures nécessitant une correction urgente).
3.  **Victoires Rapides** (corrections de moins de 10 minutes à fort impact).
4.  **Plan de Remédiation Priorisé** (liste de toutes les vulnérabilités ordonnée par sévérité puis effort).
5.  **Ce qui est Déjà Bien Fait** (les forces de sécurité actuelles).
6.  **Résumé de la Checklist** (une vue d'ensemble compacte type `1.1 ✅ 1.2 ✅ 1.3 ❌ ...`).
