// ── Wire protocol (mirrors backend core/stream.py) ─────────────────────────
export type AgentMode = 'fast' | 'pro'

export type WidgetKind = 'weather' | 'stock' | 'place' | 'currency'

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
}

export interface WidgetData {
  widget: WidgetKind
  data: any
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachedFiles?: { id: string; name: string; type: string }[]
  follow_up_content?: string
  sources?: Source[]
  steps?: ToolStep[]
  widgets?: WidgetData[]
  artifacts?: ChartArtifact[]
  reports?: ReportArtifact[]
  // 'report' | 'chart' while the agent is drafting an artifact (not yet finished)
  drafting?: 'report' | 'chart' | null
  mode?: AgentMode
}

export type PublishDuration = '7d' | '30d' | 'permanent'

export interface TodoItem {
  content: string
  status: 'completed' | 'in_progress' | 'pending'
}
