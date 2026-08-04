// supabase/functions/payment-webhook/index.ts
//
// Webhook UnitechPay (Wave / Orange Money). Remplace l'ancienne intégration
// Hub2/PayTech câblée sur cette même fonction.
//
// Déploiement OBLIGATOIRE avec --no-verify-jwt : UnitechPay n'envoie aucun
// JWT Supabase, uniquement le header x-unitechpay-signature.
//
// Point critique : la signature HMAC est calculée par UnitechPay sur le
// corps BRUT de la requête. On lit donc `await req.text()` et on calcule le
// HMAC sur cette chaîne AVANT tout JSON.parse — parser puis re-sérialiser
// changerait l'ordre des clés / l'espacement, et la signature ne
// correspondrait plus jamais.
//
// Versement automatique au gérant (migration 20260804170000) : quand
// handle_unitech_webhook confirme un paiement de réservation, on déclenche
// juste après un retrait UnitechPay (`withdraw_funds`) vers le compte
// Wave/Orange Money du gérant, pour le montant net de la commission
// plateforme déjà verrouillée par calculate_commission(). Ce déclenchement
// est best-effort et ne doit JAMAIS faire échouer la réponse 200 renvoyée
// à UnitechPay pour l'évènement de paiement d'origine — toute erreur ici
// est loguée, le versement reste visible en base (status='pending') pour
// reprise manuelle. ⚠️ Le format exact de la réponse withdraw_funds n'a
// pas pu être vérifié depuis cette session (pas de sandbox/doc complète
// disponible) : `disbursement_id` est déduit au mieux des champs les plus
// plausibles (`data.disbursement_id`/`data.transaction_id`/`data.reference`)
// — à confirmer contre une vraie réponse UnitechPay et ajuster si besoin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UNITECHPAY_API_KEY = Deno.env.get("UNITECHPAY_API_KEY")!;
const UNITECHPAY_BASE_URL = "https://api.unitech.sn/api";
const PAYOUT_TIMEOUT_MS = 25_000;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparaison à temps constant : évite qu'un attaquant déduise la
// signature attendue octet par octet via le temps de réponse d'un `===`.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(signature);
}

// deno-lint-ignore no-explicit-any
async function callUnitechPayWithdraw(payload: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAYOUT_TIMEOUT_MS);
  try {
    const res = await fetch(`${UNITECHPAY_BASE_URL}?action=withdraw_funds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UNITECHPAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Déclenche le versement gérant après confirmation d'un paiement de
// réservation. Best-effort : ne lance jamais d'exception vers l'appelant,
// toute erreur est loguée et laisse la ligne gerant_payouts en 'pending'
// pour reprise manuelle (voir en-tête de fichier).
async function triggerReservationPayout(reservationId: string): Promise<void> {
  const { data: payout, error: payoutError } = await serviceClient.rpc(
    "process_reservation_payout",
    { p_reservation_id: reservationId },
  );

  if (payoutError) {
    console.error(`payment-webhook: process_reservation_payout a échoué pour la réservation ${reservationId}`, payoutError);
    return;
  }

  if (!payout?.handled) {
    // Cas normaux à ne pas traiter comme des erreurs : déjà traité (webhook
    // relivré), gerant_payout_info manquant (loggé côté SQL pour suivi admin).
    console.warn(`payment-webhook: payout non déclenché pour la réservation ${reservationId} (${payout?.reason})`);
    return;
  }

  // deno-lint-ignore no-explicit-any
  let unitechData: any;
  try {
    unitechData = await callUnitechPayWithdraw({
      amount: payout.amount,
      method: payout.operator,
      account: payout.phone,
    });
  } catch (err) {
    console.error(`payment-webhook: échec réseau withdraw_funds pour le versement ${payout.external_id}`, err);
    return;
  }

  if (unitechData?.success !== true) {
    console.error(`payment-webhook: refus UnitechPay sur withdraw_funds pour le versement ${payout.external_id}`, JSON.stringify(unitechData));
    return;
  }

  const data = unitechData.data ?? {};
  const disbursementId: string | undefined = data.disbursement_id ?? data.transaction_id?.toString() ?? data.reference;

  const { error: markError } = await serviceClient.rpc("mark_payout_submitted", {
    p_external_id: payout.external_id,
    p_disbursement_id: disbursementId ?? null,
    p_raw_response: unitechData,
  });

  if (markError) {
    console.error(`payment-webhook: mark_payout_submitted a échoué pour le versement ${payout.external_id}`, markError);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  const raw = await req.text();
  const signature = (req.headers.get("x-unitechpay-signature") ?? "").trim();

  if (!signature) {
    return new Response("Signature manquante", { status: 401 });
  }

  const expectedSignature = await hmacSha256Hex(UNITECHPAY_API_KEY, raw);

  if (!timingSafeEqual(signature.toLowerCase(), expectedSignature.toLowerCase())) {
    return new Response("Signature invalide", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("JSON invalide", { status: 400 });
  }

  const { data, error } = await serviceClient.rpc("handle_unitech_webhook", { p_payload: payload });

  if (error) {
    // Erreur SQL réelle (pas une décision métier) : laisser UnitechPay retenter.
    return new Response("Erreur serveur", { status: 500 });
  }

  // Versement automatique au gérant : uniquement pour une confirmation de
  // paiement de réservation (kind='reservation', statut='confirmee').
  // Ne bloque jamais la réponse à UnitechPay — voir triggerReservationPayout.
  if (data?.kind === "reservation" && data?.statut === "confirmee" && data?.reservation_id) {
    try {
      await triggerReservationPayout(data.reservation_id as string);
    } catch (err) {
      console.error("payment-webhook: erreur inattendue lors du déclenchement du payout", err);
    }
  }

  // Cas métier (paiement inconnu, doublon, montant incohérent, évènement
  // ignoré...) : toujours 200, pour ne jamais provoquer de retry infini
  // côté UnitechPay.
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
