/**
 * Browser-side client for the collector. Talks only to /api/collect/* (the
 * password-gated proxy, app/api/collect/[...path]/route.ts), never to the backend.
 *
 * The request body is built here from the form fields with the same omission rules
 * production's `buildPersonalization` uses: language "auto" and an unknown location
 * are left out of the payload, not sent empty — the backend rejects both.
 */
import type { Source } from '@/lib/types'
import type { CollectorFields } from './fields'

const BASE = '/api/collect'

export type CollectorModel = 'best' | 'luna'
export const COLLECTOR_MODELS: { value: CollectorModel; label: string }[] = [
  { value: 'best', label: 'Best (production default)' },
  { value: 'luna', label: 'Luna' },
]

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** FastAPI errors arrive as {detail: string | {message} | [{loc, msg}]}; make one line of it. */
async function failure(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`
  try {
    const body = await res.json()
    const d = body?.detail ?? body?.error
    if (typeof d === 'string') message = d
    else if (Array.isArray(d)) message = d.map((e: any) => `${(e.loc ?? []).slice(1).join('.')}: ${e.msg}`).join('; ')
    else if (d?.message) message = d.message
  } catch {}
  return new ApiError(res.status, message)
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/collect/login'
    throw await failure(res)
  }
  return res.json()
}

export interface GenerateBody {
  query: string
  thread_id: string
  personalization: { user_local_datetime: string; user_location?: string; response_language?: string }
  model: CollectorModel
  memory?: string
}

export function toGenerateBody(args: {
  query: string
  threadId: string
  fields: CollectorFields
  model: CollectorModel
  includeMemory: boolean
}): GenerateBody {
  const { fields } = args
  const personalization: GenerateBody['personalization'] = { user_local_datetime: fields.datetime }
  if (fields.location.trim()) personalization.user_location = fields.location.trim()
  if (fields.language) personalization.response_language = fields.language
  const body: GenerateBody = {
    query: args.query,
    thread_id: args.threadId,
    personalization,
    model: args.model,
  }
  if (args.includeMemory && fields.memory.trim()) body.memory = fields.memory
  return body
}

export interface ThreadState {
  is_generating: boolean
  is_locked: boolean
  n_turns: number
  turn: number
  complete: boolean
  /** The newest answer exactly as the checkpoint holds it — what a training row ends on. */
  final_text: string | null
  turns: { turn: number; model: string | null; personalization: Record<string, string>; memory: string | null; edited: boolean }[]
}

export interface SubmitResult {
  status: 'accepted' | 'pending'
  id: number
  edited: boolean
  turn: number
}

export const createThread = () => json<{ thread_id: string }>('threads', { method: 'POST', body: '{}' }).then((r) => r.thread_id)
export const getState = (id: string) => json<ThreadState>(`threads/${id}/state`)
export const saveFinal = (id: string, text: string) =>
  json<{ status: string; turn: number; changed: boolean }>(`threads/${id}/final`, { method: 'PUT', body: JSON.stringify({ text }) })
export const submitThread = (id: string, note?: string) =>
  json<SubmitResult>(`threads/${id}/submit`, { method: 'POST', body: JSON.stringify({ note: note || null }) })
export const stopThread = (id: string) => json(`threads/${id}/stop`, { method: 'POST', body: '{}' })
export const discardThread = (id: string) => json(`threads/${id}`, { method: 'DELETE' })

// ── the SSE stream ──────────────────────────────────────────────────────────

/** The subset of the backend's wire protocol (core/stream.py) the page shows. */
export type CollectEvent =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; tool: string; args: unknown }
  | { type: 'sources'; sources: Source[] }
  | { type: 'widget'; widget: string; data: unknown }
  | { type: 'error'; code?: string; message?: string; request_id?: string }
  | { type: 'done' }
  | { type: 'stopped' }
  | { type: 'other'; raw: any }

function parseLine(line: string): CollectEvent | null {
  const t = line.trim()
  if (!t.startsWith('data: ')) return null
  try {
    const ev = JSON.parse(t.slice(6))
    switch (ev?.type) {
      case 'text': case 'reasoning': case 'tool_call': case 'sources':
      case 'widget': case 'error': case 'done': case 'stopped':
        return ev
      default:
        return { type: 'other', raw: ev }
    }
  } catch {
    return null
  }
}

/** Yield events from an SSE response until the server closes it. */
export async function* readEvents(res: Response): AsyncGenerator<CollectEvent> {
  const reader = res.body?.getReader()
  if (!reader) throw new ApiError(502, 'The response had no body.')
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const ev = parseLine(line)
        if (ev) yield ev
      }
    }
    const tail = parseLine(buffer)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

export async function openGenerate(body: GenerateBody, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/collect/login'
    throw await failure(res)
  }
  return res
}

/** Re-attach to a generation whose stream dropped (a proxy timeout, a flaky network). */
export async function openReconnect(threadId: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(`${BASE}/threads/${threadId}/stream`, { signal })
  if (!res.ok) throw await failure(res)
  return res
}
