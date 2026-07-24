import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variables Supabase manquantes dans .env.local')
}

const AUTH_STORAGE_KEY = 'playgroundspot-auth'
// Un JWT normal fait 1-2 Ko. Un token plus gros que ça indique une session
// corrompue (ex: avatar en base64 injecté dans user_metadata), qui se fait
// rejeter par le edge network Supabase (400 "Request Header Or Cookie Too
// Large") et bloque la connexion. On la purge avant que le SDK ne l'utilise.
const MAX_STORED_SESSION_SIZE = 20_000
try {
  const stored = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (stored && stored.length > MAX_STORED_SESSION_SIZE) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
} catch (_) {}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// Rate Limiter
const rateLimitStore = new Map()
export const checkRateLimit = (action, maxRequests = 10, windowMs = 60_000) => {
  const now = Date.now()
  const key = action
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, [])
  }
  const timestamps = rateLimitStore.get(key)
  const validTimestamps = timestamps.filter(t => now - t < windowMs)
  rateLimitStore.set(key, validTimestamps)
  if (validTimestamps.length >= maxRequests) {
    const oldestValid = validTimestamps[0]
    const retryAfter = Math.ceil((oldestValid + windowMs - now) / 1000)
    return { allowed: false, retryAfter }
  }
  validTimestamps.push(now)
  return { allowed: true }
}

export const RATE_LIMITS = {
  login: { maxRequests: 10, windowMs: 60_000 },
  signup: { maxRequests: 3, windowMs: 300_000 },
  createReservation: { maxRequests: 5, windowMs: 60_000 },
  createPaiement: { maxRequests: 3, windowMs: 60_000 },
  updateProfile: { maxRequests: 5, windowMs: 60_000 },
}


