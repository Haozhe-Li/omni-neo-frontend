'use client'

import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
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
  ChevronRight,
  Terminal,
  Blocks,
  CircleCheck,
  Code2,
  type LucideIcon,
} from 'lucide-react'
import { isReasoningStep, type TimelineStep, type ToolStep, type ReasoningStep, type ReportArtifact } from '@/lib/types'
import { MarkdownMessage } from '@/components/markdown-message'

// One `run_python` call's filename, defaulted the same way everywhere it's
// read from — the args come straight off a persisted tool-call step, so an
// older turn recorded before the backend started sending `filename` (or an
// agent that skips the arg) must fall back identically here and in
// `scriptReportsFromSteps` below, or the card's title and the panel's title
// would disagree.
function scriptFilename(args: any): string {
  const f = args?.filename
  return typeof f === 'string' && f.trim() ? f.trim() : 'script.py'
}

// Synthesizes a "report" per `run_python` call so its code can be opened in
// the same side-panel reader used for `<report>` artifacts — not a real
// persisted report, just `content` wrapped in a fenced code block, which
// rides through the exact same MarkdownMessage + rehype-highlight rendering
// path as any code block in an answer (same syntax highlighting, same
// light/dark theme, for free). `idPrefix` must match what `TimelineRow`
// below computes for the same steps array so a click opens the same id this
// produces — see the two `<ToolActivity>` call sites in chat-view.tsx.
export function scriptReportsFromSteps(steps: TimelineStep[] | undefined, idPrefix: string): ReportArtifact[] {
  if (!steps) return []
  const out: ReportArtifact[] = []
  steps.forEach((s, i) => {
    if (isReasoningStep(s)) return
    const code = (s as ToolStep).args?.code
    if (typeof code !== 'string') return
    out.push({
      id: `${idPrefix}-script-${i}`,
      title: scriptFilename((s as ToolStep).args),
      content: '```python\n' + code + '\n```',
      complete: true,
    })
  })
  return out
}

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

// run_python's code, shown Perplexity-style: a fixed "Running Python Code"
// label plus a single clickable file chip (no inline expansion) — clicking
// opens the code in the artifact side-panel instead, where it renders
// through the same highlighted-code path as an answer's own code blocks.
function ScriptCard({ filename, isActive, onOpen }: { filename: string; isActive?: boolean; onOpen?: () => void }) {
  return (
    <div>
      <div className={`mb-1.5 text-[13px] ${isActive ? 'omni-shimmer-text-accent font-medium' : 'text-[var(--muted-foreground)]'}`}>
        Running Python Code
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="group flex max-w-[280px] items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-2 text-left transition-colors disabled:cursor-default enabled:hover:bg-[var(--secondary)]/60 enabled:cursor-pointer"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--muted-foreground)]">
          <Code2 size={14} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[var(--foreground)]">{filename}</div>
          <div className="text-[11px] text-[var(--muted-foreground)]">Python</div>
        </div>
      </button>
    </div>
  )
}

function ToolRowContent({
  step,
  isActive,
  scriptId,
  onOpenScript,
}: {
  step: ToolStep
  isActive?: boolean
  scriptId?: string
  onOpenScript?: (id: string) => void
}) {
  // run_python (and any tool whose sole arg is `code`) → clickable script card.
  if (typeof step.args?.code === 'string') {
    return (
      <ScriptCard
        filename={scriptFilename(step.args)}
        isActive={isActive}
        onOpen={scriptId && onOpenScript ? () => onOpenScript(scriptId) : undefined}
      />
    )
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
  | { kind: 'tool'; step: ToolStep; stepIndex: number }

// Flatten the raw step stream into render-ready items, chronologically:
// `write_todos` calls are dropped entirely (no longer used to group steps —
// the plan is internal bookkeeping, not user-facing structure), a `read_file`
// on a skill's SKILL.md becomes a `skill` item instead of a raw tool row, and
// everything else rides through as-is. `stepIndex` (position in the original
// `steps` array, not in this filtered list) is kept on tool items so a code
// step's card can be given an id that matches `scriptReportsFromSteps`.
function buildItems(steps: TimelineStep[]): Item[] {
  const items: Item[] = []
  steps.forEach((s, i) => {
    if (isReasoningStep(s)) {
      items.push({ kind: 'reasoning', step: s })
      return
    }
    if (isTodo(s.tool)) return
    const sk = skillOf(s)
    if (sk) {
      items.push({ kind: 'skill', name: sk, step: s })
      return
    }
    items.push({ kind: 'tool', step: s, stepIndex: i })
  })
  return items
}

// ── header preview ──────────────────────────────────────────────────────────
// The collapsed header shows what the agent is doing RIGHT NOW — a preview of
// the newest timeline item — instead of an elapsed-time readout. The live row
// gets a line to itself (see `ToolActivity`'s two-row header), so this cap is
// generous; genuine overflow on a narrow screen is ellipsised by CSS in
// `HeaderLabel` rather than being cut here.
const PREVIEW_MAX_CHARS = 120

function truncatePreview(s: string, max = PREVIEW_MAX_CHARS): string {
  const flat = (s || '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  // Prefer a word boundary, but only if it doesn't hack off most of the line
  // (a single very long token — a URL, say — should just be cut mid-word).
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}

// Position of the item the live header row describes: the newest concrete
// (non-reasoning) action. -1 when nothing has been done yet.
//
// Reasoning is skipped rather than described: its prose streams token by token
// and belongs in the expandable body, not in a one-line header. Skipped means
// *passed over*, not "replaced by a placeholder" — the scan walks backwards to
// the last tool/skill and keeps showing it for as long as the agent is
// thinking. Falling back to a generic "Thinking" instead made the header
// bounce between the tool name and that word on every reasoning run, since a
// turn alternates think → act → think → act throughout, and with a fast model
// the gap between two tool calls can be a few hundred milliseconds.
//
// "Thinking" therefore appears exactly once per turn: at the very start,
// before any action has happened and there is genuinely nothing to report.
//
// This index is also what splits "done" from "happening now" for the header's
// step count — see `ToolActivity`. There is no tool_result event on the wire
// (chat-view's SSE loop only ever appends on `tool_call`/`reasoning`), so a
// step is known to have finished only once a NEWER action shows up, which is
// exactly what "everything before this index" means.
function activeActionIndex(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind !== 'reasoning') return i
  return -1
}

// One short line describing that newest action. Tool rows reuse the exact same
// label/chip pair their timeline row renders, so the header and the row it
// describes never disagree.
function activityPreview(items: Item[], drafting?: 'report' | 'chart' | null): string {
  if (drafting) return drafting === 'report' ? 'Drafting report…' : 'Creating chart…'
  const idx = activeActionIndex(items)
  if (idx < 0) return 'Thinking'
  const item = items[idx]
  // `activeActionIndex` never points at reasoning; this is the type guard for it.
  if (item.kind === 'reasoning') return 'Thinking'
  if (item.kind === 'skill') return truncatePreview(`Using ${item.name} skill`)
  if (typeof item.step.args?.code === 'string') return 'Writing Python code'
  const { label, chip } = singleStepInfo(item.step.tool, item.step.args)
  const chipText = typeof chip === 'string' ? chip.trim() : ''
  return truncatePreview(chipText ? `${label} ${chipText}` : label)
}

// The bullet icon for the live row: the live item's own icon, picked exactly
// the way its timeline row would pick it, so the row doesn't change shape when
// the body opens around it. `null` means a plain dot — nothing concrete is
// happening yet ("Thinking"), or an artifact is being drafted.
function liveIcon(items: Item[], drafting?: 'report' | 'chart' | null): LucideIcon | null {
  if (drafting) return null
  const idx = activeActionIndex(items)
  if (idx < 0) return null
  const item = items[idx]
  if (item.kind === 'reasoning') return null
  if (item.kind === 'skill') return Blocks
  if (typeof item.step.args?.code === 'string') return Terminal
  return singleStepInfo(item.step.tool, item.step.args).Icon
}

// The header's animated text. A plain re-render swapped labels instantly,
// which read as a hard cut; this runs each change as a short sequence
// instead — the old label fades out and drifts up, the text is replaced
// while it's invisible, then the new one fades in from just below.
//
// The box width deliberately does NOT transition; see the note on the width
// measurement below for why. The swap still reads smoothly because the width
// changes at the one moment the label is at opacity 0, so the only thing that
// visibly moves is the chevron, and it moves while the text is blank.
const LABEL_FADE_MS = 170

// useLayoutEffect warns when React renders on the server, and this is a
// client component that Next still server-renders.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function HeaderLabel({ text, shimmer }: { text: string; shimmer: boolean }) {
  // 'idle' = settled and visible, 'out' = fading the old text away,
  // 'enter' = new text staged below at zero opacity, one frame before it
  // animates in (the staging frame must NOT transition, or the label would
  // visibly slide down to its start position first).
  const [shown, setShown] = useState(text)
  const [phase, setPhase] = useState<'idle' | 'out' | 'enter'>('idle')
  const latest = useRef(text)
  latest.current = text

  useEffect(() => {
    if (text === shown) return
    setPhase('out')
    const t = setTimeout(() => {
      // Read from the ref, not the closed-over `text`: several steps can land
      // inside one fade, and only the newest should be what appears.
      setShown(latest.current)
      setPhase('enter')
    }, LABEL_FADE_MS)
    return () => clearTimeout(t)
  }, [text, shown])

  useEffect(() => {
    if (phase !== 'enter') return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase('idle'))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [phase])

  // Natural width of the current text, measured off a hidden copy that no
  // layout constrains, NOT off the visible span — measuring the visible one
  // means the measurement depends on the very value it produces.
  //
  // This has to land BEFORE paint, hence useLayoutEffect: the render that
  // swaps in a longer label still carries the previous, narrower width, so a
  // post-paint useEffect would let one frame of clipped text ("Complet…")
  // through on every swap.
  //
  // `getBoundingClientRect().width` + ceil, not `offsetWidth`: offsetWidth is
  // rounded to whole pixels and text is laid out at subpixel widths, so a
  // label measuring 154.6px reported 155 — or 154, and a box one third of a
  // pixel too narrow is enough for `truncate` on the visible span to ellipsise
  // a label that fits ("Completed · 3 ste…").
  const ghostRef = useRef<HTMLSpanElement | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  const measure = () => {
    const el = ghostRef.current
    if (!el) return
    const w = Math.ceil(el.getBoundingClientRect().width)
    setWidth((prev) => (prev === w ? prev : w))
  }
  useIsomorphicLayoutEffect(measure)

  // Re-measure when the ghost itself changes size for a reason no render of
  // ours caused — a webfont swapping in after hydration being the one that
  // bites: the label is measured in the fallback face, the real face lands
  // wider, nothing re-renders, and the now-too-narrow box permanently
  // ellipsises a label that has never changed.
  useEffect(() => {
    const el = ghostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // `font-medium` has to be on the ghost whenever it's on the visible span:
  // the shimmer state renders at weight 500 and measuring weight 400 text
  // would under-report, clipping the label by a few pixels.
  const weightClass = shimmer ? 'font-medium' : ''

  return (
    <span
      className="relative min-w-0 overflow-hidden"
      // No `transition: width` here, and that is the fix, not an omission.
      // Animating this box's width while the text inside it is not animated
      // means that for the length of the transition the box is still the OLD
      // label's width with the NEW label already in it — and `truncate` duly
      // ellipsises it ("Completed · 2 ste…"). Worse, the transition only
      // advances while the document timeline runs, so a backgrounded tab or a
      // blocked main thread freezes it at the start value and the clipped
      // label becomes permanent rather than lasting 300ms.
      style={{ width: width != null ? `${width}px` : undefined }}
    >
      <span
        // `w-max` rather than a width inherited from the box above: the text
        // is sized by its own content, so it can never be ellipsised by a
        // box that is momentarily the wrong size (that transient mismatch is
        // the whole reason the outer box doesn't transition its width).
        //
        // `max-w-full truncate` handles the one case where clipping is real
        // and not transient: the outer box carries `min-w-0` inside a flex
        // row, so a label wider than the available space shrinks it below the
        // measured width, and this span then caps at that smaller width and
        // ellipsises instead of being cut mid-glyph. In the steady state the
        // outer box IS the measured text width, so `max-w-full` is a no-op
        // and nothing gets an ellipsis it didn't earn.
        className={`block w-max max-w-full truncate text-left ${shimmer ? 'omni-shimmer-text-accent font-medium' : ''}`}
        style={{
          opacity: phase === 'idle' ? 1 : 0,
          transform: phase === 'out' ? 'translateY(-4px)' : phase === 'enter' ? 'translateY(4px)' : 'translateY(0)',
          transition:
            phase === 'enter'
              ? 'none'
              : `opacity ${LABEL_FADE_MS}ms cubic-bezier(0.4,0,0.2,1), transform ${LABEL_FADE_MS}ms cubic-bezier(0.4,0,0.2,1)`,
        }}
      >
        {shown}
      </span>
      {/* Measurement-only twin: absolutely positioned so it never affects
          layout, and never width-constrained so it can't be clipped. */}
      <span
        ref={ghostRef}
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 whitespace-nowrap opacity-0 ${weightClass}`}
      >
        {shown}
      </span>
    </span>
  )
}

// Sits a comfortable distance from the label rather than tucked against it, so
// the header reads as "a sentence, then an affordance" instead of one dense
// widget, and stays a shade lighter than the text it belongs to.
function Chevron({ open }: { open?: boolean }) {
  return <ChevronRight size={14} className={`shrink-0 opacity-70 transition-transform ${open ? 'rotate-90' : ''}`} />
}

// The summary line: everything that has already finished, collapsed to a
// count. It owns the chevron whenever it is present, because the chevron
// always rides the topmost row.
function HeaderRow({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex max-w-full items-center gap-2.5 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
    >
      <HeaderLabel text={label} shimmer={false} />
      <Chevron open={open} />
    </button>
  )
}

// The step running right now — a TIMELINE ROW, not a second header: same
// bullet gutter and `pl-[22px]` indent as every row inside the body, so it
// sits one level below the summary line above it and, when the body opens, it
// reads as the last row of one continuous list. The completed steps grow in
// ABOVE it (see `ToolActivity`), which is why it isn't also rendered inside
// the body: standalone or expanded, it is the same single row in the same
// place, never a duplicate of anything.
//
// It only carries the chevron before the first step has finished, the one
// phase where no summary line exists and this row IS the header.
function LiveRow({
  label,
  Icon,
  chevron,
  open,
  onToggle,
}: {
  label: string
  Icon: LucideIcon | null
  chevron: boolean
  open: boolean
  onToggle: () => void
}) {
  const body = (
    <span className="flex min-w-0 max-w-full items-center gap-2.5">
      <HeaderLabel text={label} shimmer />
      {chevron && <Chevron open={open} />}
    </span>
  )
  return (
    <div className="omni-step-in relative pl-[22px] text-[13px] text-[var(--muted-foreground)]">
      <Bullet Icon={Icon} live />
      {chevron ? (
        <button onClick={onToggle} className="flex max-w-full hover:text-[var(--foreground)] transition-colors">
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  )
}

// The bullet that sits on top of the connecting line: an icon for tool/skill
// rows, a plain dot for reasoning, shared by every row on the timeline — the
// live row and the trailing Done row included — so they all line up in one
// gutter.
function Bullet({
  Icon,
  active,
  done,
  live,
}: {
  Icon?: LucideIcon | null
  active?: boolean
  done?: boolean
  /** The always-visible live row's bullet: accent-coloured and breathing. It
   *  is the one thing on the collapsed header that moves, so it carries the
   *  "still working" signal the shimmer used to carry alone. */
  live?: boolean
}) {
  return (
    <div className="absolute left-0 top-[1px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--background)] ring-4 ring-[var(--background)] z-10">
      {Icon ? (
        <Icon
          size={done ? 14 : live ? 13 : 12}
          strokeWidth={1.75}
          className={
            live
              ? 'text-[var(--accent)] omni-live-pulse'
              : done || !active
                ? 'text-[var(--muted-foreground)]'
                : 'text-[var(--foreground)]'
          }
        />
      ) : (
        <div
          className={`h-2 w-2 rounded-full ${
            live
              ? 'bg-[var(--accent)] omni-live-pulse'
              : active
                ? 'bg-[var(--foreground)] animate-pulse'
                : 'bg-[var(--border-subtle)]'
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
function TimelineRow({
  item,
  isActive,
  isLast,
  idPrefix,
  onOpenScript,
}: {
  item: Item
  isActive: boolean
  isLast: boolean
  idPrefix?: string
  onOpenScript?: (id: string) => void
}) {
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
    // Must match `scriptReportsFromSteps`' id scheme exactly — both walk the
    // same original `steps` array by position, so `item.stepIndex` (index
    // in that array, not in the filtered `items` list) lines up with the
    // `i` that function uses for the very same step.
    const scriptId = isCode && idPrefix ? `${idPrefix}-script-${item.stepIndex}` : undefined
    content = <ToolRowContent step={item.step} isActive={isActive} scriptId={scriptId} onOpenScript={onOpenScript} />
  }

  return (
    <div className="omni-step-in relative pl-[22px]">
      <TimelineLine isLast={isLast} />
      <Bullet Icon={Icon} active={isActive} />
      {content}
    </div>
  )
}

// Capstone row at the end of a finished timeline — the quiet "done" beat that
// takes the live row's place in the gutter once there is nothing left running.
function DoneTailRow() {
  return (
    <div className="omni-step-in relative pl-[22px]">
      <Bullet Icon={CircleCheck} done />
      <span className="text-[13px] text-[var(--muted-foreground)]">Done</span>
    </div>
  )
}

interface ToolActivityProps {
  steps?: TimelineStep[]
  isStreaming?: boolean
  answered?: boolean
  drafting?: 'report' | 'chart' | null
  /** Id prefix for this `steps` array's script cards — must match the prefix
   * chat-view uses when building the parallel `scriptReportsFromSteps(...)`
   * list for the artifact panel, so a card's click opens the right report. */
  idPrefix?: string
  /** Opens a script's code in the artifact side-panel (same handler as
   * report/chart cards — see `openPanel` in chat-view.tsx). */
  onOpenScript?: (id: string) => void
}

export function ToolActivity({ steps = [], isStreaming, answered, drafting, idPrefix, onOpenScript }: ToolActivityProps) {
  // Thinking phase = streaming with no answer yet. The header shimmers and
  // previews live activity for exactly this phase, then settles once an
  // answer starts.
  const thinking = !!isStreaming && !answered

  const items = buildItems(steps)
  // Sticky once true: if this turn was ever observed thinking (even with zero
  // tool/reasoning steps — a quick chit-chat reply in fast mode, say), keep
  // rendering through to the "Completed" / Done close-out instead of the whole
  // component vanishing the instant `answered` flips. Without this, a fast
  // turn with no visible steps would cut straight from "Thinking" to nothing.
  const everThinkingRef = useRef(thinking)
  if (thinking) everThinkingRef.current = true
  const hasContent = items.length > 0 || !!drafting || everThinkingRef.current

  // ── header ─────────────────────────────────────────────────────────────
  // While thinking the header is up to two rows: finished work collapses into
  // a "Completed · N steps" line, and the step running RIGHT NOW sits under it
  // on its own shimmering line. Once the turn ends the live row goes away and
  // the completed line is all that's left — which is why both are rendered
  // from the same `HeaderRow`, and why the completed row's label uses the same
  // wording in both phases: nothing about it moves when thinking stops.
  //
  // Reasoning is left out of the count on purpose — same rule the live row
  // follows. A "reasoning run" is just whatever tokens landed between two tool
  // calls, so the same amount of thinking can arrive as one run or five
  // depending on how the stream chunked it; counting them would put a number
  // on the header that moves for reasons the user can't see. Tool and skill
  // rows are the real, countable actions. `items` has already had the internal
  // `write_todos` bookkeeping filtered out, so this count matches the rows
  // one-for-one when the body is expanded.
  const actionCount = items.reduce((n, it) => (it.kind === 'reasoning' ? n : n + 1), 0)

  // The step the live row is showing. It is excluded from the summary count
  // (it hasn't finished) AND from the body (the live row IS its row, kept
  // outside the collapsing box so it stays visible) — one step, one row,
  // always. Nothing is live once the turn ends, or while drafting, where the
  // live row describes the draft itself rather than a step.
  const liveIdx = thinking && !drafting ? activeActionIndex(items) : -1
  const completedCount = items.reduce(
    (n, it, i) => (it.kind === 'reasoning' || i === liveIdx ? n : n + 1),
    0
  )

  // A turn that only reasoned has nothing to count, and "Completed · 0 steps"
  // would be a worse way of saying so. It gets a plain description of what it
  // actually did instead — which is also the honest answer for a greeting, the
  // usual case here: the agent thought about it and replied, no tools involved.
  const hasReasoning = items.some((it) => it.kind === 'reasoning')
  const doneLabel =
    actionCount > 0
      ? `Completed · ${actionCount} step${actionCount === 1 ? '' : 's'}`
      : hasReasoning
        ? 'Thought about it'
        : 'Completed'
  // Present tense while the turn is still running, and the count demoted to a
  // subordinate clause: this line describes the state of the WHOLE turn, the
  // live row below it being one detail of that state. Leading with "Completed"
  // mid-run instead put a finished-tense claim directly above an unfinished
  // one, which is the tense clash that made the two rows read as a sequence
  // rather than as a summary and its detail.
  const workingLabel = `Working · ${completedCount} step${completedCount === 1 ? '' : 's'} completed`
  const liveLabel = activityPreview(items, drafting)
  // Drafting keeps the live row alive past the end of thinking: an artifact is
  // still being written, and that row is now the only place that says so (it
  // used to be a row inside the collapsed body, where nobody saw it).
  const showLiveRow = thinking || !!drafting
  // While a live row is showing, a summary line above it only earns its place
  // once a countable action has actually finished. The reasoning that precedes
  // the first tool call is not a step, so it doesn't get a row of its own
  // ("Working · 0 steps completed" above the very first search would be noise)
  // — it's still there in the body, under the live row's chevron.
  const showCompletedRow = !showLiveRow || completedCount > 0

  // ── expand/collapse ────────────────────────────────────────────────────
  // Always starts collapsed, live turn or history alike — the header preview
  // is the at-a-glance story, and the step list is opt-in detail. Nothing
  // auto-collapses it afterwards either: once `open` is true it's because the
  // user clicked, and yanking it shut when the turn finishes would pull the
  // text out from under someone mid-read.
  const [open, setOpen] = useState(false)

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

  // Nothing has streamed in yet: the live row on its own, with nothing to
  // expand and so no chevron. Rendered through the same `LiveRow` as every
  // other phase rather than as a bare label, so when the first step arrives
  // the text doesn't jump sideways into a gutter that suddenly exists.
  if (thinking && items.length === 0 && !drafting) {
    return (
      // `pt-2` matches the gap the live row carries in every other phase, so
      // the row doesn't shift up or down when the first step lands.
      <div className="mb-3 pt-2">
        <LiveRow label={liveLabel} Icon={null} chevron={false} open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
    )
  }

  // Done is a permanent capstone on the completed timeline, not a one-time
  // animation beat — it must still be there if the user re-expands a turn
  // that already auto-collapsed, or reopens a completed one from history.
  //
  // There is no skeleton tail any more: it existed to say "more is coming" at
  // the bottom of the body, and the live row now says that in the same place,
  // permanently visible and with the actual step name on it.
  const showDoneTail = !thinking && !drafting && hasContent
  // Whatever visually follows the body's last row, and therefore whether that
  // row still needs a connecting line under it.
  const hasTail = showLiveRow || showDoneTail
  // The body is the timeline minus the live step, in order. Original indices
  // are carried through because "is this the item currently streaming" is a
  // question about position in `items` (it drives the reasoning typewriter),
  // not about position in this filtered list.
  const bodyItems = items.map((item, i) => ({ item, i })).filter(({ i }) => i !== liveIdx)

  return (
    // Three stacked pieces, in this order and for this reason: the summary
    // line, then the collapsing body, then the live row. The body opening
    // BETWEEN the other two is what makes expansion feel like the list growing
    // out of the header rather than a second panel appearing — the live row
    // never moves relative to the steps above it, it just gets more of them.
    <div className="mb-3">
      {showCompletedRow && (
        // Animated only on a live turn: a summary line appearing mid-run is an
        // event worth a beat, whereas on a history reload the row is just
        // there from the first paint and shouldn't fade in.
        <div className={thinking ? 'omni-step-in' : undefined}>
          {/* Present tense for exactly as long as a live row sits below it —
              including while an artifact is still being drafted, where the
              turn's steps are done but the turn plainly isn't. */}
          <HeaderRow label={showLiveRow ? workingLabel : doneLabel} open={open} onToggle={() => setOpen((v) => !v)} />
        </div>
      )}

      <div
        ref={bodyRef}
        onTransitionEnd={(e) => {
          if (e.propertyName !== 'max-height') return
          if (open) setMaxH(null)
        }}
        style={{
          // `{}` here (rather than a `0px` fallback for the closed steady
          // state) was the bug: `maxH` starts `null` regardless of what
          // `open` initializes to, and the measuring effect only runs when
          // `open` *changes* — so a message that mounts already collapsed
          // (history reload) rendered fully expanded anyway on first paint,
          // and the first click had to "close" that accidental expansion
          // before a second click could actually open/close it as expected.
          ...(maxH !== null ? { maxHeight: maxH } : open ? {} : { maxHeight: '0px' }),
          // Opacity fades out faster than the height collapses, so the row
          // content (including any reasoning text still tail-revealing via
          // its typewriter) is fully invisible well before the box finishes
          // shrinking — a bare max-height transition let a still-updating
          // last row visibly fight the collapsing box, which is what read as
          // "生硬"/janky. Same easing as the rest of the app's step/row
          // entrance animations (`omni-step-in`), instead of a plain
          // `ease-in-out`, so opening and closing feel consistent with them.
          opacity: open ? 1 : 0,
          transition: 'max-height 380ms cubic-bezier(0.4,0,0.2,1), opacity 200ms cubic-bezier(0.4,0,0.2,1)',
        }}
        className="overflow-hidden"
      >
        {/* Padding lives INSIDE the collapsing box so it collapses with it:
            closed, the live row sits one tight gap under the header; open, the
            8px here plus the live row's own 8px add up to the same 16px that
            separates every other pair of rows. */}
        <div className="space-y-4 py-2">
          {bodyItems.map(({ item, i }, pos) => {
            // Two different questions, kept separate on purpose: "is this the
            // item currently streaming" (drives the typewriter/pulsing dot,
            // must depend only on position in `items`) vs "does a line need to
            // connect this row to whatever follows" (must also account for the
            // live/Done tail below the box). Folding both into one
            // `!hasTail`-gated value used to mean isActive was permanently
            // false for every row whenever a tail was showing — i.e. the
            // entire time a turn was thinking — which made useSmoothReveal
            // treat every reasoning step as already-historical right from its
            // first render and never actually type it in.
            const isActive = thinking && i === items.length - 1
            const drawsLine = pos === bodyItems.length - 1 && !hasTail
            return (
              <TimelineRow
                key={i}
                item={item}
                isActive={isActive}
                isLast={drawsLine}
                idPrefix={idPrefix}
                onOpenScript={onOpenScript}
              />
            )
          })}

          {showDoneTail && <DoneTailRow />}
        </div>
      </div>

      {showLiveRow && (
        <div className="pt-2">
          <LiveRow
            label={liveLabel}
            Icon={liveIcon(items, drafting)}
            // The chevron always rides the topmost row, so the live row only
            // owns it before the first step has finished — the phase where it
            // IS the header. And only if the body has something in it: a first
            // tool call that arrived with no reasoning ahead of it would
            // otherwise offer a chevron that opens an empty box.
            chevron={!showCompletedRow && bodyItems.length > 0}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        </div>
      )}
    </div>
  )
}
