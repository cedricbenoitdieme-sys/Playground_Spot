import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import * as crypto from "https://deno.land/std@0.177.0/crypto/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Remplacez par votre clé secrète fournie par le prestataire de paiement (Wave/PayTech)
const WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") ?? "test-secret";

serve(async (req) => {
  // 1. Validation de la méthode
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const signature = req.headers.get("x-signature") || req.headers.get("wave-signature");

    // 2. Vérification de la signature cryptographique (Exemple avec HMAC SHA-256)
    /* 
    // Décommentez et adaptez selon le prestataire de paiement
    if (!signature) {
      throw new Error("Signature manquante");
    }
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    // Note: Logique de vérification complète à implémenter selon la doc du provider
    */

    // 3. Extraction des données du payload (Adaptable selon le provider)
    // Exemple PayTech / Wave
    const provider = payload.provider || "paytech";
    const reference = payload.reference || payload.ref_command; // Réf interne PlaygroundSpot
    const status = payload.status || payload.state; // 'success', 'failed', etc.

    if (!reference || !status) {
      throw new Error("Données de webhook invalides (référence ou statut manquant)");
    }

    // 4. Initialisation du client Supabase avec la clé de service (contourne RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 5. Appel de la fonction SQL sécurisée
    const { error: rpcError } = await supabase.rpc("handle_payment_webhook", {
      p_provider: provider,
      p_payload: payload,
      p_reference: reference,
      p_status: status
    });

    if (rpcError) {
      throw new Error(`Erreur DB: ${rpcError.message}`);
    }

    return new Response(JSON.stringify({ success: true, message: "Webhook traité" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Erreur Webhook:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
});
