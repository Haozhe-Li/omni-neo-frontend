// ── Wire protocol (mirrors backend core/stream.py) ─────────────────────────
export type AgentMode = 'fast' | 'pro'

export type WidgetKind = 'weather' | 'stock' | 'currency' | 'entity'

export interface SSEEvent {
  type:
    | 'widget'
    | 'reasoning'
    | 'tool_call'
    | 'tool'
    | 'sources'
    | 'text'
    | 'artifact'
    | 'drafting'
    | 'done'
    | 'error'
    | 'unknown'
  content?: string
  widget?: WidgetKind
  data?: any
  tool?: string
  args?: any
  sources?: Source[]
  id?: string
  title?: string
  kind?: string
  spec?: any
  artifacts?: string[]
}

export function parseSSEEvent(raw: any): SSEEvent {
  return { type: raw?.type ?? 'unknown', ...raw }
}

// Legacy alias kept so older imports don't break during migration.
export interface SSEMessage {
  type: string
  agent?: string
  content?: string
  tool?: string
  raw?: any
}

// ── Domain models ──────────────────────────────────────────────────────────
export interface Source {
  title: string
  /**
   * Empty string means this is a user-uploaded document, not a web link —
   * the backend never assigns a citation an empty `url` otherwise (see
   * `register_document_citation` in core/utils/citations.py). Treat it as
   * non-clickable: no favicon fetch, no `<a href>`.
   */
  url: string
  content?: string
  /**
   * Citation number this source is referenced by as `[n]` in the answer text.
   * Accumulated across the whole thread (not reset per turn) — a later
   * message's `[n]` may point at a source that first appeared in an earlier
   * message's `sources` array, so resolving `[n]` requires merging every
   * message's `sources` in the thread into one `n -> source` map.
   */
  n?: number
  date?: string
}

/**
 * One `POST /check_source` result: a chunk that the backend's vector search +
 * LLM rerank both agreed genuinely supports a highlighted claim.
 * `excerpt` is a verbatim quote lifted from `chunk` by the rerank step (same
 * language as the source, never translated/paraphrased) — the frontend
 * fuzzy-matches it against `chunk` to render a precise highlight, mirroring
 * Perplexity's "sources that support this claim" panel.
 */
export interface CheckSourceMatch {
  n: number
  title: string
  url: string
  chunk: string
  excerpt: string
  score: number
  turn: number | null
}

/** Drives the sources panel's "check source" view (see `sources-panel.tsx`). */
export interface CheckSourceState {
  status: 'loading' | 'done'
  claim: string
  matches: CheckSourceMatch[]
}

export interface ToolStep {
  tool: string
  args: any
  timestamp: number
}

export interface ChartArtifact {
  id: string
  title: string
  kind: 'echarts'
  spec: Record<string, any>
}

export interface ReportArtifact {
  id: string
  title: string
  content: string
  // false while the report is still streaming into the reader; undefined/true once done.
  complete?: boolean
  /** Sources from the owning message, carried along so `[n]` citations inside the report body resolve. */
  sources?: Source[]
  /**
   * This report's own dashed-underline marks — a copy of the owning
   * message's `reportVerifiedClaims[this.id]`, carried along the same way
   * `sources` is so the panel that renders this report doesn't need its own
   * lookup into `ChatMessage`. Offsets are into *this report's* `content`
   * string, not the owning message's.
   */
  verifiedClaims?: VerifiedClaim[]
}

export interface WidgetData {
  widget: WidgetKind
  data: any
}

// The model can talk, then invoke tools, then talk again. `blocks` preserves
// that arrival order so the UI can render text/tool sections interleaved
// instead of always showing all tool activity before all text.
export type MessageBlock = { type: 'text'; content: string } | { type: 'tools'; steps: ToolStep[] }

/** One "verify claim" dashed-underline mark: a span (offsets into whichever
 * string it was extracted from) plus the cleaned claim text sent to
 * `/check_source`. See `lib/verify-claims.ts`. */
export interface VerifiedClaim {
  id: string
  start: number
  end: number
  claim: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachedFiles?: { id: string; name: string; type: string }[]
  follow_up_content?: string
  sources?: Source[]
  steps?: ToolStep[]
  blocks?: MessageBlock[]
  widgets?: WidgetData[]
  artifacts?: ChartArtifact[]
  reports?: ReportArtifact[]
  // 'report' | 'chart' while the agent is drafting an artifact (not yet finished)
  drafting?: 'report' | 'chart' | null
  mode?: AgentMode
  /** Set when this assistant message was produced by a rewind/regenerate. */
  regeneratedWith?: AgentMode
  /** Set when the user manually stopped generation mid-stream. */
  stoppedByUser?: boolean
  /**
   * Sentence spans that silently came back with a `/check_source` hit during
   * this message's background claim-check (see `lib/verify-claims.ts`),
   * rendered as dashed-underline marks. Persisted (synced like every other
   * field here) so the underlines survive a refresh instead of only living
   * in in-memory state. Only the span + cleaned claim text are stored — the
   * actual matches are re-fetched from `/check_source` on click rather than
   * persisting the full match payload too, since the backend caches that
   * lookup and refetching is cheap.
   */
  verifiedClaims?: VerifiedClaim[]
  /**
   * Same idea as `verifiedClaims`, but for `<report>` blocks embedded in
   * this message's content — keyed by the report's own id (deterministic:
   * `m<messageIndex>[-b<blockIndex>]-report-<n>`, see `lib/report-parser.ts`)
   * since a report's `MarkdownMessage` renders its own `content` string, not
   * the message's, so offsets have to be scoped separately per report.
   */
  reportVerifiedClaims?: Record<string, VerifiedClaim[]>
}

export type PublishDuration = '7d' | '30d' | 'permanent'

export interface TodoItem {
  content: string
  status: 'completed' | 'in_progress' | 'pending'
}

// ── Question block ─────────────────────────────────────────────────────────
export interface QuestionOption {
  id: string
  label: string
  /** When true, selecting this option reveals a free-text input beneath it. */
  has_text_input?: boolean
}

export interface QuestionItem {
  id: string
  type: 'single' | 'multiple' | 'text'
  prompt: string
  options: QuestionOption[]
  text_placeholder?: string | null
  correct_answer?: string | string[] | null
}

export interface QuestionBlock {
  questions: QuestionItem[]
}
