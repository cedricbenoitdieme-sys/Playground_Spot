import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé : En-tête Authorization manquant' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Initialiser le client utilisateur pour valider son rôle
    const clientSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    })
    
    const { data: { user }, error: authError } = await clientSupabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non autorisé : Jeton d\'authentification invalide' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Récupérer le rôle de l'utilisateur
    const { data: profile, error: profileError } = await clientSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès interdit : Rôle Admin requis' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Extraire les paramètres de la requête
    const { email, nom, tel, quartier } = await req.json()
    if (!email || !nom) {
      return new Response(JSON.stringify({ error: 'Email et Nom complet requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Créer l'utilisateur dans auth.users via l'admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Mot de passe temporaire aléatoire
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';

    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        nom: nom.trim(),
        role: 'gerant'
      }
    })

    if (createError) {
      return new Response(JSON.stringify({ error: `Erreur création auth: ${createError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newUserId = authUser.user.id

    // 4. Mettre à jour le profil SQL associé
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        tel: tel?.trim() || null,
        quartier: quartier?.trim() || null,
        statut: 'en_attente'
      })
      .eq('id', newUserId)
      .select()
      .single()

    if (updateError) {
      // Nettoyage en cas d'erreur
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return new Response(JSON.stringify({ error: `Erreur profils: ${updateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user: updatedProfile,
      tempPassword // Renvoyé pour que l'admin puisse le communiquer ou envoyer une invite
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
