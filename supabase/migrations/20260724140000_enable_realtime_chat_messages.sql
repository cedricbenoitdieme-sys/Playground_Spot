-- ============================================================
-- Migration : active la réplication Realtime Supabase sur
-- chat_messages (et notifications, même besoin pour la cloche).
--
-- Cause probable de la "grosse latence" signalée : le code de
-- ChatWidget.jsx s'abonne bien à `postgres_changes` sur chat_messages
-- (voir le useEffect avec `.channel('public:chat_messages')...on('postgres_changes', ...)`),
-- mais un abonnement postgres_changes ne reçoit RIEN si la table n'est
-- pas explicitement ajoutée à la publication `supabase_realtime` — ce
-- n'est pas automatique du simple fait que RLS/triggers existent. Sans
-- ça, un message envoyé n'apparaît jamais en temps réel chez le
-- destinataire (ni même chez l'expéditeur, puisque ChatWidget.jsx ne
-- fait pas d'affichage optimiste local — voir le prompt front associé),
-- ce qui peut ressembler à de la latence ou à une perte de message alors
-- que la ligne existe bien en base.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Vérification (résultat attendu : 2 lignes, chat_messages et notifications).
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename IN ('chat_messages', 'notifications');
