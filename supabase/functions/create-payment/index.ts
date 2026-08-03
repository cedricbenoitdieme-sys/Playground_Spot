// supabase/functions/create-payment/index.ts
//
// Initie un paiement mobile (Wave / Orange Money / Orange Maxit / Orange QR)
// via UnitechPay pour PlaygroundSpot. Trois usages distingués par le corps
// de la requête :
//
//   Réservation (par défaut) :
//     { creneau_id: string; methode: 'wave'|'orange_money'|'orange_maxit'|'orange_qr'; telephone: string }
//   Abonnement gérant (plan payant) :
//     { plan: string; billing_period: 'monthly'|'annual'; payment_method: string; customer_number: string }
//   Boost de visibilité :
//     { payment_type: 'boost'; terrain_id: string; budget_fcfa: number; duree_jours: number; payment_method: string; customer_number: string }
//
// Le montant ne provient JAMAIS du corps de la requête client : il est
// recalculé côté serveur par creer_reservation_en_attente / plan_limits /
// create_pending_boost. La référence enregistrée comme provider_reference /
// unitech_reference est TOUJOURS celle renvoyée par UnitechPay (data.reference
// dans sa réponse), jamais une référence générée par nous — y compris pour
// abonnements/boosts, dont les RPC create_pending_* posent un placeholder
// ('SUB-xxx'/'BOOST-xxx') immédiatement remplacé ici dès que UnitechPay a
// répondu, seul moyen de matcher le webhook plus tard.
//
// Authentification obligatoire pour les trois usages (vérifiée une seule
// fois en tête de Deno.serve), suivie d'un rate limit (5 appels / 10 min /
// utilisateur, via la RPC check_rate_limit déjà existante). Les origines
// CORS acceptées sont la prod, les previews Vercel et le dev local — toute
// autre origine reçoit quand même une réponse mais avec l'origine par
// défaut (SITE_URL), donc pas exploitable en navigateur.
//
// Réponses (succès) :
//   Réservation  : { reservation_id, reference, montant, payment_url, qr_code, deep_links, expire_dans }
//   Abonnement   : { subscription_id, reference, montant, payment_url, qr_code, deep_links }
//   Boost        : { boost_id, reference, montant, payment_url, deep_links }
//   Erreur       : { error: string; code?: string }

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UNITECHPAY_API_KEY = Deno.env.get("UNITECHPAY_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://playground-spot.vercel.app";

const UNITECHPAY_BASE_URL = "https://api.unitech.sn/api";
const PAYMENT_TIMEOUT_MS = 25_000;
const PAIEMENT_EXPIRE_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = "10 minutes";

// Origines autorisées en plus de SITE_URL : previews Vercel (playground-spot-*.vercel.app)
// et dev local (Vite/CRA par défaut). Toute autre origine retombe sur SITE_URL
// dans Access-Control-Allow-Origin, donc invisible en navigateur pour l'appelant.
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/playground-spot\.vercel\.app$/,
  /^https:\/\/playground-spot-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:5173$/,
  /^http:\/\/localhost:3000$/,
];

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin)) ? origin : SITE_URL;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

type Responder = (body: unknown, status: number) => Response;

function buildJsonResponse(corsHeaders: Record<string, string>): Responder {
  return (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// Actions UnitechPay par méthode. Corrigé (2026-08-03) : create_orange_om
// n'est pas le bon endpoint pour Orange — la spécification retenue est
// Max It (create_orange_maxit), qui renvoie deux deep links (MAXIT et OM)
// couvrant à la fois les clients sur l'app Max It et sur l'ancienne app OM.
// orange_money et orange_maxit restent deux valeurs de méthode distinctes
// côté UI (ChoixPaiement.jsx) mais pointent vers le même endpoint réel.
const ACTION_BY_METHODE: Record<string, string> = {
  wave: "create_wave_payment",
  orange_money: "create_orange_maxit",
  orange_maxit: "create_orange_maxit",
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

// billing_period (frontend, anglais) -> cycle_facturation (enum Postgres, français).
const CYCLE_BY_BILLING_PERIOD: Record<string, string> = {
  monthly: "mensuel",
  annual: "annuel",
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

// deno-lint-ignore no-explicit-any
async function callUnitechPay(methode: string, payload: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);
  try {
    const res = await fetch(`${UNITECHPAY_BASE_URL}?action=${ACTION_BY_METHODE[methode]}`, {
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

async function handleReservationPayment(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  body: { creneau_id?: string; methode?: string; telephone?: string },
  jsonResponse: Responder,
): Promise<Response> {
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

    unitechData = await callUnitechPay(methode, unitechPayload);
  } catch (err) {
    console.error(`create-payment[reservation/${methode}]: échec réseau UnitechPay`, err);
    await cancelReservation("Échec technique de l'appel au prestataire de paiement");
    return jsonResponse({ error: "Le prestataire de paiement est indisponible, réessayez." }, 502);
  }

  if (unitechData?.success !== true) {
    console.error(`create-payment[reservation/${methode}]: refus UnitechPay`, JSON.stringify(unitechData));
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
}

async function handleSubscriptionPayment(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  jsonResponse: Responder,
): Promise<Response> {
  const planId = typeof body.plan === "string" ? body.plan : "";
  const billingPeriod = typeof body.billing_period === "string" ? body.billing_period : "";
  const methode = typeof body.payment_method === "string" ? body.payment_method : "";
  const numeroTel = normalizePhone(body.customer_number);

  const cycle = CYCLE_BY_BILLING_PERIOD[billingPeriod];
  if (!planId) {
    return jsonResponse({ error: "Plan requis." }, 400);
  }
  if (!cycle) {
    return jsonResponse({ error: "Période de facturation invalide." }, 400);
  }
  if (!methode || !(methode in ACTION_BY_METHODE)) {
    return jsonResponse({ error: "Méthode de paiement invalide." }, 400);
  }
  if (!numeroTel) {
    return jsonResponse({ error: "Numéro de téléphone invalide (format sénégalais attendu)." }, 400);
  }

  // ── 1. Création de la souscription 'pending' (montant calculé côté
  // serveur depuis plan_limits) ─────────────────────────────────────
  const { data: pending, error: pendingError } = await userClient.rpc("create_pending_subscription", {
    p_gerant_id: userId,
    p_plan_id: planId,
    p_cycle: cycle,
    p_phone_number: numeroTel,
  });

  if (pendingError) {
    return jsonResponse({ error: pendingError.message || "Impossible de créer la souscription." }, 400);
  }

  const subscriptionId: string = pending.subscription_id;
  const montant: number = pending.montant;

  // Sortie anticipée à partir d'ici -> repasser la souscription à 'revoked'
  // pour libérer idx_one_pending_subscription_per_gerant (sinon le gérant
  // ne peut plus jamais retenter).
  const cancelSubscription = async () => {
    await serviceClient
      .from("subscriptions")
      .update({ status: "revoked" })
      .eq("id", subscriptionId)
      .eq("status", "pending");
  };

  // ── 2. Appel UnitechPay ──────────────────────────────────────────────
  const description = `Abonnement ${planId} (${cycle}) PlaygroundSpot`;

  // deno-lint-ignore no-explicit-any
  let unitechData: any;
  try {
    unitechData = await callUnitechPay(methode, {
      amount: montant,
      customer_number: numeroTel,
      description,
      callback_success: `${SITE_URL}/paiement/succes`,
      callback_cancel: `${SITE_URL}/paiement/annule`,
    });
  } catch (err) {
    console.error(`create-payment[subscription/${methode}]: échec réseau UnitechPay`, err);
    await cancelSubscription();
    return jsonResponse({ error: "Le prestataire de paiement est indisponible, réessayez." }, 502);
  }

  if (unitechData?.success !== true) {
    console.error(`create-payment[subscription/${methode}]: refus UnitechPay`, JSON.stringify(unitechData));
    await cancelSubscription();
    return jsonResponse({ error: "Le paiement n'a pas pu être initié." }, 502);
  }

  const data = unitechData.data ?? {};
  const reference: string | undefined = data.reference;
  if (!reference) {
    await cancelSubscription();
    return jsonResponse({ error: "Réponse invalide du prestataire de paiement." }, 502);
  }

  // ── 3. Remplace le placeholder posé par create_pending_subscription par
  // la vraie référence UnitechPay — c'est elle qui reviendra dans le
  // webhook (handle_unitech_webhook cherche par unitech_reference).
  const { error: refError } = await serviceClient
    .from("subscriptions")
    .update({ unitech_reference: reference })
    .eq("id", subscriptionId)
    .eq("status", "pending");

  if (refError) {
    await cancelSubscription();
    return jsonResponse({ error: "Erreur lors de l'enregistrement du paiement." }, 500);
  }

  return jsonResponse(
    {
      subscription_id: subscriptionId,
      reference,
      montant,
      payment_url: data.payment_url ?? null,
      qr_code: data.qr_code ?? data.qr_image ?? null,
      deep_links: data.deep_links ?? null,
    },
    200,
  );
}

async function handleBoostPayment(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  jsonResponse: Responder,
): Promise<Response> {
  const terrainId = typeof body.terrain_id === "string" ? body.terrain_id : "";
  const budgetFcfa = Number(body.budget_fcfa);
  const dureeJours = Number(body.duree_jours);
  const methode = typeof body.payment_method === "string" ? body.payment_method : "";
  const numeroTel = normalizePhone(body.customer_number);

  if (!terrainId) {
    return jsonResponse({ error: "Terrain non spécifié." }, 400);
  }
  if (!Number.isFinite(budgetFcfa) || !Number.isFinite(dureeJours)) {
    return jsonResponse({ error: "Budget ou durée invalide." }, 400);
  }
  if (!methode || !(methode in ACTION_BY_METHODE)) {
    return jsonResponse({ error: "Méthode de paiement invalide." }, 400);
  }
  if (!numeroTel) {
    return jsonResponse({ error: "Numéro de téléphone invalide (format sénégalais attendu)." }, 400);
  }

  // ── 1. Création du boost 'en_attente' (validations budget/durée/plan
  // déjà faites dans la RPC) ───────────────────────────────────────────
  const { data: pending, error: pendingError } = await userClient.rpc("create_pending_boost", {
    p_gerant_id: userId,
    p_terrain_id: terrainId,
    p_montant: budgetFcfa,
    p_duree_jours: dureeJours,
  });

  if (pendingError) {
    return jsonResponse({ error: pendingError.message || "Impossible de créer le boost." }, 400);
  }

  const boostId: string = pending.boost_id;
  const montant: number = pending.montant;

  const cancelBoost = async () => {
    await serviceClient
      .from("visibility_boosts")
      .update({ statut: "annule" })
      .eq("id", boostId)
      .eq("statut", "en_attente");
  };

  // ── 2. Appel UnitechPay ──────────────────────────────────────────────
  const description = `Boost visibilité PlaygroundSpot (terrain ${terrainId})`;

  // deno-lint-ignore no-explicit-any
  let unitechData: any;
  try {
    unitechData = await callUnitechPay(methode, {
      amount: montant,
      customer_number: numeroTel,
      description,
      callback_success: `${SITE_URL}/paiement/succes`,
      callback_cancel: `${SITE_URL}/paiement/annule`,
    });
  } catch (err) {
    console.error(`create-payment[boost/${methode}]: échec réseau UnitechPay`, err);
    await cancelBoost();
    return jsonResponse({ error: "Le prestataire de paiement est indisponible, réessayez." }, 502);
  }

  if (unitechData?.success !== true) {
    console.error(`create-payment[boost/${methode}]: refus UnitechPay`, JSON.stringify(unitechData));
    await cancelBoost();
    return jsonResponse({ error: "Le paiement n'a pas pu être initié." }, 502);
  }

  const data = unitechData.data ?? {};
  const reference: string | undefined = data.reference;
  if (!reference) {
    await cancelBoost();
    return jsonResponse({ error: "Réponse invalide du prestataire de paiement." }, 502);
  }

  // ── 3. Remplace le placeholder posé par create_pending_boost par la
  // vraie référence UnitechPay (même raisonnement que pour l'abonnement).
  const { error: refError } = await serviceClient
    .from("visibility_boosts")
    .update({ unitech_reference: reference })
    .eq("id", boostId)
    .eq("statut", "en_attente");

  if (refError) {
    await cancelBoost();
    return jsonResponse({ error: "Erreur lors de l'enregistrement du paiement." }, 500);
  }

  return jsonResponse(
    {
      boost_id: boostId,
      reference,
      montant,
      payment_url: data.payment_url ?? null,
      deep_links: data.deep_links ?? null,
    },
    200,
  );
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const jsonResponse = buildJsonResponse(corsHeaders);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  // Client "user" : hérite du JWT de l'appelant, soumis au RLS — sert
  // uniquement à créer la réservation/souscription/boost via les RPC
  // sécurisées.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  // Client service_role : contourne le RLS — sert à tracer/corriger le
  // paiement et, en cas d'échec après ce point, annuler ce qui a été créé.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Authentification obligatoire pour les trois usages : vérifiée une
  // seule fois ici plutôt que dans chaque handler.
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: "Authentification requise." }, 401);
  }

  // Rate limit : 5 tentatives / 10 min / utilisateur, tous types de
  // paiement confondus. Une panne de check_rate_limit elle-même (RPC
  // indisponible) ne doit pas bloquer les paiements : on logue et on
  // laisse passer plutôt que de transformer une panne interne en 500
  // pour tous les utilisateurs.
  const { data: allowed, error: rateLimitError } = await userClient.rpc("check_rate_limit", {
    p_identifier: user.id,
    p_action: "create-payment",
    p_max_attempts: RATE_LIMIT_MAX_ATTEMPTS,
    p_window: RATE_LIMIT_WINDOW,
  });
  if (rateLimitError) {
    console.error("check_rate_limit indisponible:", rateLimitError.message);
  } else if (allowed === false) {
    return jsonResponse({ error: "Trop de tentatives, réessayez dans quelques minutes." }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
  }

  if (body.payment_type === "boost") {
    return handleBoostPayment(userClient, serviceClient, body, user.id, jsonResponse);
  }
  if (typeof body.plan === "string" && body.plan) {
    return handleSubscriptionPayment(userClient, serviceClient, body, user.id, jsonResponse);
  }
  return handleReservationPayment(userClient, serviceClient, body, jsonResponse);
});
