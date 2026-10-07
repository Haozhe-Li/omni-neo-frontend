/**
 * Session cookie for the password-protected /collect tool.
 *
 * One signed, httpOnly cookie: `<base64url(payload)>.<base64url(HMAC-SHA256)>`,
 * payload `{ a: annotator, e: expiry-ms }`. Web Crypto only, so the same code
 * runs in the middleware (proxy.ts, edge) and in route handlers (node).
 *
 * Why not a bare "logged in" cookie: the annotator name rides in it and becomes
 * the `X-Collector-Id` the backend partitions rows by, so it has to be something
 * the browser cannot set to anything it likes.
 *
 * Env:
 *   COLLECTOR_PASSWORD        shared password (login compares digests, constant time)
 *   COLLECTOR_SESSION_SECRET  HMAC key, >= 32 chars; change it to log everyone out
 *   COLLECTOR_API_KEY         the backend's key; used only server-side (app/api/collect)
 */

export const COLLECTOR_COOKIE = 'omni_collector'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

/** Same shape the backend accepts for X-Collector-Id (core/auth.py). */
export const ANNOTATOR_RE = /^[a-z0-9_-]{1,32}$/

const enc = new TextEncoder()

export interface CollectorSession {
  annotator: string
  expiresAt: number
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const pad = '='.repeat((4 - (s.length % 4)) % 4)
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

function secret(): string | null {
  const s = process.env.COLLECTOR_SESSION_SECRET
  return s && s.length >= 32 ? s : null
}

async function hmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey | null> {
  const s = secret()
  if (!s) return null
  return crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

export async function signSession(session: CollectorSession): Promise<string | null> {
  const key = await hmacKey('sign')
  if (!key) return null
  const payload = b64url(enc.encode(JSON.stringify({ a: session.annotator, e: session.expiresAt })))
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return `${payload}.${b64url(new Uint8Array(sig))}`
}

/** The session if the cookie value is authentic, unexpired and well-formed; else null. */
export async function verifySession(value: string | undefined | null): Promise<CollectorSession | null> {
  if (!value) return null
  const [payload, sig, ...rest] = value.split('.')
  if (!payload || !sig || rest.length) return null
  const key = await hmacKey('verify')
  const sigBytes = fromB64url(sig)
  if (!key || !sigBytes) return null
  // subtle.verify compares in constant time
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, enc.encode(payload))
  if (!ok) return null
  const bytes = fromB64url(payload)
  if (!bytes) return null
  try {
    const { a, e } = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof a !== 'string' || !ANNOTATOR_RE.test(a) || typeof e !== 'number' || e <= Date.now()) return null
    return { annotator: a, expiresAt: e }
  } catch {
    return null
  }
}

/** Constant-time string comparison via digests, so length is not leaked either. */
export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
