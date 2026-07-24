// Edge Function : webhook UnitechPay pour les paiements d'ABONNEMENT gérant
// (distinct du webhook de paiement de réservation existant, api/index.js
// POST /api/payment/unitech/webhook). Vérification de signature HMAC-SHA256
// obligatoire (fail-closed) — contrairement au webhook réservation actuel,
// qui est fail-open faute de UNITECH_WEBHOOK_SECRET configuré (voir
// supabase/PROD_READINESS_CHECKLIST.md §5) : ce nouveau webhook ne doit pas
// reproduire cette faille.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const webhookSecret = Deno.env.get("UNITECH_WEBHOOK_SECRET") ?? ""

async function computeHmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Comparaison en temps constant (évite une timing attack sur la signature).
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
    // Fail-closed : contrairement au webhook réservation existant, on ne
    // traite JAMAIS une requête si le secret n'est pas configuré côté serveur.
    console.error('[webhook-unitech] UNITECH_WEBHOOK_SECRET non configuré — requête rejetée')
    return new Response(JSON.stringify({ error: 'Webhook non configuré' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-unitechpay-signature')

    if (!signature) {
      console.warn('[webhook-unitech] Signature manquante')
      return new Response(JSON.stringify({ error: 'Signature manquante' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    const computedSignature = await computeHmacHex(webhookSecret, rawBody)
    if (!timingSafeEqualHex(computedSignature, signature)) {
      console.warn('[webhook-unitech] Signature invalide')
      return new Response(JSON.stringify({ error: 'Signature invalide' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    // Payload réel observé dans le dashboard UnitechPay (section Webhooks) :
    // {"event":"payment_success","reference":"TXN_...","amount":5000,"net_amount":4925,"status":"completed","timestamp":...}
    // Pas de numéro de téléphone dans ce payload — celui déjà enregistré à
    // l'étape create-payment (create_pending_subscription) est conservé.
    let payload: { event?: string; reference?: string; amount?: number; net_amount?: number; status?: string }
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response(JSON.stringify({ error: 'JSON malformé' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    const { event, reference, amount } = payload
    if (!reference || !event) {
      return new Response(JSON.stringify({ error: 'reference et event requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    // 'payment_success' confirmé par le dashboard UnitechPay. 'payment_completed'
    // gardé en repli au cas où la doc officielle (lien "Docs webhooks") en
    // mentionnerait une variante — à vérifier. Tout autre event
    // (payment_failed, payment_expired, ...) est traité comme un échec par
    // activate_subscription (statut → 'revoked').
    const internalStatus = (event === 'payment_success' || event === 'payment_completed') ? 'success' : 'failed'

    console.log(`[webhook-unitech] reference=${reference} event=${event} amount=${amount}`)

    // Client service_role : aucun contexte utilisateur ici (appel externe
    // UnitechPay), activate_subscription() a son EXECUTE restreint à service_role.
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: result, error: rpcError } = await supabase.rpc('activate_subscription', {
      p_unitech_reference: reference,
      p_status: internalStatus,
      p_phone_number: null // absent du payload UnitechPay : ne pas écraser le numéro déjà enregistré
    })

    if (rpcError) {
      console.error('[webhook-unitech] Erreur activate_subscription:', rpcError.message)
      return new Response(JSON.stringify({ error: 'Erreur interne' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }

    // handled=false = idempotence (référence inconnue/déjà traitée) : on
    // répond quand même 200 pour éviter une tempête de retries côté UnitechPay.
    console.log(`[webhook-unitech] Résultat:`, JSON.stringify(result))
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[webhook-unitech] Erreur:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
