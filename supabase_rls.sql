-- 1. Ensure RLS is enabled on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terrains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avis ENABLE ROW LEVEL SECURITY;

-- 2. Helper Functions (Security Definer) to avoid infinite recursion loops on profiles table
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND role = 'admin'::public.user_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_gerant(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND role = 'gerant'::public.user_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================================
-- POLICIES FOR profiles
-- =====================================================================

CREATE POLICY "Allow users to read their own profile or admins to read all"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Allow users to update their own profile or admins to update all"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Allow system trigger/admins to insert profiles"
ON public.profiles FOR INSERT
TO public
WITH CHECK (true); -- Required for the handle_new_user() trigger during sign-up


-- =====================================================================
-- POLICIES FOR terrains
-- =====================================================================

CREATE POLICY "Allow anyone to view available terrains"
ON public.terrains FOR SELECT
TO public
USING (disponible = true OR auth.uid() = gerant_id OR public.is_admin(auth.uid()));

CREATE POLICY "Allow managers and admins to insert terrains"
ON public.terrains FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin(auth.uid()) 
    OR (public.is_gerant(auth.uid()) AND auth.uid() = gerant_id)
);

CREATE POLICY "Allow managers and admins to update their own terrains"
ON public.terrains FOR UPDATE
TO authenticated
USING (
    public.is_admin(auth.uid()) 
    OR (public.is_gerant(auth.uid()) AND auth.uid() = gerant_id)
)
WITH CHECK (
    public.is_admin(auth.uid()) 
    OR (public.is_gerant(auth.uid()) AND auth.uid() = gerant_id)
);

CREATE POLICY "Allow managers and admins to delete their own terrains"
ON public.terrains FOR DELETE
TO authenticated
USING (
    public.is_admin(auth.uid()) 
    OR (public.is_gerant(auth.uid()) AND auth.uid() = gerant_id)
);


-- =====================================================================
-- POLICIES FOR reservations
-- =====================================================================

CREATE POLICY "Allow players, respective managers, and admins to view reservations"
ON public.reservations FOR SELECT
TO authenticated
USING (
    joueur_id = auth.uid()
    OR public.is_admin(auth.uid())
    -- Manager checks if they manage the terrain linked to the reservation
    OR terrain_id IN (
        SELECT id FROM public.terrains WHERE gerant_id = auth.uid()
    )
);

CREATE POLICY "Allow players to book reservations"
ON public.reservations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = joueur_id);

CREATE POLICY "Allow players to cancel or admins to update reservations"
ON public.reservations FOR UPDATE
TO authenticated
USING (
    auth.uid() = joueur_id 
    OR public.is_admin(auth.uid())
)
WITH CHECK (
    public.is_admin(auth.uid())
    -- Players can only update their reservations to 'annulee' (cancel)
    OR (auth.uid() = joueur_id AND statut = 'annulee'::public.reservation_status)
);


-- =====================================================================
-- POLICIES FOR avis
-- =====================================================================

CREATE POLICY "Allow public read access to reviews"
ON public.avis FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow authenticated players to write reviews"
ON public.avis FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = joueur_id);

CREATE POLICY "Allow owners and admins to update reviews"
ON public.avis FOR UPDATE
TO authenticated
USING (auth.uid() = joueur_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = joueur_id OR public.is_admin(auth.uid()));

CREATE POLICY "Allow owners and admins to delete reviews"
ON public.avis FOR DELETE
TO authenticated
USING (auth.uid() = joueur_id OR public.is_admin(auth.uid()));
