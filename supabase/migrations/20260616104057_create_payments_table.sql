-- Migration to create the payments table
-- Timestamp: 20260616104057

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_ref TEXT UNIQUE NOT NULL,
    reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index on transaction_ref for quick webhook lookups
CREATE INDEX IF NOT EXISTS idx_payments_transaction_ref ON public.payments(transaction_ref);

-- Index on reservation_id
CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON public.payments(reservation_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: authenticated users can only view their own payments
CREATE POLICY "Users can select their own payments"
    ON public.payments
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Trigger to automatically update updated_at
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
