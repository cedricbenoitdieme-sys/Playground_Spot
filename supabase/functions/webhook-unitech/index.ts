// supabase/functions/webhook-unitech/index.ts
//
// Webhook UnitechPay (Wave / Orange Money). C'est l'URL réellement
// enregistrée côté dashboard UnitechPay depuis le 31/07 (via configure_webhook,
// confirmé { success: true }) — un compte marchand UnitechPay n'accepte qu'une
// seule URL de callback. Identique à supabase/functions/payment-webhook/
// (qui reste déployée mais ne reçoit aucun trafic réel tant qu'UnitechPay
// n'est pas reconfiguré) : les deux délèguent à la même RPC
// handle_unitech_webhook, donc aucune divergence de comportement possible.
//
// Déploiement OBLIGATOIRE avec "Verify JWT with legacy secret" DÉSACTIVÉ :
// UnitechPay n'envoie aucun JWT Supabase, uniquement le header
// x-unitechpay-signature. Ce toggle se réinitialise à ON à chaque réédition
// de la fonction dans le Dashboard — le revérifier après toute modification.
//
// Point critique : la signature HMAC est calculée par UnitechPay sur le
// corps BRUT de la requête. On lit donc `await req.text()` et on calcule le
// HMAC sur cette chaîne AVANT tout JSON.parse — parser puis re-sérialiser
// changerait l'ordre des clés / l'espacement, et la signature ne
// correspondrait plus jamais.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UNITECHPAY_API_KEY = Deno.env.get("UNITECHPAY_API_KEY")!;

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

  // Cas métier (paiement inconnu, doublon, montant incohérent, évènement
  // ignoré...) : toujours 200, pour ne jamais provoquer de retry infini
  // côté UnitechPay.
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
