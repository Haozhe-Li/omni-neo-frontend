'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
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
  Terminal,
  Blocks,
  type LucideIcon,
} from 'lucide-react'
import { isReasoningStep, type TimelineStep, type ToolStep, type ReasoningStep } from '@/lib/types'
import { MarkdownMessage } from '@/components/markdown-message'

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

function CodeStepContent({ code, isRunning }: { code: string; isRunning?: boolean }) {
  const [open, setOpen] = useState(false)
  // Show first non-empty line as preview chip in the header.
  const preview = code.split('\n').find((l) => l.trim()) ?? ''

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-[13px] text-left hover:opacity-80 transition-opacity"
      >
        <span className={isRunning ? 'omni-shimmer-text font-medium' : 'text-[var(--muted-foreground)]'}>
          {isRunning ? 'Running Python…' : 'Python'}
        </span>

        {preview && !isRunning && (
          <span className="min-w-0 truncate rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[11px] font-mono text-[var(--foreground)] max-w-[260px]">
            {preview.length > 48 ? preview.slice(0, 48) + '…' : preview}
          </span>
        )}

        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--muted-foreground)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
          <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-[var(--foreground)] bg-[color-mix(in_srgb,var(--foreground)_3%,var(--background))]">
            {code}
          </pre>
        </div>
      )}
    </div>
  )
}

function ToolRowContent({ step, isActive }: { step: ToolStep; isActive?: boolean }) {
  // run_python (and any tool whose sole arg is `code`) → rich, expandable code preview.
  if (typeof step.args?.code === 'string') {
    return <CodeStepContent code={step.args.code} isRunning={isActive} />
  }
  const { label, chip } = singleStepInfo(step.tool, step.args)
  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
      <span className="shrink-0">{label}</span>
      {chip && <span className="min-w-0 truncate rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[12px] text-[var(--foreground)]">{chip}</span>}
    </div>
  )
}

// Markdown-rendered reasoning, clamped to ~3 lines with a manual expand toggle.
// Reveal pacing is a buffered typewriter (same idea as StreamingText): a steady
// base rate, faster when a backend batch lands a big backlog at once, so
// buffered chunks drain smoothly instead of popping. When the run ends
// (`animate` flips false) the remainder keeps draining at tail pacing instead
// of snapping out — fast models close a run with most of its text unrevealed.
const REASONING_CLAMP_CHARS = 220
const REASONING_CPS = 140
const REASONING_CATCHUP = 3
const REASONING_TAIL_CPS = 280
const REASONING_TAIL_CATCHUP = 8

function useSmoothReveal(text: string, animate: boolean): string {
  const targetRef = useRef(text)
  targetRef.current = text
  const animateRef = useRef(animate)
  animateRef.current = animate
  const shownRef = useRef(animate ? 0 : text.length)
  const [shown, setShown] = useState(shownRef.current)

  useEffect(() => {
    if (!animate && shownRef.current >= targetRef.current.length) {
      // Historical mount, or the tail drain already finished — stay idle.
      setShown(shownRef.current)
      return
    }
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const target = targetRef.current.length
      let cur = shownRef.current
      if (cur < target) {
        const speed = animateRef.current
          ? Math.max(REASONING_CPS, (target - cur) * REASONING_CATCHUP)
          : Math.max(REASONING_TAIL_CPS, (target - cur) * REASONING_TAIL_CATCHUP)
        cur = Math.min(target, cur + speed * dt)
        shownRef.current = cur
        setShown(Math.floor(cur))
      } else if (!animateRef.current) {
        // Caught up and the run is over — stop the loop.
        setShown(target)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate])

  return text.slice(0, Math.min(shown, text.length))
}

function ReasoningText({ content, isActive }: { content: string; isActive?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const active = !!isActive
  const trimmed = content.trim()
  const revealed = useSmoothReveal(trimmed, active)
  const collapsible = trimmed.length > REASONING_CLAMP_CHARS
  const open = active || expanded || !collapsible

  // Animated open/close: the clamp itself can't transition, so height does the
  // moving. Opening: unclamp immediately and grow max-height from the 3-line
  // height to the full scrollHeight. Closing: shrink max-height back down
  // first, and only re-apply the clamp once the transition lands. `maxH ===
  // null` means "no cap" — steady state, so the live typewriter can grow the
  // box freely per-frame.
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [clamped, setClamped] = useState(!open)
  const [maxH, setMaxH] = useState<string | null>(null)
  const prevOpen = useRef(open)

  useEffect(() => {
    if (prevOpen.current === open) return
    prevOpen.current = open
    const el = boxRef.current
    if (!el) {
      setClamped(!open)
      return
    }
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 21
    const collapsedH = Math.ceil(lineH * 3)
    if (open) {
      setClamped(false)
      setMaxH(`${collapsedH}px`)
      requestAnimationFrame(() => requestAnimationFrame(() => setMaxH(`${el.scrollHeight}px`)))
    } else {
      setMaxH(`${el.scrollHeight}px`)
      requestAnimationFrame(() => requestAnimationFrame(() => setMaxH(`${collapsedH}px`)))
    }
  }, [open])

  if (!trimmed) return null

  return (
    <div className="relative">
      <div
        ref={boxRef}
        onTransitionEnd={(e) => {
          if (e.propertyName !== 'max-height') return
          if (!open) setClamped(true)
          setMaxH(null)
        }}
        style={maxH !== null ? { maxHeight: maxH } : undefined}
        className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${clamped ? 'relative' : ''}`}
      >
        <MarkdownMessage
          content={revealed}
          className="text-[13px] leading-relaxed text-[var(--muted-foreground)] [&_p]:my-1 first:[&_p]:mt-0 last:[&_p]:mb-0"
        />
        {clamped && collapsible && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[var(--background)] to-transparent" />
        )}
      </div>
      {collapsible && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 flex items-center gap-0.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          {open ? 'Show less' : 'Show more'}
          <ChevronDown size={13} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}

function SkillRowContent({ name }: { name: string }) {
  return (
    <div className="text-[13px] text-[var(--muted-foreground)]">
      Using <span className="text-[var(--foreground)]">{name}</span> skill
    </div>
  )
}

// A single flattened timeline entry: reasoning, a skill activation, or a plain
// tool call — all rendered at the same nesting level (see TimelineRow).
type Item =
  | { kind: 'reasoning'; step: ReasoningStep }
  | { kind: 'skill'; name: string; step: ToolStep }
  | { kind: 'tool'; step: ToolStep }

// Flatten the raw step stream into render-ready items, chronologically:
// `write_todos` calls are dropped entirely (no longer used to group steps —
// the plan is internal bookkeeping, not user-facing structure), a `read_file`
// on a skill's SKILL.md becomes a `skill` item instead of a raw tool row, and
// everything else rides through as-is.
function buildItems(steps: TimelineStep[]): Item[] {
  const items: Item[] = []
  for (const s of steps) {
    if (isReasoningStep(s)) {
      items.push({ kind: 'reasoning', step: s })
      continue
    }
    if (isTodo(s.tool)) continue
    const sk = skillOf(s)
    if (sk) {
      items.push({ kind: 'skill', name: sk, step: s })
      continue
    }
    items.push({ kind: 'tool', step: s })
  }
  return items
}

// One row on the shared vertical timeline: a connecting line on the left with
// this item's icon sitting on top of it (a plain dot for reasoning, the
// tool's own icon for tool calls, Blocks for skills), and its content to the
// right.
function TimelineRow({ item, isActive, isLast }: { item: Item; isActive: boolean; isLast: boolean }) {
  let Icon: LucideIcon | null = null
  let content: ReactNode
  if (item.kind === 'reasoning') {
    content = <ReasoningText content={item.step.content} isActive={isActive} />
  } else if (item.kind === 'skill') {
    Icon = Blocks
    content = <SkillRowContent name={item.name} />
  } else {
    const isCode = typeof item.step.args?.code === 'string'
    Icon = isCode ? Terminal : singleStepInfo(item.step.tool, item.step.args).Icon
    content = <ToolRowContent step={item.step} isActive={isActive} />
  }

  return (
    <div className="omni-step-in relative pl-[22px]">
      {!isLast && (
        <div className="absolute left-[7px] top-[18px] w-[2px] bg-[var(--border-subtle)]" style={{ height: 'calc(100% + 4px)' }} />
      )}
      <div className="absolute left-0 top-[1px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
        {Icon ? (
          <Icon size={12} strokeWidth={1.75} className={isActive ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'} />
        ) : (
          <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-[var(--foreground)] animate-pulse' : 'bg-[var(--border-subtle)]'}`} />
        )}
      </div>
      {content}
    </div>
  )
}

function formatElapsed(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${String(rem).padStart(2, '0')}s`
}

interface ToolActivityProps {
  steps?: TimelineStep[]
  isStreaming?: boolean
  answered?: boolean
  drafting?: 'report' | 'chart' | null
}

export function ToolActivity({ steps = [], isStreaming, answered, drafting }: ToolActivityProps) {
  // Thinking phase = streaming with no answer yet. The header's elapsed timer
  // runs for exactly this phase, then freezes the moment an answer starts.
  const thinking = !!isStreaming && !answered

  const items = buildItems(steps)
  const hasContent = items.length > 0 || !!drafting
  const showPlaceholder = thinking && !drafting && items.length === 0

  const [open, setOpen] = useState(true)

  // Live elapsed timer: starts at the first step's own timestamp (or mount
  // time if nothing has streamed in yet), ticks every second while thinking,
  // and freezes automatically once `thinking` goes false (the interval is
  // torn down, so `now` simply stops advancing).
  const startRef = useRef<number | null>(null)
  if (startRef.current == null && steps.length > 0) startRef.current = steps[0].timestamp
  useEffect(() => {
    if (startRef.current == null) startRef.current = Date.now()
  }, [])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!thinking) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [thinking])
  const elapsedSeconds = startRef.current != null ? (now - startRef.current) / 1000 : 0

  if (!thinking && !hasContent) return null

  return (
    <div className="mb-3 space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
      >
        <span className={thinking ? 'omni-shimmer-text font-medium' : ''}>
          {thinking ? `Thinking for ${formatElapsed(elapsedSeconds)}` : `Completed, thinking for ${formatElapsed(elapsedSeconds)}`}
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 ml-1.5 mt-2 py-1">
          {/* Nothing has streamed yet — show a bare "Thinking" shimmer so the
              step area isn't empty while the model spins up. Replaced by the
              first real item (reasoning or tool) the moment one arrives. */}
          {showPlaceholder && (
            <div className="omni-step-in relative pl-[22px]">
              <div className="absolute left-0 top-[1px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
                <div className="h-2 w-2 rounded-full bg-[var(--foreground)] animate-pulse" />
              </div>
              <span className="omni-shimmer-text font-medium text-[13px]">Thinking</span>
            </div>
          )}

          {items.map((item, i) => {
            const isLastItem = i === items.length - 1 && !drafting
            return (
              <TimelineRow
                key={i}
                item={item}
                isActive={thinking && isLastItem}
                isLast={isLastItem}
              />
            )
          })}

          {drafting && (
            <div className="omni-step-in relative pl-[22px]">
              <div className="absolute left-0 top-[1px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
                <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
              </div>
              <span className="omni-shimmer-text-accent font-medium text-[13px]">
                {drafting === 'report' ? 'Drafting report…' : 'Creating chart…'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
