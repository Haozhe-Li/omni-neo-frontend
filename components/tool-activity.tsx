'use client'

import { useState } from 'react'
import {
  Search,
  Globe,
  MapPin,
  Cloud,
  TrendingUp,
  DollarSign,
  FileText,
  Wrench,
  ChevronDown,
  Code2,
  Loader2,
  Check,
  Circle,
  CircleDot,
  Sparkles,
} from 'lucide-react'
import type { ToolStep } from '@/lib/types'

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const lc = (s: string) => (s || '').toLowerCase()
const isTodo = (t: string) => lc(t).includes('todo')
const isSearch = (t: string) => (lc(t).includes('search') || lc(t).includes('arxiv')) && !lc(t).includes('places')

// A read_file on a /skills/<name>/SKILL.md path = the agent activating a skill.
function skillOf(step: ToolStep): string | null {
  if (lc(step.tool) !== 'read_file') return null
  const fp = step.args?.file_path
  if (typeof fp !== 'string' || !fp.includes('/skills/')) return null
  const m = fp.match(/\/skills\/([^/]+)\//)
  return m ? m[1] : null
}

// ── Thinking indicator (Claude-style neutral shimmer, Omni teal sparkle) ───
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <Sparkles size={15} strokeWidth={1.75} className="text-[var(--accent)] animate-pulse" />
      <span className="omni-shimmer-text text-[14px] font-medium">Thinking</span>
    </div>
  )
}

// ── Plan (write_todos) ─────────────────────────────────────────────────────
interface Todo {
  content?: string
  activeForm?: string
  status?: string
}

function latestTodos(steps: ToolStep[]): Todo[] {
  let todos: Todo[] = []
  for (const s of steps) if (isTodo(s.tool) && Array.isArray(s.args?.todos)) todos = s.args.todos
  return todos
}

function PlanBlock({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) return null
  return (
    <div className="space-y-1.5">
      {todos.map((t, i) => {
        const done = t.status === 'completed'
        const active = t.status === 'in_progress'
        const label = active ? t.activeForm || t.content : t.content
        return (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            {done ? (
              <Check size={14} strokeWidth={2} className="shrink-0 text-[var(--muted-foreground)]" />
            ) : active ? (
              <CircleDot size={14} strokeWidth={1.75} className="shrink-0 text-[var(--accent)]" />
            ) : (
              <Circle size={14} strokeWidth={1.75} className="shrink-0 text-[var(--muted-foreground)]/50" />
            )}
            <span className={active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Grouped searches (expandable nested queries) ───────────────────────────
function SearchGroup({ queries }: { queries: string[] }) {
  const [open, setOpen] = useState(true)
  if (queries.length === 0) return null
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-[13px] text-[var(--foreground)]">
        <Globe size={14} strokeWidth={1.75} className="shrink-0 text-[var(--muted-foreground)]" />
        <span>Searching the web</span>
        <ChevronDown size={13} className={`text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-[7px] mt-1 border-l border-[var(--border-subtle)] pl-4 space-y-1">
          {queries.map((q, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
              <Search size={12} strokeWidth={1.75} className="shrink-0" />
              <span className="min-w-0 truncate">{q}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function singleStepInfo(tool: string, args: any) {
  const t = lc(tool)
  const a = args || {}
  if (['load_web', 'web_page', 'fetch', 'read_web'].some((k) => t.includes(k)))
    return { Icon: Globe, label: 'Reading', chip: a.url ? domainOf(a.url) : undefined }
  if (t.includes('places')) return { Icon: MapPin, label: 'Finding places', chip: a.query || a.location }
  if (t.includes('weather')) return { Icon: Cloud, label: 'Checking weather', chip: a.location }
  if (t.includes('stock')) return { Icon: TrendingUp, label: 'Looking up', chip: a.ticker || a.symbol }
  if (t.includes('currency'))
    return { Icon: DollarSign, label: 'Currency', chip: [a.base_currency || a.base, a.target_currency || a.target].filter(Boolean).join(' → ') }
  if (t.includes('document') || t.includes('read_user')) return { Icon: FileText, label: 'Reading your file', chip: undefined }
  // deepagents builtin file/system tools — shown faithfully.
  const base = (p: any) => (typeof p === 'string' ? p.split('/').pop() : undefined)
  if (t === 'read_file') return { Icon: FileText, label: 'Reading file', chip: base(a.file_path) }
  if (t === 'write_file') return { Icon: FileText, label: 'Writing file', chip: base(a.file_path) }
  if (t === 'edit_file') return { Icon: FileText, label: 'Editing file', chip: base(a.file_path) }
  if (t === 'ls') return { Icon: Wrench, label: 'Listing files', chip: a.path }
  if (t === 'glob') return { Icon: Search, label: 'Finding files', chip: a.pattern }
  if (t === 'grep') return { Icon: Search, label: 'Searching files', chip: a.pattern }
  if (t === 'execute') return { Icon: Wrench, label: 'Running command', chip: a.command }
  if (t === 'task') return { Icon: Wrench, label: 'Delegating subtask', chip: a.description }
  return { Icon: Wrench, label: tool || 'Working', chip: undefined }
}

function StepRow({ step }: { step: ToolStep }) {
  const { Icon, label, chip } = singleStepInfo(step.tool, step.args)
  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
      <Icon size={14} strokeWidth={1.75} className="shrink-0" />
      <span className="shrink-0">{label}</span>
      {chip && <span className="min-w-0 truncate rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[12px] text-[var(--foreground)]">{chip}</span>}
    </div>
  )
}

function CodeStep({ code, output }: { code: string; output?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-[var(--foreground)] hover:bg-[var(--secondary)]/50 transition-colors">
        <Code2 size={14} strokeWidth={1.75} className="text-[var(--muted-foreground)]" />
        <span>Ran code</span>
        <ChevronDown size={14} className={`ml-auto text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--border-subtle)]">
          <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-[var(--foreground)]">{code}</pre>
          {output && (
            <div className="border-t border-[var(--border-subtle)] bg-[var(--secondary)]/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Output</div>
              <pre className="overflow-x-auto text-[12px] leading-relaxed font-mono text-[var(--muted-foreground)] whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ToolActivityProps {
  steps?: ToolStep[]
  isStreaming?: boolean
  answered?: boolean
  drafting?: 'report' | 'chart' | null
}

export function ToolActivity({ steps = [], isStreaming, answered, drafting }: ToolActivityProps) {
  const todos = latestTodos(steps)
  const queries = steps.filter((s) => isSearch(s.tool)).map((s) => s.args?.query || s.args?.q).filter(Boolean) as string[]
  const skills = [...new Set(steps.map(skillOf).filter(Boolean))] as string[]
  const codeSteps = steps.filter((s) => typeof s.args?.code === 'string')
  const otherSteps = steps.filter(
    (s) => !isTodo(s.tool) && !isSearch(s.tool) && !skillOf(s) && typeof s.args?.code !== 'string'
  )

  const stepCount = todos.length || (queries.length ? 1 : 0) + skills.length + otherSteps.length + codeSteps.length
  const hasSteps = stepCount > 0 || !!drafting

  // Thinking phase = streaming and no answer text yet. Steps stay expanded while
  // thinking, then collapse to a "Completed N steps" summary once the answer starts.
  const thinking = !!isStreaming && !answered
  const [open, setOpen] = useState(false)
  const showBody = thinking ? hasSteps : open

  if (!thinking && !hasSteps) return null

  return (
    <div className="mb-3 space-y-2">
      {/* header — OUTSIDE the steps */}
      {thinking ? (
        <ThinkingIndicator />
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <span>
            Completed {stepCount} step{stepCount > 1 ? 's' : ''}
          </span>
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* steps body (collapsible) */}
      {showBody && (
        <div className="space-y-2 border-l-2 border-[var(--border-subtle)] pl-3.5">
          {todos.length > 0 && <PlanBlock todos={todos} />}
          {skills.map((sk, i) => (
            <div key={`sk${i}`} className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
              <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-[var(--accent)]" />
              <span>
                Using <span className="text-[var(--foreground)]">{sk}</span> skill
              </span>
            </div>
          ))}
          {queries.length > 0 && <SearchGroup queries={queries} />}
          {otherSteps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
          {codeSteps.map((s, i) => (
            <CodeStep key={i} code={s.args.code} output={(s.args as any).output} />
          ))}
          {drafting && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--accent)]">
              <Loader2 size={14} className="animate-spin" />
              <span>{drafting === 'report' ? 'Drafting report…' : 'Creating chart…'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
