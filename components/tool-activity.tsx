'use client'

import { useState, useEffect } from 'react'
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
  Terminal,
  Check,
  Blocks,
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

// Retrieval = anything that reaches out to the web / live data. Used by the
// no-plan fallback to group these under one "Searching through the internet" step.
function isRetrieval(step: ToolStep): boolean {
  const t = lc(step.tool)
  if (isSearch(step.tool)) return true
  return ['load_web', 'web_page', 'fetch', 'read_web', 'places', 'weather', 'stock', 'currency', 'document', 'read_user'].some(
    (k) => t.includes(k)
  )
}

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
  const skillsByTodo = new Map<string, string[]>()
  const preTools: ToolStep[] = []
  const preSkills: string[] = []

  for (const s of steps) {
    const sk = skillOf(s)
    if (sk) {
      // A loaded skill nests under the todo active when it was read (e.g. the
      // "read … skill documentation" step), so it shows as that step's child
      // rather than a separate top-level entry. Skills read before any plan
      // stay at the top.
      if (activeContent) {
        const list = skillsByTodo.get(activeContent) ?? []
        if (!list.includes(sk)) list.push(sk)
        skillsByTodo.set(activeContent, list)
      } else if (!preSkills.includes(sk)) {
        preSkills.push(sk)
      }
      continue
    }
    if (isTodo(s.tool)) {
      if (Array.isArray(s.args?.todos)) {
        const incoming: Todo[] = s.args.todos
        // Merge: update status of existing items, append new ones — never drop.
        const merged = [...todos]
        for (const t of incoming) {
          const idx = merged.findIndex((m) => m.content === t.content)
          if (idx >= 0) merged[idx] = t
          else merged.push(t)
        }
        todos = merged
        // Advance the active step from THIS snapshot (the latest full plan state),
        // not the accumulated `merged` list — otherwise a stale in_progress left
        // over from an earlier snapshot keeps `find` pinned to the first todo, and
        // every later tool wrongly nests under it. Take the last in_progress in the
        // snapshot (the most recently started step) and only fall back if none.
        let latestActive: string | null = null
        for (const t of incoming) {
          if (t.status === 'in_progress' && t.content) latestActive = t.content
        }
        activeContent = latestActive ?? activeContent
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
  return { todos, toolsByTodo, skillsByTodo, preTools, preSkills }
}

// ── presentation ────────────────────────────────────────────────────────────
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
  if (t === 'run_python' || t.includes('run_python')) return { Icon: Terminal, label: 'Running Python', chip: undefined }
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

function CodeStep({ code, isRunning }: { code: string; isRunning?: boolean }) {
  const [open, setOpen] = useState(false)
  // Show first non-empty line as preview chip in the header.
  const preview = code.split('\n').find((l) => l.trim()) ?? ''

  return (
    <div className="omni-step-in rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-[var(--foreground)] hover:bg-[var(--secondary)]/50 transition-colors"
      >
        {/* icon: pulses while running */}
        <Terminal
          size={14}
          strokeWidth={1.75}
          className={isRunning ? 'text-[var(--accent)] animate-pulse' : 'text-[var(--muted-foreground)]'}
        />

        <span className={isRunning ? 'omni-shimmer-text-accent font-medium' : 'text-[var(--muted-foreground)]'}>
          {isRunning ? 'Running Python…' : 'Python'}
        </span>

        {/* code preview chip */}
        {preview && !isRunning && (
          <span className="min-w-0 truncate rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[11px] font-mono text-[var(--foreground)] max-w-[260px]">
            {preview.length > 48 ? preview.slice(0, 48) + '…' : preview}
          </span>
        )}

        <ChevronDown
          size={14}
          className={`ml-auto shrink-0 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)]">
          <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_3%,var(--background))]">
            {code}
          </pre>
        </div>
      )}
    </div>
  )
}

function ToolRow({ step, isActive }: { step: ToolStep; isActive?: boolean }) {
  // run_python (and any tool whose sole arg is `code`) → rich CodeStep.
  if (typeof step.args?.code === 'string') {
    return <CodeStep code={step.args.code} isRunning={isActive} />
  }
  const { Icon, label, chip } = singleStepInfo(step.tool, step.args)
  return (
    <div className="omni-step-in flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
      <Icon size={13} strokeWidth={1.75} className="shrink-0" />
      <span className="shrink-0">{label}</span>
      {chip && <span className="min-w-0 truncate rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[12px] text-[var(--foreground)]">{chip}</span>}
    </div>
  )
}

function SkillRow({ name }: { name: string }) {
  return (
    <div className="omni-step-in flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
      <Blocks size={14} strokeWidth={1.75} className="shrink-0 text-[var(--muted-foreground)]" />
      <span>
        Using <span className="text-[var(--foreground)]">{name}</span> skill
      </span>
    </div>
  )
}

// A unified step group: a real todo, or a synthesized one (see synthesizeGroups).
interface Group {
  key: string
  content: string
  status: 'completed' | 'in_progress' | 'pending'
  tools: ToolStep[]
  skills: string[]
}

// Fallback for when the agent ran tools without writing any todos: keep the same
// two-level hierarchy by grouping contiguous tool calls into a synthetic step —
// retrieval tools collapse into "Searching through the internet", the rest into a
// generic working step. The last group is in-progress while still thinking.
function synthesizeGroups(tools: ToolStep[], thinking: boolean): Group[] {
  const groups: Group[] = []
  let cat: 'retrieval' | 'other' | null = null
  for (const s of tools) {
    const c = isRetrieval(s) ? 'retrieval' : 'other'
    if (!groups.length || c !== cat) {
      groups.push({
        key: `g${groups.length}`,
        content: c === 'retrieval' ? 'Searching through the internet' : 'Working through the task',
        status: 'completed',
        tools: [],
        skills: [],
      })
      cat = c
    }
    groups[groups.length - 1].tools.push(s)
  }
  if (thinking && groups.length) groups[groups.length - 1].status = 'in_progress'
  return groups
}

// One step (todo): a check once done, otherwise just its text — the active one
// shimmers (the same neutral effect the answer uses while thinking). Its tools
// and skills nest beneath it.
function GroupRow({ group, thinking, isLast }: { group: Group; thinking: boolean; isLast?: boolean }) {
  const done = group.status === 'completed'
  const active = thinking && group.status === 'in_progress'
  const [isExpanded, setIsExpanded] = useState(active)

  useEffect(() => {
    if (done) setIsExpanded(false)
    else if (active) setIsExpanded(true)
  }, [done, active])

  const hasTools = group.skills.length > 0 || group.tools.length > 0

  return (
    <div className="omni-step-in relative pl-[20px]">
      {!isLast && (
        <div className="absolute left-[3px] top-[11px] w-[2px] bg-[var(--border-subtle)]" style={{ height: 'calc(100% + 16px)' }} />
      )}
      <div className="absolute left-[0px] top-[7px] flex h-2 w-2 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
        <div className={`h-full w-full rounded-full ${active ? 'bg-[var(--foreground)] animate-pulse' : 'bg-[var(--border-subtle)]'}`} />
      </div>
      
      <div className="flex items-start gap-2 text-[13px]">
        {hasTools ? (
          <button 
            onClick={() => setIsExpanded(e => !e)}
            className={`flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity ${active ? 'omni-shimmer-text font-medium' : done ? 'text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'}`}
          >
            <span>{group.content}</span>
            <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''} text-[var(--muted-foreground)]`} />
          </button>
        ) : (
          <span className={active ? 'omni-shimmer-text font-medium' : done ? 'text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'}>
            {group.content}
          </span>
        )}
      </div>
      {hasTools && isExpanded && (
        <div className="mt-2 space-y-1.5">
          {group.skills.map((sk, k) => (
            <SkillRow key={`s${k}`} name={sk} />
          ))}
          {group.tools.map((s, k) => (
            <ToolRow key={`t${k}`} step={s} isActive={active && k === group.tools.length - 1} />
          ))}
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
  const { todos, toolsByTodo, skillsByTodo, preTools, preSkills } = buildPlan(steps)

  // Thinking phase = streaming with no answer yet.
  const thinking = !!isStreaming && !answered
  const [open, setOpen] = useState(false)

  // Reveal the plan incrementally: show completed steps plus the current one
  // (the first not-yet-completed todo), hiding steps that haven't started. Once
  // answered, the whole checked-off list shows.
  const firstIncomplete = todos.findIndex((t) => t.status !== 'completed')
  const visibleTodos = answered || firstIncomplete === -1 ? todos : todos.slice(0, firstIncomplete + 1)

  // Always render a todo layer. With real todos, use them; otherwise synthesize
  // groups out of the loose tool calls so a plain tool run (fast OR pro) still
  // reads as "Searching through the internet" etc. Skills/tools nest beneath.
  let groups: Group[]
  if (todos.length > 0) {
    groups = visibleTodos.map((t, i) => ({
      key: `td${i}`,
      content: t.content || '',
      status: (answered ? 'completed' : t.status) as Group['status'],
      tools: t.content ? toolsByTodo.get(t.content) ?? [] : [],
      skills: t.content ? skillsByTodo.get(t.content) ?? [] : [],
    }))
  } else {
    groups = synthesizeGroups(preTools, thinking)
    // Any skills read before a plan (rare without todos) lead the first group.
    if (preSkills.length) {
      if (!groups.length) groups.push({ key: 'g0', content: 'Working through the task', status: thinking ? 'in_progress' : 'completed', tools: [], skills: [] })
      groups[0] = { ...groups[0], skills: [...preSkills, ...groups[0].skills] }
    }
  }

  // Loose tools that ran before a real plan keep showing above it.
  const looseSkills = todos.length > 0 ? preSkills : []
  const looseTools = todos.length > 0 ? preTools : []

  const hasContent = groups.length > 0 || looseTools.length > 0 || looseSkills.length > 0 || !!drafting
  const stepCount = groups.length || looseTools.length + looseSkills.length
  const showBody = thinking || open

  if (!thinking && !hasContent) return null

  return (
    <div className="mb-3 space-y-2">
      {!thinking && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <span>
            Completed {stepCount} step{stepCount === 1 ? '' : 's'}
          </span>
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {showBody && (
        <div className="space-y-4 ml-1.5 mt-2 py-1">
          {/* loose skills/tools that ran before any real plan */}
          {(looseSkills.length > 0 || looseTools.length > 0) && (
            <div className="pl-[20px] space-y-4">
              {looseSkills.map((sk, i) => (
                <SkillRow key={`sk${i}`} name={sk} />
              ))}
              {looseTools.map((s, i) => (
                <ToolRow key={`pre${i}`} step={s} isActive={thinking && i === looseTools.length - 1} />
              ))}
            </div>
          )}

          {/* the plan — real todos or synthesized groups */}
          {groups.map((g, i) => {
            const hasMore = !!drafting || (thinking && !drafting);
            const isLast = i === groups.length - 1 && !hasMore;
            return <GroupRow key={g.key} group={g} thinking={thinking} isLast={isLast} />
          })}

          {drafting && (
            <div className="omni-step-in relative pl-[20px]">
              <div className="absolute left-[0px] top-[7px] flex h-2 w-2 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
                <div className="h-full w-full rounded-full bg-[var(--accent)] animate-pulse" />
              </div>
              <div className="flex items-start gap-2 text-[13px]">
                <span className="omni-shimmer-text-accent font-medium">
                  {drafting === 'report' ? 'Drafting report…' : 'Creating chart…'}
                </span>
              </div>
            </div>
          )}

          {thinking && !drafting && (
            <div className="omni-step-in relative pl-[20px]">
              <div className="absolute left-[0px] top-[7px] flex h-2 w-2 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
                <div className="h-full w-full rounded-full bg-[var(--accent)] animate-pulse" />
              </div>
              <div className="flex items-start gap-2 text-[13px]">
                <span className="omni-shimmer-text-accent font-medium">Thinking</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
