-- ============================================================
-- Migration : (1) corrige le système de messagerie humaine existant
-- (chat_messages) plutôt que de le remplacer — décision prise après
-- avoir constaté qu'il fonctionne déjà (temps réel, typing, etc.),
-- seuls deux bugs concrets le cassent côté admin :
--   a) aucune policy RLS UPDATE → marquer un message comme lu échoue
--      silencieusement, pour tout le monde.
--   b) regroupement des conversations dans la boîte de réception admin
--      (bug FRONTEND dans ChatWidget.jsx, cf. prompt séparé — la policy
--      RLS ci-dessous ne suffit pas à corriger ça).
-- (2) construit la base de connaissance + l'infra pour le chatbot IA
-- (aucune IA n'était réellement branchée — le "bot" actuel est un
-- if/else sur mots-clés codé en dur dans ChatWidget.jsx, aucun appel à
-- Gemini/Anthropic/autre nulle part dans le code).
-- ============================================================

-- ── 1a. RLS UPDATE manquante sur chat_messages ──────────────────
-- Seul le destinataire (ou un admin) peut marquer un message comme lu,
-- et seul le champ is_read peut changer (tout le reste verrouillé,
-- même schéma que profiles_update_self / terrains_update_admin_gerant
-- ailleurs dans ce projet).
DO $$ BEGIN
  CREATE POLICY "chat_messages_update_mark_read" ON public.chat_messages
    FOR UPDATE
    USING (
      auth.uid() = receiver_id
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    )
    WITH CHECK (
      sender_id = (SELECT c.sender_id FROM public.chat_messages c WHERE c.id = chat_messages.id)
      AND receiver_id IS NOT DISTINCT FROM (SELECT c.receiver_id FROM public.chat_messages c WHERE c.id = chat_messages.id)
      AND text = (SELECT c.text FROM public.chat_messages c WHERE c.id = chat_messages.id)
      AND channel = (SELECT c.channel FROM public.chat_messages c WHERE c.id = chat_messages.id)
      AND terrain_id IS NOT DISTINCT FROM (SELECT c.terrain_id FROM public.chat_messages c WHERE c.id = chat_messages.id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1b. Notification à chaque nouveau message (Tâche 5) ─────────
-- Utilise la table notifications déjà existante (migration
-- 20260723120000). Note : ne détecte pas si le destinataire a la
-- fenêtre de chat ouverte au moment de l'envoi (nécessiterait un suivi
-- de présence côté front) — la notification est donc toujours créée ;
-- côté front, si le destinataire est déjà en train de regarder cette
-- conversation, il est raisonnable de la marquer lue immédiatement
-- plutôt que de la laisser comme non-lue (à gérer dans le prompt front).
CREATE OR REPLACE FUNCTION public.notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.receiver_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, resource_type, resource_id)
    VALUES (
      NEW.receiver_id,
      'new_chat_message',
      'Nouveau message',
      COALESCE(NEW.sender_name, 'Quelqu''un') || ' : ' || left(NEW.text, 80),
      'chat_message',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_notify_new_chat_message
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.notify_new_chat_message();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. Base de connaissance du chatbot (Tâches 6-7)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bot_knowledge_base (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section    TEXT NOT NULL UNIQUE,  -- clé stable (ex: 'plans_tarifs'), pas un libellé
  title      TEXT NOT NULL,          -- titre affiché en admin / repère dans le prompt
  content    TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  ordre      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

DO $$ BEGIN
  CREATE TRIGGER trg_bot_knowledge_base_updated_at
    BEFORE UPDATE ON public.bot_knowledge_base
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bot_knowledge_base ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bot_knowledge_base_admin_only" ON public.bot_knowledge_base
    FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Pas de policy SELECT publique : la table n'est lue que par l'Edge
-- Function chatbot-query via service_role (bypass RLS), jamais
-- directement par le client. Seul un admin peut la consulter/éditer
-- (ex: future page d'administration du contenu du bot).

-- Contenu initial. Les tarifs/commissions ne sont PAS dupliqués ici en
-- dur (Tâche 3) : l'Edge Function les récupère en direct depuis
-- plan_limits à chaque appel et les injecte séparément dans le prompt,
-- donc toujours à jour même si les prix changent sans qu'on pense à
-- mettre à jour cette table.
INSERT INTO public.bot_knowledge_base (section, title, content, ordre) VALUES
(
  'identite_bot',
  'Identité et ton du bot',
  'Tu es l''assistant virtuel officiel de PlaygroundSpot, une plateforme sénégalaise (Dakar) de réservation de terrains de football (5v5/7v7/11v11). Tu réponds en français, sur un ton chaleureux et direct, en tutoyant l''utilisateur ("Capitaine"). Tu ne réponds QUE sur des sujets liés à PlaygroundSpot (réservation, paiement, abonnement gérant, terrains, comptes). Pour toute question hors sujet, dis-le clairement et redirige poliment.',
  0
),
(
  'roles',
  'Les rôles sur la plateforme',
  'Trois rôles existent : "joueur" (réserve des créneaux sur les terrains), "gérant" (possède/gère un ou plusieurs terrains, doit les faire approuver par un admin avant qu''ils soient visibles publiquement), "admin" (super-administrateur de la plateforme, valide les terrains, supervise les paiements et abonnements).',
  1
),
(
  'reservation',
  'Fonctionnement de la réservation',
  'Un joueur va dans l''onglet "Découverte", choisit un terrain approuvé, sélectionne une date et un créneau horaire disponible, puis paie en ligne via Wave ou Orange Money. Une fois le paiement confirmé, un ticket numérique avec QR code est généré (visible dans "Mes Réservations"/"Mes Tickets"), à présenter sur place pour le scan d''entrée. Pour annuler, le joueur se rend dans "Mes Réservations" et annule le créneau concerné.',
  2
),
(
  'paiement',
  'Paiement Wave / Orange Money',
  'Les paiements passent par UnitechPay (Wave et Orange Money). Le joueur/gérant saisit son numéro de téléphone sénégalais (format 7XXXXXXXX), puis confirme le paiement depuis son application Wave ou Orange Money. La confirmation arrive généralement en quelques secondes à quelques minutes via un webhook automatique. Si un paiement reste bloqué "en attente" plus de 15 minutes sans se confirmer, conseille à l''utilisateur de vérifier qu''il a bien validé la transaction dans son app Wave/OM, et sinon de contacter le support via l''onglet Admin plutôt que de retenter plusieurs fois (pour éviter un double débit).',
  3
),
(
  'validation_terrain',
  'Processus de validation d''un terrain (côté gérant)',
  'Un gérant peut créer sa fiche terrain lui-même (nom, quartier, adresse, tarif, horaires, photos, documents justificatifs). Tant qu''un admin n''a pas validé la fiche, son statut est "en attente" (pending) : le terrain n''est PAS visible publiquement et ne peut pas recevoir de réservations. L''admin peut ensuite approuver (le terrain devient visible et réservable) ou refuser (avec un motif écrit, affiché au gérant, qui peut corriger et resoumettre). Une fois un terrain approuvé, le gérant peut continuer à modifier sa fiche (photos, tarif, description...) SANS que ça redéclenche une nouvelle validation admin — les modifications s''appliquent immédiatement.',
  4
),
(
  'boost_visibilite',
  'Budget Visibilité (boost)',
  'Un gérant sur un plan payant (Starter, Pro ou Entreprise — pas Free) peut allouer un budget pour "booster" la visibilité d''un de ses terrains dans les résultats de recherche/découverte : le terrain remonte dans les résultats, pondéré par le montant alloué, pendant une durée choisie par le gérant. Le module affiche aussi une estimation du nombre de vues générées et un suivi de performance (vues, coût par vue) une fois le boost actif.',
  5
),
(
  'abonnement_gerant',
  'Abonnement gérant — généralités',
  'Chaque gérant a un abonnement à un plan (Free par défaut à l''inscription). Le plan détermine : le nombre de terrains qu''il peut gérer, un éventuel quota de réservations mensuelles, le taux de commission prélevé par la plateforme sur chaque réservation, et l''accès à des fonctionnalités avancées (export PDF, dashboard avancé, multi-sites, boost de visibilité — jamais disponible sur Free). Le paiement d''un abonnement payant se fait aussi via Wave/Orange Money (UnitechPay), en mensuel ou annuel (l''annuel coûte 25% de moins que 12x le mensuel). Le détail exact des prix/quotas/commissions par plan est injecté séparément ci-dessous, toujours à jour.',
  6
),
(
  'support_humain',
  'Quand rediriger vers le support humain',
  'Si la question porte sur un compte, une réservation ou un paiement PRÉCIS de l''utilisateur (ex: "pourquoi mon paiement de telle réservation n''est pas confirmé", "pourquoi mon compte est suspendu"), tu n''as PAS accès à ces données précises — ne les invente jamais. Dis clairement que tu ne peux pas consulter les détails de son compte, et invite-le à basculer sur l''onglet "Admin" du chat pour parler à un humain du support qui pourra vérifier son dossier. Fais de même pour toute question dont tu n''es pas sûr de la réponse plutôt que d''improviser.',
  7
)
ON CONFLICT (section) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  ordre = EXCLUDED.ordre;
