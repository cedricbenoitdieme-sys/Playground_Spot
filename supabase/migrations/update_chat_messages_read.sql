-- Migration: Add is_read status to chat_messages
-- Run this in your Supabase Dashboard SQL Editor to support the "seen/vu" feature.

ALTER TABLE public.chat_messages 
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
