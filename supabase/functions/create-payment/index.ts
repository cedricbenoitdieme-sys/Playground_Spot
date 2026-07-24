// Edge Function : création d'un paiement d'abonnement gérant (Free exclu —
// activé directement sans paiement). Suit le schéma UnitechPay déjà validé
// sur Sama Boutik (Boutique OS ⇄ UnitechPay ⇄ Wave/Orange).
//
// Contrat d'entrée : { plan, billing_period, payment_method, customer_number }
//   - plan            : 'free' | 'starter' | 'pro' | 'entreprise'
//   - billing_period  : 'monthly' | 'annual' (ignoré/absent si plan='free')
//   - payment_method  : 'wave' | 'orange_money' (ignoré/absent si plan='free')
//   - customer_number : téléphone sénégalais 7XXXXXXXX (ignoré/absent si plan='free')
//
// IMPORTANT (sécurité) : le montant n'est JAMAIS lu depuis le corps de la
// requête client. Il est recalculé côté serveur à partir de `plan_limits`
// (table de prix faisant foi, non modifiable par le client) via la RPC
// create_pending_subscription — un `amount` envoyé par le client est
// silencieusement ignoré (il n'est même pas destructuré ci-dessous).
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SENEGAL_PHONE_REGEX = /^7[0-9]{8}$/

function maskPhone(phone: string): string {
  if (!phone || phone.length < 5) return phone
  return phone.slice(0, 2) + '*'.repeat(phone.length - 4) + phone.slice(-2)
}

const BILLING_PERIOD_TO_CYCLE: Record<string, 'mensuel' | 'annuel'> = {
  monthly: 'mensuel',
  annual: 'annuel'
}

const PAYMENT_METHOD_TO_ACTION: Record<string, string> = {
  wave: 'create_wave_payment',
  orange_money: 'create_orange_maxit'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Non autorisé : en-tête Authorization manquant' }, 401)
  }

  // Client scopé au JWT de l'appelant : auth.uid() doit résoudre correctement
  // dans les RPC SECURITY DEFINER appelées ci-dessous.
  const callerSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  })

  try {
    const { data: { user }, error: authError } = await callerSupabase.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Non autorisé : jeton invalide' }, 401)
    }

    const { data: profile, error: profileError } = await callerSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'gerant') {
      return json({ error: 'Accès interdit : réservé aux gérants' }, 403)
    }

    // Rate limit : 5 tentatives / 10 minutes par gérant.
    const { data: allowed, error: rlError } = await callerSupabase.rpc('check_rate_limit', {
      p_identifier: user.id,
      p_action: 'create_subscription_payment',
      p_max_attempts: 5,
      p_window: '10 minutes'
    })
    if (rlError) {
      console.error('[create-payment] Erreur rate limit:', rlError.message)
      return json({ error: 'Erreur interne' }, 500)
    }
    if (!allowed) {
      return json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429)
    }

    // NB : on ne déstructure volontairement PAS de champ `amount` ici — voir
    // le commentaire de sécurité en tête de fichier.
    const body = await req.json()
    const { plan, billing_period, payment_method, customer_number } = body as {
      plan?: string; billing_period?: string; payment_method?: string; customer_number?: string
    }

    if (!plan) {
      return json({ error: 'plan requis' }, 400)
    }

    // ── Plan Free : activation directe, aucun paiement ──
    if (plan === 'free') {
      const { data: freeResult, error: freeError } = await callerSupabase.rpc('activate_free_plan', {
        p_gerant_id: user.id
      })
      if (freeError) {
        return json({ error: freeError.message || 'Impossible d\'activer le plan Free' }, 400)
      }
      return json({
        success: true,
        plan: 'free',
        payment_required: false,
        subscription_id: freeResult.subscription_id,
        status: freeResult.status
      })
    }

    // ── Plans payants : validation des champs requis ──
    if (!billing_period || !payment_method || !customer_number) {
      return json({ error: 'billing_period, payment_method et customer_number sont requis pour un plan payant' }, 400)
    }
    if (!SENEGAL_PHONE_REGEX.test(customer_number)) {
      return json({ error: 'Numéro invalide : format attendu 7XXXXXXXX' }, 400)
    }

    const cycle = BILLING_PERIOD_TO_CYCLE[billing_period]
    if (!cycle) {
      return json({ error: "billing_period invalide (attendu 'monthly' ou 'annual')" }, 400)
    }
    const unitechAction = PAYMENT_METHOD_TO_ACTION[payment_method]
    if (!unitechAction) {
      return json({ error: "payment_method invalide (attendu 'wave' ou 'orange_money')" }, 400)
    }

    // Création de la ligne subscriptions 'pending' — le montant est calculé
    // ICI, côté serveur, à partir de plan_limits (jamais depuis le client).
    const { data: pending, error: pendingError } = await callerSupabase.rpc('create_pending_subscription', {
      p_gerant_id: user.id,
      p_plan_id: plan,
      p_cycle: cycle,
      p_phone_number: customer_number
    })

    if (pendingError || !pending) {
      return json({ error: pendingError?.message || 'Impossible de créer la souscription' }, 400)
    }

    const { unitech_reference, montant, subscription_id } = pending as {
      unitech_reference: string; montant: number; subscription_id: string
    }

    const apiKey = payment_method === 'orange_money'
      ? Deno.env.get('UNITECH_OM_API_KEY')
      : Deno.env.get('UNITECH_WAVE_API_KEY')

    if (!apiKey) {
      console.warn(`[create-payment] Clé API manquante pour ${payment_method} → mode simulation`)
      return json({
        success: true,
        simulation: true,
        payment_url: null,
        deep_links: null,
        subscription_id,
        unitech_reference,
        montant
      })
    }

    const callback_success = `${appUrl}/payment/success?sub=${subscription_id}`
    const callback_cancel = `${appUrl}/payment/cancel?sub=${subscription_id}`
    const webhook_url = `${supabaseUrl}/functions/v1/webhook-unitech`

    console.log(`[create-payment] Init ${unitech_reference} (${payment_method}/${cycle}) montant=${montant} tel=${maskPhone(customer_number)}`)

    const response = await fetch(`https://api.unitech.sn/api.php?action=${unitechAction}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        amount: montant, // ← toujours la valeur serveur, jamais celle du client
        customer_number,
        reference: unitech_reference,
        description: `Abonnement PlaygroundSpot ${plan} (${billing_period})`,
        callback_success,
        callback_cancel,
        webhook_url
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[create-payment] Erreur API UnitechPay (${response.status}):`, errText)
      return json({ error: 'Paiement non initialisé' }, 502)
    }

    const result = await response.json()
    const paymentUrl = result.payment_url || result.checkout_url || result.data?.payment_url || result.data?.checkout_url
    const deepLinks = result.deep_links || result.data?.deep_links || null

    if (!paymentUrl) {
      console.error('[create-payment] Pas de payment_url dans la réponse UnitechPay:', result)
      return json({ error: 'Paiement non initialisé' }, 502)
    }

    return json({
      success: true,
      payment_url: paymentUrl,
      deep_links: deepLinks,
      subscription_id,
      unitech_reference,
      montant
    })

  } catch (err) {
    console.error('[create-payment] Erreur:', err instanceof Error ? err.message : err)
    return json({ error: 'Erreur interne du serveur' }, 500)
  }
})
