-- Migration: add qr_token to reservations table
-- Timestamp: 20260616115530

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'reservations' 
          AND column_name = 'qr_token'
    ) THEN
        ALTER TABLE public.reservations ADD COLUMN qr_token TEXT UNIQUE;
    ELSE
        -- If it exists but is NOT NULL, make it nullable so it can be filled later
        ALTER TABLE public.reservations ALTER COLUMN qr_token DROP NOT NULL;
    END IF;
END $$;
