// Edge Function : chatbot-query — remplace la simulation par mots-clés
// codée en dur dans ChatWidget.jsx (aucune IA n'était réellement
// branchée auparavant) par un vrai appel à l'API Gemini, avec un system
// prompt construit dynamiquement à partir de bot_knowledge_base (contenu
// statique, éditable sans redéployer) + plan_limits (tarifs/commissions
// en direct, toujours à jour, jamais dupliqués en dur dans le prompt).
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? ""
// Modèle configurable via secret pour pouvoir changer sans redéployer le
// code (ex. passer à une version plus récente de Gemini) ; valeur par
// défaut raisonnable pour un bot de support (rapide, peu coûteux).
const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function buildSystemPrompt(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: sections } = await supabase
    .from('bot_knowledge_base')
    .select('title, content')
    .eq('active', true)
    .order('ordre', { ascending: true })

  const { data: plans } = await supabase
    .from('plan_limits')
    .select('plan_id, nom, prix_mensuel, prix_annuel, max_terrains, max_reservations_mois, commission_rate, pdf_export, dashboard_avance, multi_sites')
    .order('prix_mensuel', { ascending: true })

  const knowledgeBlock = (sections || [])
    .map(s => `### ${s.title}\n${s.content}`)
    .join('\n\n')

  const plansBlock = (plans || [])
    .map(p => {
      const terrains = p.max_terrains === null ? 'illimité' : `${p.max_terrains} terrain(s) max`
      const resas = p.max_reservations_mois === null ? 'illimitées' : `${p.max_reservations_mois}/mois max`
      const annuel = p.prix_annuel ? `, ${p.prix_annuel.toLocaleString('fr-FR')} FCFA/an (-25%)` : ' (pas d\'option annuelle)'
      const features = [
        p.pdf_export ? 'export PDF' : null,
        p.dashboard_avance ? 'dashboard avancé' : null,
        p.multi_sites ? 'multi-sites' : null,
      ].filter(Boolean).join(', ') || 'aucune fonctionnalité avancée'
      return `- ${p.nom} : ${p.prix_mensuel.toLocaleString('fr-FR')} FCFA/mois${annuel} — ${terrains}, réservations ${resas}, commission ${p.commission_rate}% — ${features}. Boost de visibilité ${p.plan_id === 'free' ? 'NON disponible' : 'disponible'}.`
    })
    .join('\n')

  return `${knowledgeBlock}

### Grille tarifaire actuelle des plans gérants (données en direct, toujours à jour — ne jamais donner d'autres chiffres que ceux-ci)
${plansBlock}

### Règles impératives
- Ne réponds JAMAIS avec des chiffres/tarifs différents de ceux fournis ci-dessus.
- Si la question sort du cadre de PlaygroundSpot, ou concerne un compte/une réservation/un paiement précis auquel tu n'as pas accès, dis-le explicitement et invite à basculer sur l'onglet "Admin" du chat pour un support humain — n'invente jamais de réponse.
- Réponses concises (quelques phrases), adaptées à un chat, pas un essai.`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405)
  }

  if (!geminiApiKey) {
    console.error('[chatbot-query] GEMINI_API_KEY non configurée')
    return json({ error: 'Chatbot non configuré' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json()
    const { message, history } = body as { message?: string; history?: { role: 'user' | 'model'; text: string }[] }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return json({ error: 'message requis' }, 400)
    }
    if (message.length > 2000) {
      return json({ error: 'Message trop long (max 2000 caractères)' }, 400)
    }

    // Identifiant pour le rate limit : l'utilisateur authentifié si possible,
    // sinon l'IP (bot potentiellement accessible sans connexion).
    const authHeader = req.headers.get('Authorization')
    let rateLimitId = req.headers.get('x-forwarded-for') || 'anonymous'
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (user) rateLimitId = user.id
    }

    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_identifier: rateLimitId,
      p_action: 'chatbot_query',
      p_max_attempts: 20,
      p_window: '10 minutes'
    })
    if (rlError) {
      console.error('[chatbot-query] Erreur rate limit:', rlError.message)
    } else if (!allowed) {
      return json({ error: 'Trop de messages envoyés. Réessaie dans quelques minutes.' }, 429)
    }

    const systemPrompt = await buildSystemPrompt(supabase)

    const contents = [
      ...(history || []).slice(-10).map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: message }] }
    ]

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
        })
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error(`[chatbot-query] Erreur API Gemini (${geminiRes.status}):`, errText)
      return json({ error: 'Le bot est momentanément indisponible, réessaie plus tard.' }, 502)
    }

    const geminiData = await geminiRes.json()
    const replyText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!replyText) {
      console.error('[chatbot-query] Réponse Gemini vide/inattendue:', JSON.stringify(geminiData))
      return json({ error: 'Le bot n\'a pas pu générer de réponse, réessaie.' }, 502)
    }

    return json({ reply: replyText.trim() })

  } catch (err) {
    console.error('[chatbot-query] Erreur:', err instanceof Error ? err.message : err)
    return json({ error: 'Erreur interne du serveur' }, 500)
  }
})
