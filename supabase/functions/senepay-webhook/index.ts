// Edge Function : webhook SenePay UNIQUE pour les paiements entrants (payin)
// des 3 flux de PlaygroundSpot (abonnement, boost, réservation), distingués
// via la ligne `senepay_payments` retrouvée par `order_id` — pas par un
// préfixe de référence comme le faisait webhook-unitech, puisque `type_flux`
// est ici une donnée explicite déjà stockée.
//
// Vérification de signature HMAC-SHA256 obligatoire (fail-closed) sur le
// corps BRUT, header `X-SenePay-Signature`, secret DÉDIÉ
// SENEPAY_WEBHOOK_SIGNING_SECRET (préfixe whsec_) — JAMAIS SENEPAY_API_SECRET,
// contrairement à UnitechPay où la même clé servait aux deux usages.
//
// Idempotence : SenePay peut relivrer jusqu'à 14 fois sur ~3 jours. On
// dédoublonne en vérifiant que senepay_payments.status n'est pas déjà
// terminal avant de traiter quoi que ce soit.
//
// Sur succès d'un paiement de réservation spécifiquement, déclenche en plus
// le payout automatique vers le gérant (process_reservation_payout, puis
// appel à l'API payout SenePay) — capacité qui n'existait pas avec
// UnitechPay (100% du paiement joueur restait sur le compte marchand
// plateforme).
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const senepayApiKey = Deno.env.get("SENEPAY_API_KEY") ?? ""
const senepayApiSecret = Deno.env.get("SENEPAY_API_SECRET") ?? ""
const senepayBaseUrl = (Deno.env.get("SENEPAY_API_BASE_URL") ?? "").replace(/\/$/, '')
const webhookSecret = Deno.env.get("SENEPAY_WEBHOOK_SIGNING_SECRET") ?? ""

async function computeHmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    })
  }

  if (!webhookSecret) {
    console.error('[senepay-webhook] SENEPAY_WEBHOOK_SIGNING_SECRET non configuré — requête rejetée')
    return new Response(JSON.stringify({ error: 'Webhook non configuré' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-senepay-signature')

    if (!signature) {
      console.warn('[senepay-webhook] Signature manquante')
      return new Response(JSON.stringify({ error: 'Signature manquante' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    const computedSignature = await computeHmacHex(webhookSecret, rawBody)
    if (!timingSafeEqualHex(computedSignature, signature)) {
      console.warn('[senepay-webhook] Signature invalide')
      return new Response(JSON.stringify({ error: 'Signature invalide' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    let payload: { event?: string; order_id?: string; orderId?: string; status?: string; internalId?: string; token?: string }
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response(JSON.stringify({ error: 'JSON malformé' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    const orderId = payload.order_id || payload.orderId
    const status = payload.status
    if (!orderId || !status) {
      return new Response(JSON.stringify({ error: 'order_id et status requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    // Ne JAMAIS se fier à un éventuel champ `statut` (toujours true côté
    // SenePay) — seul `status` fait foi, exactement comme à l'initiation.
    const internalStatus = ['success', 'completed', 'paid', 'approved'].includes(status.toLowerCase()) ? 'success' : 'failed'

    console.log(`[senepay-webhook] order_id=${orderId} status=${status}`)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: senepayPayment, error: fetchError } = await supabase
      .from('senepay_payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()

    if (fetchError || !senepayPayment) {
      // Référence inconnue : on répond quand même 200 pour éviter une
      // tempête de retries côté SenePay (jusqu'à 14 relivraisons/3 jours).
      console.warn(`[senepay-webhook] order_id inconnu: ${orderId}`)
      return new Response(JSON.stringify({ success: true, handled: false, reason: 'unknown_order_id' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    // Idempotence : déjà dans un statut terminal → rejeu ignoré.
    if (['completed', 'failed', 'cancelled'].includes(senepayPayment.status)) {
      console.log(`[senepay-webhook] order_id=${orderId} déjà au statut terminal '${senepayPayment.status}' — rejeu ignoré`)
      return new Response(JSON.stringify({ success: true, handled: false, reason: 'already_terminal' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    await supabase.rpc('update_senepay_payment_status', {
      p_order_id: orderId,
      p_status: internalStatus === 'success' ? 'completed' : 'failed',
      p_internal_id: payload.internalId ?? null,
      p_token: payload.token ?? null,
      p_raw_response: payload
    })

    if (senepayPayment.type_flux === 'abonnement') {
      const { data: result, error: rpcError } = await supabase.rpc('activate_subscription', {
        p_unitech_reference: orderId, p_status: internalStatus, p_phone_number: null
      })
      if (rpcError) {
        console.error('[senepay-webhook] Erreur activate_subscription:', rpcError.message)
        return new Response(JSON.stringify({ error: 'Erreur interne' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ success: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (senepayPayment.type_flux === 'boost') {
      const { data: result, error: rpcError } = await supabase.rpc('activate_boost', {
        p_unitech_reference: orderId, p_status: internalStatus
      })
      if (rpcError) {
        console.error('[senepay-webhook] Erreur activate_boost:', rpcError.message)
        return new Response(JSON.stringify({ error: 'Erreur interne' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ success: true, ...result }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // ── type_flux === 'reservation' ──
    const { error: reservationRpcError } = await supabase.rpc('handle_payment_webhook', {
      p_provider: 'senepay',
      p_payload: payload,
      p_reference: orderId,
      p_status: internalStatus
    })

    if (reservationRpcError) {
      console.error('[senepay-webhook] Erreur handle_payment_webhook:', reservationRpcError.message)
      return new Response(JSON.stringify({ error: 'Erreur interne' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    if (internalStatus !== 'success' || !senepayPayment.reservation_id) {
      return new Response(JSON.stringify({ success: true, handled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // ── Payout automatique vers le gérant (marketplace split-payment) ──
    // process_reservation_payout est idempotente (ON CONFLICT sur
    // external_id) : un rejeu de ce webhook ne déclenchera jamais un
    // deuxième virement pour la même réservation.
    const { data: payout, error: payoutError } = await supabase.rpc('process_reservation_payout', {
      p_reservation_id: senepayPayment.reservation_id
    })

    if (payoutError) {
      console.error('[senepay-webhook] Erreur process_reservation_payout:', payoutError.message)
      // Le paiement joueur est déjà confirmé (handle_payment_webhook a
      // réussi) — ne pas faire échouer la réponse webhook pour un souci de
      // payout, sinon SenePay relivre indéfiniment un événement déjà traité
      // côté paiement. Le payout manqué reste visible en base (aucune ligne
      // gerant_payouts créée) pour rattrapage manuel.
      return new Response(JSON.stringify({ success: true, handled: true, payout_error: payoutError.message }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!payout?.handled) {
      console.log(`[senepay-webhook] Payout non déclenché pour réservation ${senepayPayment.reservation_id}: ${payout?.reason}`)
      return new Response(JSON.stringify({ success: true, handled: true, payout: payout }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!senepayApiKey || !senepayApiSecret || !senepayBaseUrl) {
      console.error('[senepay-webhook] SENEPAY_API_KEY/SENEPAY_API_SECRET/SENEPAY_API_BASE_URL non configurés — payout non envoyé, intervention manuelle requise pour', payout.external_id)
      return new Response(JSON.stringify({ success: true, handled: true, payout_pending_manual: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    try {
      const payoutResponse = await fetch(`${senepayBaseUrl}/api/v1/payouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': senepayApiKey,
          'X-Api-Secret': senepayApiSecret
        },
        body: JSON.stringify({
          external_id: payout.external_id,
          amount: payout.amount,
          fee_mode: 'inclusive',
          phone: payout.phone,
          operator: payout.operator,
          country: payout.country,
          callback_url: `${supabaseUrl}/functions/v1/senepay-payout-webhook`,
          metadata: {
            reservation_id: senepayPayment.reservation_id,
            gerant_id: senepayPayment.gerant_id,
            terrain_id: senepayPayment.terrain_id
          }
        })
      })

      const payoutResult = await payoutResponse.json().catch(() => ({}))

      if (!payoutResponse.ok) {
        console.error(`[senepay-webhook] Erreur API payout SenePay (${payoutResponse.status}) pour ${payout.external_id}:`, JSON.stringify(payoutResult))
        // Réponse HTTP en échec à l'appel payout lui-même (pas un statut
        // pending_verification/submitted légitime) : la ligne gerant_payouts
        // reste 'pending' pour rattrapage manuel — ne jamais retry automatique.
      } else {
        // Statut immédiat (souvent 'submitted'/'pending_verification') — le
        // statut TERMINAL (completed/failed) n'arrive que via
        // senepay-payout-webhook, jamais ici.
        await supabase
          .from('gerant_payouts')
          .update({
            disbursement_id: payoutResult.disbursement_id ?? payoutResult.id ?? null,
            status: (payoutResult.status || 'submitted').toLowerCase(),
            raw_response: payoutResult,
            updated_at: new Date().toISOString()
          })
          .eq('external_id', payout.external_id)
      }
    } catch (payoutCallErr) {
      console.error(`[senepay-webhook] Exception lors de l'appel payout SenePay pour ${payout.external_id}:`, payoutCallErr instanceof Error ? payoutCallErr.message : payoutCallErr)
    }

    return new Response(JSON.stringify({ success: true, handled: true, payout_external_id: payout.external_id }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[senepay-webhook] Erreur:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
