// Edge Function : initiation de paiement SenePay pour les 3 flux de
// PlaygroundSpot, distingués par `type_flux` dans le corps de la requête :
//
//   - 'abonnement' : plan gérant payant. Contrat :
//     { type_flux: 'abonnement', plan, billing_period, payment_method, customer_number }
//   - 'boost'       : campagne Budget Visibilité. Contrat :
//     { type_flux: 'boost', terrain_id, budget_fcfa, duree_jours, payment_method, customer_number }
//   - 'reservation' : paiement joueur pour une réservation. Contrat :
//     { type_flux: 'reservation', reservation_id, payment_method, customer_number }
//
// Remplace UnitechPay (supabase/functions/create-payment, webhook-unitech)
// ET l'Express backend/routes/payments.js POST /initiate (réservation) —
// un seul point d'entrée pour les 3 flux, comme SenePay le permet nativement
// via `order_id`/`metadata`, là où UnitechPay imposait un webhook fusionné
// mais deux points d'initiation séparés.
//
// IMPORTANT (sécurité) : le montant n'est JAMAIS lu depuis le corps de la
// requête client au moment de l'appel SenePay — il est toujours recalculé/
// relu côté serveur via create_pending_subscription / create_pending_boost /
// create_pending_reservation_payment (RPC SECURITY DEFINER), exactement
// comme le faisait create-payment pour UnitechPay.
//
// IMPORTANT (contrat SenePay) : le champ `statut` de la réponse HTTP est
// TOUJOURS `true` sur un 200, quel que soit le résultat réel — ne jamais s'y
// fier, seul le champ `status` (et `nextAction`) reflète l'état réel.
//
// Second appel OTP (nextAction='OTP_REQUIRED', Orange Money en SN/CI/BF/GN) :
// le front rappelle cette même fonction avec { type_flux, order_id, otp_code }
// — la ligne senepay_payments correspondante est relue pour reconstituer
// l'appel SenePay. Confirmé par la doc officielle (section "3. USSD & OTP") :
// même endpoint /payments/initiate rappelé avec otp_code en plus, pas
// d'endpoint dédié.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const senepayApiKey = Deno.env.get("SENEPAY_API_KEY") ?? ""
const senepayApiSecret = Deno.env.get("SENEPAY_API_SECRET") ?? ""
const senepayBaseUrl = (Deno.env.get("SENEPAY_API_BASE_URL") ?? "").replace(/\/$/, '')

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

// Vocabulaire opérateur SenePay (confirmé par la doc officielle, table
// "Pays et méthodes de paiement supportés", Sénégal → wave, orange, free,
// emoney) — nos payment_method internes ('wave'/'orange_money') sont
// mappés dessus.
const PAYMENT_METHOD_TO_SENEPAY_OPERATOR: Record<string, string> = {
  wave: 'wave',
  orange_money: 'orange'
}

// mode_paiement (enum Postgres) attendu par create_pending_reservation_payment.
const PAYMENT_METHOD_TO_MODE: Record<string, string> = {
  wave: 'wave',
  orange_money: 'orange_money'
}

// La doc SenePay attend customer_phone au format international complet
// (ex: "221771234567", cf. exemples curl payin/payout) — nos formulaires ne
// collectent que le numéro local sénégalais à 9 chiffres (7XXXXXXXX).
function toSenepayPhone(localNumber: string): string {
  return `221${localNumber}`
}

type SenepayInitiateResponse = {
  status?: string
  nextAction?: string
  redirectUrl?: string
  token?: string
  internalId?: string
  errorCode?: string | null
  failedReason?: string | null
  [key: string]: unknown
}

async function callSenepayInitiate(body: Record<string, unknown>): Promise<{ ok: boolean; result: SenepayInitiateResponse; raw: unknown }> {
  const response = await fetch(`${senepayBaseUrl}/api/v1/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': senepayApiKey,
      'X-Api-Secret': senepayApiSecret
    },
    body: JSON.stringify(body)
  })
  const raw = await response.json().catch(() => ({}))
  return { ok: response.ok, result: raw as SenepayInitiateResponse, raw }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405)
  }
  if (!senepayApiKey || !senepayApiSecret || !senepayBaseUrl) {
    console.error('[senepay-initiate] SENEPAY_API_KEY/SENEPAY_API_SECRET/SENEPAY_API_BASE_URL non configurés')
    return json({ error: 'Paiement non configuré' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Non autorisé : en-tête Authorization manquant' }, 401)
  }

  const callerSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  })

  try {
    const { data: { user }, error: authError } = await callerSupabase.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Non autorisé : jeton invalide' }, 401)
    }

    const body = await req.json()
    const { type_flux, otp_code, order_id: otpOrderId } = body as {
      type_flux?: string; otp_code?: string; order_id?: string
    }

    if (!type_flux || !['abonnement', 'boost', 'reservation'].includes(type_flux)) {
      return json({ error: "type_flux invalide (attendu 'abonnement', 'boost' ou 'reservation')" }, 400)
    }

    // ── Second appel OTP : complète une transaction déjà initiée ──
    if (otp_code) {
      if (!otpOrderId) {
        return json({ error: 'order_id requis pour soumettre un code OTP' }, 400)
      }
      const { data: pendingRow, error: pendingRowError } = await callerSupabase
        .from('senepay_payments')
        .select('*')
        .eq('order_id', otpOrderId)
        .single()

      if (pendingRowError || !pendingRow) {
        return json({ error: 'Transaction introuvable' }, 404)
      }

      const { ok, result } = await callSenepayInitiate({
        order_id: otpOrderId,
        otp_code,
        amount: pendingRow.amount,
        country_code: 'SN',
        operator: pendingRow.operator,
        customer_phone: toSenepayPhone(pendingRow.phone)
      })

      if (!ok) {
        console.error('[senepay-initiate] Erreur SenePay (OTP):', JSON.stringify(result))
        return json({ error: 'Validation OTP échouée' }, 502)
      }

      await callerSupabase.rpc('update_senepay_payment_status', {
        p_order_id: otpOrderId,
        p_status: (result.status || 'pending').toLowerCase(),
        p_next_action: result.nextAction ?? null,
        p_token: result.token ?? null,
        p_internal_id: result.internalId ?? null,
        p_raw_response: result
      })

      return json({
        success: true,
        order_id: otpOrderId,
        status: result.status,
        next_action: result.nextAction,
        redirect_url: result.redirectUrl ?? null,
        token: result.token ?? null,
        error_code: result.errorCode ?? null,
        failed_reason: result.failedReason ?? null
      })
    }

    // Rate limit : 5 tentatives / 10 minutes par utilisateur, par type de flux.
    const { data: allowed, error: rlError } = await callerSupabase.rpc('check_rate_limit', {
      p_identifier: user.id,
      p_action: `senepay_initiate_${type_flux}`,
      p_max_attempts: 5,
      p_window: '10 minutes'
    })
    if (rlError) {
      console.error('[senepay-initiate] Erreur rate limit:', rlError.message)
      return json({ error: 'Erreur interne' }, 500)
    }
    if (!allowed) {
      return json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429)
    }

    let orderId: string
    let amount: number
    let gerantId: string | null = null
    let terrainId: string | null = null
    let reservationId: string | null = null
    let paymentMethod: string
    let customerNumber: string
    let description: string

    if (type_flux === 'abonnement' || type_flux === 'boost') {
      const { data: profile, error: profileError } = await callerSupabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profileError || !profile || profile.role !== 'gerant') {
        return json({ error: 'Accès interdit : réservé aux gérants' }, 403)
      }
      gerantId = user.id

      const { payment_method, customer_number } = body as { payment_method?: string; customer_number?: string }
      if (!payment_method || !customer_number) {
        return json({ error: 'payment_method et customer_number sont requis' }, 400)
      }
      if (!SENEGAL_PHONE_REGEX.test(customer_number)) {
        return json({ error: 'Numéro invalide : format attendu 7XXXXXXXX' }, 400)
      }
      if (!PAYMENT_METHOD_TO_SENEPAY_OPERATOR[payment_method]) {
        return json({ error: "payment_method invalide (attendu 'wave' ou 'orange_money')" }, 400)
      }
      paymentMethod = payment_method
      customerNumber = customer_number

      if (type_flux === 'abonnement') {
        const { plan, billing_period } = body as { plan?: string; billing_period?: string }
        if (!plan) return json({ error: 'plan requis' }, 400)
        if (plan === 'free') {
          const { data: freeResult, error: freeError } = await callerSupabase.rpc('activate_free_plan', { p_gerant_id: user.id })
          if (freeError) return json({ error: freeError.message || "Impossible d'activer le plan Free" }, 400)
          return json({ success: true, plan: 'free', payment_required: false, ...freeResult })
        }
        const cycle = BILLING_PERIOD_TO_CYCLE[billing_period ?? '']
        if (!cycle) return json({ error: "billing_period invalide (attendu 'monthly' ou 'annual')" }, 400)

        const { data: pending, error: pendingError } = await callerSupabase.rpc('create_pending_subscription', {
          p_gerant_id: user.id, p_plan_id: plan, p_cycle: cycle, p_phone_number: customer_number
        })
        if (pendingError || !pending) return json({ error: pendingError?.message || 'Impossible de créer la souscription' }, 400)
        const p = pending as { unitech_reference: string; montant: number; subscription_id: string }
        orderId = p.unitech_reference
        amount = p.montant
        description = `Abonnement PlaygroundSpot ${plan} (${billing_period})`
      } else {
        const { terrain_id, budget_fcfa, duree_jours } = body as { terrain_id?: string; budget_fcfa?: number; duree_jours?: number }
        if (!terrain_id || !budget_fcfa || !duree_jours) {
          return json({ error: 'terrain_id, budget_fcfa et duree_jours sont requis' }, 400)
        }
        const { data: pending, error: pendingError } = await callerSupabase.rpc('create_pending_boost', {
          p_gerant_id: user.id, p_terrain_id: terrain_id, p_montant: budget_fcfa, p_duree_jours: duree_jours
        })
        if (pendingError || !pending) return json({ error: pendingError?.message || 'Impossible de créer la campagne de boost' }, 400)
        const p = pending as { unitech_reference: string; montant: number; boost_id: string }
        orderId = p.unitech_reference
        amount = p.montant
        terrainId = terrain_id
        description = `Boost visibilité PlaygroundSpot (${duree_jours}j)`
      }
    } else {
      // type_flux === 'reservation' : n'importe quel utilisateur authentifié
      // propriétaire de la réservation (vérifié dans la RPC elle-même).
      const { reservation_id, payment_method, customer_number } = body as {
        reservation_id?: string; payment_method?: string; customer_number?: string
      }
      if (!reservation_id || !payment_method || !customer_number) {
        return json({ error: 'reservation_id, payment_method et customer_number sont requis' }, 400)
      }
      if (!SENEGAL_PHONE_REGEX.test(customer_number)) {
        return json({ error: 'Numéro invalide : format attendu 7XXXXXXXX' }, 400)
      }
      if (!PAYMENT_METHOD_TO_SENEPAY_OPERATOR[payment_method]) {
        return json({ error: "payment_method invalide (attendu 'wave' ou 'orange_money')" }, 400)
      }
      paymentMethod = payment_method
      customerNumber = customer_number

      const { data: pending, error: pendingError } = await callerSupabase.rpc('create_pending_reservation_payment', {
        p_reservation_id: reservation_id,
        p_mode: PAYMENT_METHOD_TO_MODE[payment_method],
        p_numero_tel: customer_number
      })
      if (pendingError || !pending) return json({ error: pendingError?.message || 'Impossible de créer le paiement' }, 400)
      const p = pending as { reference: string; montant: number; terrain_id: string; gerant_id: string; paiement_id: string }
      orderId = p.reference
      amount = p.montant
      terrainId = p.terrain_id
      gerantId = p.gerant_id
      reservationId = reservation_id
      description = 'Réservation PlaygroundSpot'
    }

    // Trace SenePay-side AVANT l'appel HTTP (statut 'pending' par défaut).
    const { error: recordError } = await callerSupabase.rpc('create_senepay_payment_record', {
      p_order_id: orderId,
      p_type_flux: type_flux,
      p_gerant_id: gerantId,
      p_terrain_id: terrainId,
      p_reservation_id: reservationId,
      p_amount: amount,
      p_operator: PAYMENT_METHOD_TO_SENEPAY_OPERATOR[paymentMethod],
      p_phone: customerNumber
    })
    if (recordError) {
      console.error('[senepay-initiate] Erreur create_senepay_payment_record:', recordError.message)
      return json({ error: 'Erreur interne' }, 500)
    }

    console.log(`[senepay-initiate] Init ${orderId} (${type_flux}/${paymentMethod}) montant=${amount} tel=${maskPhone(customerNumber)}`)

    const { ok, result } = await callSenepayInitiate({
      amount,
      country_code: 'SN',
      operator: PAYMENT_METHOD_TO_SENEPAY_OPERATOR[paymentMethod],
      customer_phone: toSenepayPhone(customerNumber),
      order_id: orderId,
      webhook_url: `${supabaseUrl}/functions/v1/senepay-webhook`,
      metadata: { type_flux, gerant_id: gerantId, terrain_id: terrainId, reservation_id: reservationId, description }
    })

    if (!ok) {
      console.error('[senepay-initiate] Erreur API SenePay:', JSON.stringify(result))
      await callerSupabase.rpc('update_senepay_payment_status', {
        p_order_id: orderId, p_status: 'failed', p_raw_response: result
      })
      return json({ error: 'Paiement non initialisé' }, 502)
    }

    // Ne JAMAIS se fier à result.statut (toujours true sur HTTP 200) — seul
    // result.status/result.nextAction reflète l'état réel de la transaction.
    await callerSupabase.rpc('update_senepay_payment_status', {
      p_order_id: orderId,
      p_status: (result.status || 'pending').toLowerCase(),
      p_next_action: result.nextAction ?? null,
      p_token: result.token ?? null,
      p_internal_id: result.internalId ?? null,
      p_raw_response: result
    })

    return json({
      success: true,
      order_id: orderId,
      amount,
      status: result.status,
      next_action: result.nextAction,
      redirect_url: result.nextAction === 'REDIRECT_TO_PROVIDER_LINK' ? result.redirectUrl : null,
      token: result.nextAction === 'USSD_PUSH' || result.nextAction === 'OTP_REQUIRED' ? result.token : null,
      otp_required: result.nextAction === 'OTP_REQUIRED',
      error_code: result.errorCode ?? null,
      failed_reason: result.failedReason ?? null
    })

  } catch (err) {
    console.error('[senepay-initiate] Erreur:', err instanceof Error ? err.message : err)
    return json({ error: 'Erreur interne du serveur' }, 500)
  }
})
