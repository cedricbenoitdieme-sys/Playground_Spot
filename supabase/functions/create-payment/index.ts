// supabase/functions/create-payment/index.ts
//
// Initie un paiement mobile (Wave / Orange Money / Orange Maxit / Orange QR)
// via UnitechPay pour une réservation PlaygroundSpot.
//
// Le montant ne provient JAMAIS du corps de la requête client : il est
// recalculé côté serveur par la RPC creer_reservation_en_attente
// (migration 20260802160000_unitechpay_integration.sql), qui verrouille le
// créneau et calcule le prix à partir de terrains.price / creneaux.
//
// Contrat d'interface (ne pas modifier sans coordonner avec le front) :
//   Requête  : { creneau_id: string; methode: 'wave'|'orange_money'|'orange_maxit'|'orange_qr'; telephone: string }
//   Réponse  : { reservation_id, reference, montant, payment_url, qr_code, deep_links, expire_dans }
//   Erreur   : { error: string; code?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UNITECHPAY_API_KEY = Deno.env.get("UNITECHPAY_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

const UNITECHPAY_BASE_URL = "https://api.unitech.sn/api";
const PAYMENT_TIMEOUT_MS = 25_000;
const PAIEMENT_EXPIRE_MINUTES = 15;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Actions UnitechPay par méthode. orange_maxit et orange_qr partagent
// respectivement create_orange_om et create_orange_qr : la doc UnitechPay
// v1.2.0 fournie ne liste pas d'action "create_orange_maxit" distincte —
// MAXIT est l'autre application cliente Orange, ouverte via le champ
// deep_links de la réponse create_orange_om.
const ACTION_BY_METHODE: Record<string, string> = {
  wave: "create_wave_payment",
  orange_money: "create_orange_om",
  orange_maxit: "create_orange_om",
  orange_qr: "create_orange_qr",
};

// mode_paiement (enum Postgres) n'a que 'wave' et 'orange_money' pour le
// paiement mobile — toutes les variantes Orange se rangent sous
// 'orange_money' en base.
const DB_MODE_BY_METHODE: Record<string, string> = {
  wave: "wave",
  orange_money: "orange_money",
  orange_maxit: "orange_money",
  orange_qr: "orange_money",
};

const RESERVATION_ERROR_MAP: Record<string, { status: number; message: string }> = {
  non_authentifie: { status: 401, message: "Authentification requise." },
  creneau_introuvable: { status: 404, message: "Ce créneau n'existe pas." },
  creneau_indisponible: { status: 409, message: "Ce créneau n'est plus disponible." },
  creneau_deja_reserve: { status: 409, message: "Ce créneau vient d'être réservé par quelqu'un d'autre." },
  creneau_passe: { status: 409, message: "Ce créneau est déjà passé." },
  terrain_inactif: { status: 409, message: "Ce terrain n'est pas disponible actuellement." },
  montant_invalide: { status: 400, message: "Montant de réservation invalide." },
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Format sénégalais : 7[0678]XXXXXXX (9 chiffres). Tolère le préfixe 221
// (avec ou sans +) et les espaces/tirets/points.
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let p = raw.trim().replace(/[\s.\-]/g, "");
  if (p.startsWith("+221")) p = p.slice(4);
  else if (p.startsWith("221") && p.length === 12) p = p.slice(3);
  if (!/^7[0678]\d{7}$/.test(p)) return null;
  return p;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  // Client "user" : hérite du JWT de l'appelant, soumis au RLS — sert
  // uniquement à créer la réservation via la RPC sécurisée.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Client service_role : contourne le RLS — sert à tracer le paiement et,
  // en cas d'échec après ce point, annuler la réservation créée.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { creneau_id?: string; methode?: string; telephone?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  const { creneau_id, methode, telephone } = body;

  if (!creneau_id || typeof creneau_id !== "string") {
    return jsonResponse({ error: "creneau_id requis." }, 400);
  }
  if (!methode || !(methode in ACTION_BY_METHODE)) {
    return jsonResponse({ error: "Méthode de paiement invalide." }, 400);
  }
  const numeroTel = normalizePhone(telephone);
  if (!numeroTel) {
    return jsonResponse({ error: "Numéro de téléphone invalide (format sénégalais attendu)." }, 400);
  }

  // ── 1. Création sécurisée de la réservation (prix calculé côté serveur) ──
  const { data: reservation, error: reservationError } = await userClient.rpc(
    "creer_reservation_en_attente",
    { p_creneau_id: creneau_id },
  );

  if (reservationError) {
    const code = (reservationError.message ?? "").trim();
    const mapped = RESERVATION_ERROR_MAP[code] ?? {
      status: 400,
      message: "Impossible de créer la réservation.",
    };
    return jsonResponse({ error: mapped.message, code }, mapped.status);
  }

  const reservationId: string = reservation.id;
  const montant: number = reservation.montant;

  // Toute sortie anticipée à partir d'ici DOIT annuler la réservation créée
  // ci-dessus, sinon le créneau reste verrouillé indéfiniment (le trigger
  // sync_creneau_statut ne le libère que sur passage à 'annulee').
  const cancelReservation = async (motif: string) => {
    await serviceClient
      .from("reservations")
      .update({ statut: "annulee", motif_annulation: motif })
      .eq("id", reservationId)
      .eq("statut", "en_attente");
  };

  // ── 2. Appel UnitechPay ──────────────────────────────────────────────
  const description = `Réservation PlaygroundSpot ${reservationId}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);

  // deno-lint-ignore no-explicit-any
  let unitechData: any;
  try {
    const unitechPayload: Record<string, unknown> = {
      amount: montant,
      customer_number: numeroTel,
      description,
      callback_success: `${SITE_URL}/paiement/succes`,
      callback_cancel: `${SITE_URL}/paiement/annule`,
    };
    // Seul create_orange_qr accepte une reference personnalisée d'après la
    // doc UnitechPay v1.2.0 — ne pas l'envoyer aux autres actions.
    if (methode === "orange_qr") {
      unitechPayload.reference = `PS-${reservationId}`;
    }

    const res = await fetch(`${UNITECHPAY_BASE_URL}?action=${ACTION_BY_METHODE[methode]}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UNITECHPAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(unitechPayload),
      signal: controller.signal,
    });
    unitechData = await res.json();
  } catch {
    await cancelReservation("Échec technique de l'appel au prestataire de paiement");
    return jsonResponse({ error: "Le prestataire de paiement est indisponible, réessayez." }, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (unitechData?.success !== true) {
    await cancelReservation("Refus du prestataire de paiement à l'initiation");
    return jsonResponse({ error: "Le paiement n'a pas pu être initié." }, 502);
  }

  const data = unitechData.data ?? {};
  const reference: string | undefined = data.reference;
  if (!reference) {
    await cancelReservation("Réponse UnitechPay sans référence exploitable");
    return jsonResponse({ error: "Réponse invalide du prestataire de paiement." }, 502);
  }

  // ── 3. Traçabilité du paiement ───────────────────────────────────────
  const expireAt = new Date(Date.now() + PAIEMENT_EXPIRE_MINUTES * 60_000).toISOString();
  const { error: paiementError } = await serviceClient.from("paiements").insert({
    reservation_id: reservationId,
    montant,
    mode: DB_MODE_BY_METHODE[methode],
    statut: "en_attente",
    ref_externe: reference,
    numero_tel: numeroTel,
    payment_url: data.payment_url ?? null,
    expire_at: expireAt,
  });

  if (paiementError) {
    await cancelReservation("Échec d'enregistrement du paiement");
    return jsonResponse({ error: "Erreur lors de l'enregistrement du paiement." }, 500);
  }

  return jsonResponse(
    {
      reservation_id: reservationId,
      reference,
      montant,
      payment_url: data.payment_url ?? null,
      // qr_code / deep_links : non documentés précisément dans la doc
      // UnitechPay v1.2.0 fournie (pas de sandbox disponible pour
      // vérifier la forme exacte de la réponse create_orange_qr / les
      // deep_links MAXIT+OM) — à confirmer/ajuster contre une vraie
      // réponse en production.
      qr_code: data.qr_code ?? data.qr_image ?? null,
      deep_links: data.deep_links ?? null,
      expire_dans: PAIEMENT_EXPIRE_MINUTES * 60,
    },
    200,
  );
});
