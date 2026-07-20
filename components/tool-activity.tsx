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
  CircleCheck,
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

// Markdown-rendered reasoning, clamped to 8 lines with a manual expand toggle.
// Stays clamped even while actively streaming — only a manual click unclamps
// it, so a long thinking run never auto-pops open on its own. The typewriter
// reveal itself is unaffected by the clamp: `revealed` keeps growing in the
// background regardless of clamp/expand state, so expanding mid-stream shows
// text still visibly typing in rather than snapping to the full string.
//
// Reveal pacing is a buffered typewriter (same idea as StreamingText): a
// steady base rate, faster when a backend batch lands a big backlog at once,
// so buffered chunks drain smoothly instead of popping. When the run ends
// (`animate` flips false) the remainder keeps draining at tail pacing instead
// of snapping out — fast models close a run with most of its text unrevealed.
const REASONING_CLAMP_LINES = 8
const REASONING_CLAMP_FALLBACK_LINE_H = 21 // px — used before the box has been measured once
const REASONING_CLAMP_CHARS = 600
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
  // Deliberately NOT `active ||` here — a reasoning run stays clamped to
  // REASONING_CLAMP_LINES lines even while still streaming. Only the user's
  // own click (`expanded`) unclamps it.
  const open = expanded || !collapsible

  // Animated open/close: the clamp itself can't transition, so height does the
  // moving. Opening: unclamp immediately and grow max-height from the 8-line
  // height to the full scrollHeight. Closing: shrink max-height back down
  // first, and only re-apply the clamp once the transition lands. `maxH ===
  // null` means "no cap" — steady state, so the live typewriter can grow the
  // box freely per-frame while still visually clamped by line-height overflow.
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
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || REASONING_CLAMP_FALLBACK_LINE_H
    const collapsedH = Math.ceil(lineH * REASONING_CLAMP_LINES)
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
        style={
          maxH !== null
            ? { maxHeight: maxH }
            : clamped
              ? { maxHeight: `${REASONING_CLAMP_FALLBACK_LINE_H * REASONING_CLAMP_LINES}px` }
              : undefined
        }
        // text-[13px] leading-relaxed here (in addition to `.reasoning-markdown`
        // on the MarkdownMessage child below) is what getComputedStyle reads for
        // the line-height measurement — boxRef has no competing classes of its
        // own, so unlike the child these apply cleanly with nothing to fight.
        className="overflow-hidden text-[13px] leading-relaxed transition-[max-height] duration-300 ease-in-out"
      >
        <MarkdownMessage content={revealed} className="reasoning-markdown" />
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

// The bullet that sits on top of the connecting line: an icon for tool/skill
// rows, a plain dot for reasoning, shared by every row on the timeline
// (including the trailing skeleton/done rows) so they all line up.
function Bullet({ Icon, active, done, accent }: { Icon?: LucideIcon | null; active?: boolean; done?: boolean; accent?: boolean }) {
  return (
    <div className="absolute left-0 top-[1px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
      {Icon ? (
        <Icon
          size={done ? 14 : 12}
          strokeWidth={1.75}
          className={done ? 'text-[var(--muted-foreground)]' : active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}
        />
      ) : (
        <div
          className={`h-2 w-2 rounded-full ${
            accent ? 'bg-[var(--accent)] animate-pulse' : active ? 'bg-[var(--foreground)] animate-pulse' : 'bg-[var(--border-subtle)]'
          }`}
        />
      )}
    </div>
  )
}

function TimelineLine({ isLast }: { isLast: boolean }) {
  if (isLast) return null
  return <div className="absolute left-[7px] top-[18px] w-[2px] bg-[var(--border-subtle)]" style={{ height: 'calc(100% + 4px)' }} />
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
      <TimelineLine isLast={isLast} />
      <Bullet Icon={Icon} active={isActive} />
      {content}
    </div>
  )
}

// Trailing placeholder shown at the end of the timeline while more steps are
// still expected — a couple of shimmering skeleton bars rather than a text
// label, so it reads as "loading" without competing with real step text.
function SkeletonTailRow() {
  return (
    <div className="omni-step-in relative pl-[22px]">
      <Bullet active />
      <div className="flex flex-col gap-1.5 py-[3px]">
        <div className="h-[9px] w-[65%] max-w-[200px] rounded-full bg-[var(--secondary)] animate-pulse" />
        <div className="h-[9px] w-[35%] max-w-[110px] rounded-full bg-[var(--secondary)] animate-pulse" style={{ animationDelay: '0.15s' }} />
      </div>
    </div>
  )
}

// Trailing row shown briefly the moment thinking ends, right before the whole
// timeline auto-collapses — a quiet "done" beat instead of the skeleton just
// vanishing outright.
function DoneTailRow() {
  return (
    <div className="omni-step-in relative pl-[22px]">
      <Bullet Icon={CircleCheck} done />
      <span className="text-[13px] text-[var(--muted-foreground)]">Done</span>
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

// How long the "Done" beat lingers before the timeline auto-collapses.
const DONE_LINGER_MS = 700

interface ToolActivityProps {
  steps?: TimelineStep[]
  isStreaming?: boolean
  answered?: boolean
  drafting?: 'report' | 'chart' | null
  /** When this whole turn began (epoch ms) — see `ChatMessage.turnStartedAt`. */
  turnStartedAt?: number
}

export function ToolActivity({ steps = [], isStreaming, answered, drafting, turnStartedAt }: ToolActivityProps) {
  // Thinking phase = streaming with no answer yet. The header's elapsed timer
  // runs for exactly this phase, then freezes the moment an answer starts.
  const thinking = !!isStreaming && !answered

  const items = buildItems(steps)
  // Sticky once true: if this turn was ever observed thinking (even with zero
  // tool/reasoning steps — a quick chit-chat reply in fast mode, say), keep
  // rendering through to the "Completed, thinking for Xs" / Done close-out
  // instead of the whole component vanishing the instant `answered` flips.
  // Without this, a fast turn with no visible steps would cut straight from
  // "Thinking for Xs" to nothing — no Done beat, no collapse, just gone.
  const everThinkingRef = useRef(thinking)
  if (thinking) everThinkingRef.current = true
  const hasContent = items.length > 0 || !!drafting || everThinkingRef.current

  // ── elapsed timer ──────────────────────────────────────────────────────
  // While thinking, tick live off the wall clock. The instant thinking ends
  // — whether that happens live in this session, or the message is loaded
  // already-completed from history — freeze using STORED timestamps, never
  // the current wall-clock time. Using "now" as the reference for an
  // already-finished message is what caused the timer to read a huge,
  // ever-growing number on reload: it was really measuring "time since this
  // message was sent", not "time spent thinking".
  //
  // The start anchor prefers `turnStartedAt` (set once when the stream
  // begins, before any step exists) over the first step's own timestamp.
  // chat-view renders this message's tool activity via a DIFFERENT JSX
  // branch once its `blocks` array goes from empty to non-empty (a plain
  // fallback `<ToolActivity>` before the first step, a keyed one inside
  // `blocks.map(...)` after) — React remounts a fresh instance across that
  // switch, wiping any component-local "when did this start" state. Anchor
  // to a value that comes from the message itself instead, so it survives
  // that remount; `firstTs` stays only as a fallback for messages persisted
  // before this field existed.
  const firstTs = steps[0]?.timestamp
  const lastTs = steps.length > 0 ? steps[steps.length - 1].timestamp : undefined
  const startRef = useRef<number | null>(null)
  if (startRef.current == null && turnStartedAt != null) startRef.current = turnStartedAt
  if (startRef.current == null && firstTs != null) startRef.current = firstTs
  useEffect(() => {
    if (startRef.current == null && thinking) startRef.current = Date.now()
  }, [thinking])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!thinking) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [thinking])
  const elapsedSeconds = thinking
    ? startRef.current != null
      ? (now - startRef.current) / 1000
      : 0
    : startRef.current != null && lastTs != null
      ? (lastTs - startRef.current) / 1000
      : 0

  // ── expand/collapse + the "done" beat that precedes auto-collapse ───────
  // Seed `open` from whether we're thinking RIGHT NOW at mount, not a fixed
  // `true` — a live turn mounts mid-thought (expanded, as before), but a
  // message loaded already-completed from history (or a reload mid-session)
  // mounts with `thinking` already false, so it should start collapsed. A
  // fixed `true` here was why finished steps sometimes came back expanded
  // after a page refresh: nothing ever re-collapses a message that was never
  // observed transitioning from thinking to done.
  const [open, setOpen] = useState(() => thinking)
  const prevThinkingRef = useRef(thinking)
  useEffect(() => {
    const was = prevThinkingRef.current
    prevThinkingRef.current = thinking
    if (was && !thinking && open) {
      const t = setTimeout(() => setOpen(false), DONE_LINGER_MS)
      return () => clearTimeout(t)
    }
  }, [thinking, open])

  // Animated collapse: the body stays mounted and its max-height is measured
  // and transitioned, instead of conditionally unmounting — so toggling never
  // snaps the layout or yanks the page's scroll position. `maxH === null`
  // means "no cap", the steady state while expanded, so live-streamed content
  // can keep growing the box freely without fighting a stale cached height.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [maxH, setMaxH] = useState<string | null>(null)
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (prevOpenRef.current === open) return
    prevOpenRef.current = open
    const el = bodyRef.current
    if (!el) return
    if (open) {
      setMaxH('0px')
      requestAnimationFrame(() => requestAnimationFrame(() => setMaxH(`${el.scrollHeight}px`)))
    } else {
      setMaxH(`${el.scrollHeight}px`)
      requestAnimationFrame(() => requestAnimationFrame(() => setMaxH('0px')))
    }
  }, [open])

  if (!thinking && !hasContent) return null

  // Nothing has streamed in yet: just the bare, non-interactive label — no
  // chevron, no expandable body, no placeholder row underneath it.
  if (thinking && items.length === 0 && !drafting) {
    return (
      <div className="mb-3">
        <span className="omni-shimmer-text-accent text-[13px] font-medium">Thinking for {formatElapsed(elapsedSeconds)}</span>
      </div>
    )
  }

  // Done is a permanent capstone on the completed timeline, not a one-time
  // animation beat — it must still be there if the user re-expands a turn
  // that already auto-collapsed, or reopens a completed one from history.
  const showSkeletonTail = thinking && !drafting
  const showDoneTail = !thinking && !drafting && hasContent
  const hasTail = showSkeletonTail || showDoneTail || !!drafting

  return (
    <div className="mb-3 space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
      >
        <span className={thinking ? 'omni-shimmer-text-accent font-medium' : ''}>
          {thinking ? `Thinking for ${formatElapsed(elapsedSeconds)}` : `Completed, thinking for ${formatElapsed(elapsedSeconds)}`}
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        ref={bodyRef}
        onTransitionEnd={(e) => {
          if (e.propertyName !== 'max-height') return
          if (open) setMaxH(null)
        }}
        // `undefined` here (rather than a `0px` fallback for the closed
        // steady state) was the bug: `maxH` starts `null` regardless of what
        // `open` initializes to, and the measuring effect only runs when
        // `open` *changes* — so a message that mounts already collapsed
        // (history reload) rendered fully expanded anyway on first paint,
        // and the first click had to "close" that accidental expansion
        // before a second click could actually open/close it as expected.
        style={maxH !== null ? { maxHeight: maxH } : open ? undefined : { maxHeight: '0px' }}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
      >
        <div className="space-y-4 ml-1.5 mt-2 py-1">
          {items.map((item, i) => {
            // Two different questions, kept separate on purpose: "is this the
            // item currently streaming" (drives the typewriter/pulsing dot,
            // must depend only on array position) vs "does a line need to
            // connect this row to the next" (must also account for the
            // skeleton/Done/drafting tail that visually follows it). Folding
            // both into one `!hasTail`-gated value used to mean isActive was
            // permanently false for every row whenever a tail was showing —
            // i.e. the entire time a turn was thinking — which made
            // useSmoothReveal treat every reasoning step as already-historical
            // right from its first render and never actually type it in.
            const isLastByPosition = i === items.length - 1
            const isActive = thinking && isLastByPosition
            const drawsLine = isLastByPosition && !hasTail
            return <TimelineRow key={i} item={item} isActive={isActive} isLast={drawsLine} />
          })}

          {showDoneTail ? <DoneTailRow /> : showSkeletonTail ? <SkeletonTailRow /> : null}

          {drafting && (
            <div className="omni-step-in relative pl-[22px]">
              <Bullet accent />
              <span className="omni-shimmer-text-accent font-medium text-[13px]">
                {drafting === 'report' ? 'Drafting report…' : 'Creating chart…'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
