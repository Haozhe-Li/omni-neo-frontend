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

interface Todo {
  content?: string
  status?: string
}

// Reconstruct the plan chronologically: associate each tool call with the todo
// that was in_progress when it ran. Tools before any plan land in `preTools`.
function buildPlan(steps: ToolStep[]) {
  let todos: Todo[] = []
  let activeContent: string | null = null
  const toolsByTodo = new Map<string, ToolStep[]>()
  const preTools: ToolStep[] = []
  const skills: string[] = []

  for (const s of steps) {
    const sk = skillOf(s)
    if (sk) {
      if (!skills.includes(sk)) skills.push(sk)
      continue
    }
    if (isTodo(s.tool)) {
      if (Array.isArray(s.args?.todos)) {
        todos = s.args.todos
        activeContent = todos.find((t) => t.status === 'in_progress')?.content ?? activeContent
      }
      continue
    }
    // a real tool call
    if (activeContent) {
      const list = toolsByTodo.get(activeContent) ?? []
      list.push(s)
      toolsByTodo.set(activeContent, list)
    } else {
      preTools.push(s)
    }
  }
  return { todos, toolsByTodo, preTools, skills }
}

// ── presentation ────────────────────────────────────────────────────────────
function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <Sparkles size={15} strokeWidth={1.75} className="text-[var(--accent)] animate-pulse" />
      <span className="omni-shimmer-text text-[14px] font-medium">Thinking</span>
    </div>
  )
}

function singleStepInfo(tool: string, args: any) {
  const t = lc(tool)
  const a = args || {}
  if (isSearch(tool)) return { Icon: Search, label: 'Searching', chip: a.query || a.q }
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

function ToolRow({ step }: { step: ToolStep }) {
  if (typeof step.args?.code === 'string') return <CodeStep code={step.args.code} output={(step.args as any).output} />
  const { Icon, label, chip } = singleStepInfo(step.tool, step.args)
  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
      <Icon size={13} strokeWidth={1.75} className="shrink-0" />
      <span className="shrink-0">{label}</span>
      {chip && <span className="min-w-0 truncate rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[12px] text-[var(--foreground)]">{chip}</span>}
    </div>
  )
}

function TodoIcon({ done, active }: { done: boolean; active: boolean }) {
  if (done) return <Check size={14} strokeWidth={2} className="shrink-0 text-[var(--muted-foreground)]" />
  if (active) return <CircleDot size={14} strokeWidth={1.75} className="shrink-0 text-[var(--accent)]" />
  return <Circle size={14} strokeWidth={1.75} className="shrink-0 text-[var(--muted-foreground)]/50" />
}

interface ToolActivityProps {
  steps?: ToolStep[]
  isStreaming?: boolean
  answered?: boolean
  drafting?: 'report' | 'chart' | null
}

export function ToolActivity({ steps = [], isStreaming, answered, drafting }: ToolActivityProps) {
  const { todos, toolsByTodo, preTools, skills } = buildPlan(steps)
  const stepCount = todos.length || skills.length + preTools.length
  const hasSteps = stepCount > 0 || !!drafting

  // Reveal the plan incrementally: show the completed steps plus the current one
  // (the first not-yet-completed todo), and hide steps that haven't started. As
  // the agent ticks each step off, the next one stacks in — and once the answer
  // is streaming (answered) or every step is done, the whole checked-off list shows.
  const firstIncomplete = todos.findIndex((t) => t.status !== 'completed')
  const visibleTodos = answered || firstIncomplete === -1 ? todos : todos.slice(0, firstIncomplete + 1)

  // Thinking phase = streaming with no answer yet. Steps stay expanded while
  // thinking, then collapse to "Completed N steps" once the answer begins.
  const thinking = !!isStreaming && !answered
  const [open, setOpen] = useState(false)
  const showBody = thinking ? hasSteps : open

  if (!thinking && !hasSteps) return null

  return (
    <div className="mb-3 space-y-2">
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

      {showBody && (
        <div className="space-y-2 border-l-2 border-[var(--border-subtle)] pl-3.5">
          {/* skills the agent loaded */}
          {skills.map((sk, i) => (
            <div key={`sk${i}`} className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
              <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-[var(--accent)]" />
              <span>
                Using <span className="text-[var(--foreground)]">{sk}</span> skill
              </span>
            </div>
          ))}

          {/* tool calls made before any plan */}
          {preTools.map((s, i) => (
            <ToolRow key={`pre${i}`} step={s} />
          ))}

          {/* the plan — each todo with the tools that ran while it was active */}
          {visibleTodos.map((todo, i) => {
            const tools = todo.content ? toolsByTodo.get(todo.content) ?? [] : []
            // Once the answer starts streaming, show every todo as completed.
            const done = !!answered || todo.status === 'completed'
            const active = !answered && todo.status === 'in_progress'
            return (
              <div key={`td${i}`} className="animate-fade-up">
                <div className="flex items-start gap-2 text-[13px]">
                  <span className="mt-0.5">
                    <TodoIcon done={done} active={active} />
                  </span>
                  <span className={active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}>{todo.content}</span>
                </div>
                {tools.length > 0 && (
                  <div className="ml-[7px] mt-1 mb-1 border-l border-[var(--border-subtle)] pl-4 space-y-1">
                    {tools.map((s, k) => (
                      <ToolRow key={k} step={s} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

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
