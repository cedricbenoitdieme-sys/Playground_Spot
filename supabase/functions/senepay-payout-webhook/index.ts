// Edge Function : webhook SenePay pour les payouts (disbursements) vers les
// gérants — endpoint SÉPARÉ du webhook payin (senepay-webhook), comme
// spécifié par SenePay pour les deux flux payin/payout.
//
// Ne traite QUE les statuts terminaux `disbursement.completed` et
// `disbursement.failed`. `pending_verification`/`submitted` sont des états
// intermédiaires légitimes où l'issue est encore incertaine — jamais
// interprétés comme un échec, jamais retraités ici (finalize_reservation_payout
// n'est appelée que pour un statut terminal, cf. migration
// 20260801190000_reservation_payout_automation.sql).
//
// Sur `disbursement.failed` : le wallet plateforme est re-crédité
// automatiquement côté SenePay, mais le gérant n'a pas reçu son dû. Les
// codes PROVIDER_ERROR/PROVIDER_EXCEPTION interdisent explicitement un
// retry automatique — on logue clairement pour une reprise MANUELLE,
// aucune logique de nouvelle tentative n'est écrite ici.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
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
    console.error('[senepay-payout-webhook] SENEPAY_WEBHOOK_SIGNING_SECRET non configuré — requête rejetée')
    return new Response(JSON.stringify({ error: 'Webhook non configuré' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-senepay-signature')

    if (!signature) {
      console.warn('[senepay-payout-webhook] Signature manquante')
      return new Response(JSON.stringify({ error: 'Signature manquante' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    const computedSignature = await computeHmacHex(webhookSecret, rawBody)
    if (!timingSafeEqualHex(computedSignature, signature)) {
      console.warn('[senepay-payout-webhook] Signature invalide')
      return new Response(JSON.stringify({ error: 'Signature invalide' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    let payload: {
      event?: string
      external_id?: string
      externalId?: string
      disbursement_id?: string
      id?: string
      status?: string
      error_code?: string
    }
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response(JSON.stringify({ error: 'JSON malformé' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    const externalId = payload.external_id || payload.externalId
    const event = payload.event

    if (!externalId || !event) {
      return new Response(JSON.stringify({ error: 'external_id et event requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    // pending_verification/submitted : états intermédiaires légitimes, non
    // terminaux — on répond 200 sans appeler finalize_reservation_payout
    // (qui RAISE EXCEPTION sur tout statut différent de completed/failed).
    if (event !== 'disbursement.completed' && event !== 'disbursement.failed') {
      console.log(`[senepay-payout-webhook] Événement non terminal ignoré: ${event} (external_id=${externalId})`)
      return new Response(JSON.stringify({ success: true, handled: false, reason: 'non_terminal_event' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    const finalStatus = event === 'disbursement.completed' ? 'completed' : 'failed'
    const disbursementId = payload.disbursement_id || payload.id || null

    console.log(`[senepay-payout-webhook] external_id=${externalId} event=${event}`)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: rpcError } = await supabase.rpc('finalize_reservation_payout', {
      p_external_id: externalId,
      p_status: finalStatus,
      p_disbursement_id: disbursementId,
      p_raw_response: payload
    })

    if (rpcError) {
      console.error('[senepay-payout-webhook] Erreur finalize_reservation_payout:', rpcError.message)
      return new Response(JSON.stringify({ error: 'Erreur interne' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }

    if (finalStatus === 'failed') {
      // Intervention manuelle requise — jamais de retry automatique
      // (PROVIDER_ERROR/PROVIDER_EXCEPTION l'interdisent explicitement).
      console.error(`[senepay-payout-webhook] PAYOUT ÉCHOUÉ — intervention manuelle requise. external_id=${externalId} error_code=${payload.error_code ?? 'inconnu'}`)
    }

    return new Response(JSON.stringify({ success: true, handled: true, status: finalStatus }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[senepay-payout-webhook] Erreur:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
