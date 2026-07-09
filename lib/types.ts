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
}

export interface WidgetData {
  widget: WidgetKind
  data: any
}

// The model can talk, then invoke tools, then talk again. `blocks` preserves
// that arrival order so the UI can render text/tool sections interleaved
// instead of always showing all tool activity before all text.
export type MessageBlock = { type: 'text'; content: string } | { type: 'tools'; steps: ToolStep[] }

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
