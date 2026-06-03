# AGENT IA SECURITY RULES - Global Guidelines

## 1. TRANSACTIONS FINANCIÈRES (Wave/Orange Money)
1. TOUJOURS vérifier que le montant est > 0 et < limite max définie
2. TOUJOURS valider le numéro de téléphone (format Sénégal +221 ou local)
3. TOUJOURS vérifier l'authentification utilisateur AVANT toute transaction
4. JAMAIS stocker les tokens/credentials en plain text
5. TOUJOURS logger chaque tentative (succès ET échecs)
6. TOUJOURS reverser les transactions en cas d'erreur API

## 2. AUTHENTIFICATION & AUTORISATION
1. TOUJOURS vérifier le JWT/token avant d'accorder l'accès
2. TOUJOURS valider le rôle utilisateur (Joueur/Gérant/Admin) AVANT l'action
3. TOUJOURS vérifier que l'utilisateur a permission sur cette ressource
4. JAMAIS accepter les IDs sans validation
5. TOUJOURS refuser les requêtes sans authentification valide

## 3. DONNÉES SENSIBLES (géolocalisation, infos perso)
1. JAMAIS exposer les coordonnées GPS brutes sans autorisation
2. TOUJOURS filtrer les données selon le rôle utilisateur
3. JAMAIS retourner les emails/téléphones complets sauf pour le propriétaire
4. TOUJOURS chiffrer les données en transit (HTTPS obligatoire)
5. TOUJOURS vérifier RGPD/consentement avant de traiter les données

## 4. BASE DE DONNÉES (Supabase)
1. JAMAIS exécuter de requête directe sans paramètres liés
2. TOUJOURS utiliser les row level security (RLS) policies
3. TOUJOURS valider/sanitizer les inputs (SQL injection)
4. JAMAIS modifier des données sans vérifier l'ownership
5. TOUJOURS utiliser les transactions pour opérations multi-table

## 5. ERREURS & EXCEPTIONS
1. JAMAIS exposer les stack traces aux utilisateurs
2. TOUJOURS logguer les erreurs serveur complet (logs internes)
3. TOUJOURS retourner des messages d'erreur génériques publiquement
4. JAMAIS continuer l'exécution après une erreur critique
5. TOUJOURS implémenter retry logic avec backoff exponentiel

## 6. REQUÊTES API EXTERNES
1. TOUJOURS vérifier le statut HTTP avant de traiter la réponse
2. TOUJOURS définir des timeouts (max 30s)
3. TOUJOURS valider la réponse avant d'utiliser les données
4. JAMAIS faire confiance aux données externes sans validation
5. TOUJOURS logger les appels API (requête + réponse)

## 7. FICHIERS & UPLOADS
1. TOUJOURS vérifier l'extension ET le type MIME
2. JAMAIS stocker les fichiers en locations executable
3. TOUJOURS limiter la taille (max 50MB par défaut)
4. TOUJOURS vérifier l'espace disque avant upload
5. JAMAIS accepter les chemins avec ../ ou chemins absolus

## 8. RATE LIMITING & DDoS
1. TOUJOURS implémenter rate limiting (10 req/minute par défaut)
2. TOUJOURS bloquer les IPs qui dépassent la limite
3. TOUJOURS vérifier les patterns de requête anormales
4. JAMAIS accepter les batch requests sans authentification forte
5. TOUJOURS logger les tentatives suspectes

## 9. LOGGING & AUDIT
1. CHAQUE action critique doit être loggée (qui, quoi, quand, où)
2. TOUJOURS inclure l'user_id dans les logs
3. JAMAIS logguer les mots de passe ou tokens
4. TOUJOURS garder les logs pendant 90 jours minimum
5. TOUJOURS faire des backups des logs de façon sécurisée

## 10. DÉPLOIEMENT & CONFIG
1. JAMAIS utiliser les secrets en variables d'environnement locales
2. TOUJOURS utiliser les secrets managers (Vercel/Railway)
3. JAMAIS déployer du code non-testé en production
4. TOUJOURS vérifier les dépendances pour vulnérabilités
5. TOUJOURS maintenir les logs de déploiement
