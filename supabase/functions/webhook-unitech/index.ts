// Edge Function : webhook UnitechPay UNIQUE pour PlaygroundSpot — gère les
// TROIS types de paiement (abonnement gérant, boost de visibilité, ET
// réservation joueur), distingués par le préfixe de `reference` :
// 'SUB-' (create_pending_subscription), 'BOOST-' (create_pending_boost),
// tout le reste (ex: 'PS-', créé par backend/routes/payments.js) → paiement
// de réservation, délégué à handle_payment_webhook.
//
// Un compte marchand UnitechPay n'accepte qu'UNE SEULE URL de webhook
// enregistrée (configurée manuellement dans leur dashboard, Paramètres →
// Webhooks — pas un champ par appel à create_wave_payment/create_orange_maxit,
// qui n'est d'ailleurs pas documenté comme paramètre accepté). D'où la
// fusion ici plutôt que de garder un endpoint séparé par type de paiement
// — même modèle que Sama Boutik (autre SaaS du même compte, déjà en
// production), dont le webhook UnitechPay pointe vers une unique edge
// function équivalente à celle-ci.
//
// Vérification de signature HMAC-SHA256 obligatoire (fail-closed) — les
// webhooks Express historiques (api/index.js, backend/server.js,
// backend/routes/webhooks.js) restent en place mais ne reçoivent plus
// aucun trafic UnitechPay une fois cette URL enregistrée comme SEULE URL
// du compte marchand PlaygroundSpot.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
// Doc officielle UnitechPay : "Votre clé API est utilisée comme secret de
// signature" — même règle que les webhooks Express (api/index.js,
// backend/server.js, backend/routes/webhooks.js), qui retombent déjà sur
// UNITECH_API_KEY. UNITECH_WEBHOOK_SECRET reste un override explicite si
// UnitechPay confirme un jour un secret distinct pour ce compte marchand.
const webhookSecret = Deno.env.get("UNITECH_WEBHOOK_SECRET") || Deno.env.get("UNITECH_API_KEY") || ""

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
    // UnitechPay), activate_subscription()/activate_boost() ont leur EXECUTE
    // restreint à service_role.
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Le préfixe de reference (posé à la création : 'SUB-' pour un
    // abonnement, 'BOOST-' pour un boost de visibilité) détermine quelle
    // table mettre à jour. Tout le reste (ex: 'PS-') = paiement de
    // réservation joueur.
    const isBoost = reference.startsWith('BOOST-')
    const isSubscription = reference.startsWith('SUB-')

    if (isBoost || isSubscription) {
      const rpcName = isBoost ? 'activate_boost' : 'activate_subscription'
      const rpcArgs = isBoost
        ? { p_unitech_reference: reference, p_status: internalStatus }
        : {
            p_unitech_reference: reference,
            p_status: internalStatus,
            p_phone_number: null // absent du payload UnitechPay : ne pas écraser le numéro déjà enregistré
          }

      const { data: result, error: rpcError } = await supabase.rpc(rpcName, rpcArgs)

      if (rpcError) {
        console.error(`[webhook-unitech] Erreur ${rpcName}:`, rpcError.message)
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
    }

    // Paiement de réservation (joueur) — handle_payment_webhook recherche
    // par ref_externe dans `paiements`, confirme la réservation associée,
    // idempotent (ne transitionne que depuis 'en_attente', migration
    // 20260725170000_reservation_payment_robustness.sql).
    const { error: reservationRpcError } = await supabase.rpc('handle_payment_webhook', {
      p_provider: 'unitechpay',
      p_payload: payload,
      p_reference: reference,
      p_status: internalStatus
    })

    if (reservationRpcError) {
      console.error('[webhook-unitech] Erreur handle_payment_webhook:', reservationRpcError.message)
      return new Response(JSON.stringify({ error: 'Erreur interne' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`[webhook-unitech] Réservation traitée pour reference=${reference}`)
    return new Response(JSON.stringify({ success: true, handled: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[webhook-unitech] Erreur:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
