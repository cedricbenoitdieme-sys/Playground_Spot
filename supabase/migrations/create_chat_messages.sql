-- Migration: Create chat_messages table for real-time support
-- Run this in your Supabase Dashboard SQL Editor to enable real database chat.

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL for Admin/Platform support
  terrain_id  UUID REFERENCES public.terrains(id) ON DELETE CASCADE, -- Set if communicating with a Gérant
  sender_name TEXT NOT NULL,
  text        TEXT NOT NULL,
  channel     TEXT NOT NULL, -- 'admin' or 'gerant'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Users can insert their own messages
CREATE POLICY "Users can insert their own messages" ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 2. Users can read messages they sent or received
CREATE POLICY "Users can read their own conversations" ON public.chat_messages
  FOR SELECT USING (
    auth.uid() = sender_id OR 
    auth.uid() = receiver_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR
    (terrain_id IS NOT NULL AND auth.uid() = (SELECT gerant_id FROM public.terrains WHERE id = terrain_id))
  );
