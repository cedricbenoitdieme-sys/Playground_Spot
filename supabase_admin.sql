-- =====================================================================
-- OPTION 2: Secure SQL Function to create the first admin user
-- =====================================================================

-- This function enables creating an admin user programmatically from the Supabase SQL Editor.
-- It bypasses standard signup flows and inserts the profile with the 'admin' role directly.

CREATE OR REPLACE FUNCTION public.create_first_admin(
    admin_email TEXT,
    admin_password TEXT,
    admin_full_name TEXT
)
RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
    encrypted_pw TEXT;
BEGIN
    -- 1. Generate the encrypted password using Supabase's crypt extension
    encrypted_pw := extensions.crypt(admin_password, extensions.gen_salt('bf'));

    -- 2. Insert user into auth.users (Supabase Auth table)
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        admin_email,
        encrypted_pw,
        NOW(), -- Auto-confirms the email address
        NULL,
        NULL,
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', admin_full_name, 'role', 'admin'),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    )
    RETURNING id INTO new_user_id;

    -- NOTE: The handle_new_user() trigger created earlier will automatically run
    -- upon insertion into auth.users.
    -- Because raw_user_meta_data contains 'role': 'admin', the trigger will insert
    -- the profile directly into public.profiles with the 'admin' role.
    -- However, we explicitly force the role update here as a safety measure:
    UPDATE public.profiles
    SET role = 'admin'::public.user_role
    WHERE id = new_user_id;

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- HOW TO RUN THIS FUNCTION:
-- =====================================================================
-- Execute the following query in the SQL Editor (replace with your values):
-- SELECT public.create_first_admin('admin@playgroundspot.sn', 'VotreMotDePasseSecurise', 'Super Admin');

-- =====================================================================
-- IMPORTANT: CLEANUP
-- =====================================================================
-- After creating your admin user, immediately delete the function to secure your database:
-- DROP FUNCTION IF EXISTS public.create_first_admin(TEXT, TEXT, TEXT);
