'use client'

import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
// The trace's own step icons are drawn inline (see `StepIcon`) so they hold
// one optical weight against the reasoning dot beside them; these are the few
// places that still want a set icon.
import { ChevronDown, ChevronRight, Blocks, Code2 } from 'lucide-react'
import { isReasoningStep, type TimelineStep, type ToolStep, type ToolResultPage, type ReasoningStep, type ReportArtifact } from '@/lib/types'
import { SafeLink } from '@/components/safe-link'
import { MarkdownMessage } from '@/components/markdown-message'

// One `python_exec` call's filename, defaulted the same way everywhere it's
// read from — the args come straight off a persisted tool-call step, so an
// older turn recorded before the backend started sending `filename` (or an
// agent that skips the arg) must fall back identically here and in
// `scriptReportsFromSteps` below, or the card's title and the panel's title
// would disagree.
function scriptFilename(args: any): string {
  const f = args?.filename
  return typeof f === 'string' && f.trim() ? f.trim() : 'script.py'
}

// Synthesizes a "report" per `python_exec` call so its code can be opened in
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
// Web search. `stock_search` and the retired `search_place` also contain
// "search" but are lookups of a specific thing, not a query over the web —
// they have their own rows below and must not be swallowed by this one.
const isSearch = (t: string) =>
  (lc(t).includes('search') || lc(t).includes('arxiv')) &&
  !lc(t).includes('place') &&
  !lc(t).includes('stock')

// A read_file on a /skills/<name>/SKILL.md path = the agent activating a skill.
function skillOf(step: ToolStep): string | null {
  if (lc(step.tool) !== 'read_file') return null
  const fp = step.args?.file_path
  if (typeof fp !== 'string' || !fp.includes('/skills/')) return null
  const m = fp.match(/\/skills\/([^/]+)\//)
  return m ? m[1] : null
}

// ── presentation ────────────────────────────────────────────────────────────
/**
 * What a tool call reads as on the trace.
 *
 * `kind` picks one of four drawn icons rather than one of a dozen imported
 * ones — every step is a search, a page read, code, or a data lookup, and
 * collapsing to those four is what lets a twenty-step trace scan as a list
 * instead of an icon parade. `verb` and `arg` are rendered as one sentence
 * ("Searching “fog in July”"), the verb in full ink and the argument a shade
 * back, so the eye lands on what was done before what it was done to.
 */
type StepKind = 'search' | 'page' | 'code' | 'data'

function singleStepInfo(
  tool: string,
  args: any,
): { kind: StepKind; verb: string; /** Verb for the collapsed one-line form — "Searching “q”". */ short: string; arg?: string } {
  const info = stepInfoBase(tool, args)
  return { ...info, short: info.short ?? info.verb }
}

function stepInfoBase(
  tool: string,
  args: any,
): { kind: StepKind; verb: string; short?: string; arg?: string } {
  const t = lc(tool)
  const a = args || {}
  const quoted = (v: any) => (v ? `\u201C${v}\u201D` : undefined)
  // Each retrieval says where it went, not just that it searched: "Searching
  // through the Internet", "… Yahoo Finance". The providers behind the data
  // tools are fixed (see core/tools), so these are statements of fact.
  if (isSearch(tool))
    return {
      kind: 'search',
      verb: t.includes('arxiv') ? 'Searching through arXiv' : 'Searching through the Internet',
      short: t.includes('arxiv') ? 'Searching arXiv' : 'Searching',
      arg: quoted(a.query || a.q),
    }
  if (['load_web', 'web_page', 'fetch', 'read_web'].some((k) => t.includes(k)))
    return { kind: 'page', verb: 'Reading web pages', short: 'Reading', arg: a.url ? domainOf(a.url) : undefined }
  if (t.includes('place')) return { kind: 'data', verb: 'Finding places near', arg: a.query || a.location }
  if (t.includes('weather')) return { kind: 'data', verb: 'Searching through OpenWeather', short: 'Weather in', arg: a.location }
  if (t.includes('stock')) return { kind: 'data', verb: 'Searching through Yahoo Finance', short: 'Looking up', arg: a.ticker || a.symbol }
  if (t.includes('currency'))
    return {
      kind: 'data',
      verb: 'Searching through ECB exchange rates',
      short: 'Converting',
      arg: [a.base_currency || a.base, a.target_currency || a.target].filter(Boolean).join(' \u2192 '),
    }
  if (t.includes('document') || t.includes('read_user')) return { kind: 'page', verb: 'Reading your uploaded file' }
  if (t === 'python_exec' || t.includes('run_python')) return { kind: 'code', verb: 'Running Python' }
  // deepagents builtin file/system tools — shown faithfully.
  const base = (p: any) => (typeof p === 'string' ? p.split('/').pop() : undefined)
  if (t === 'read_file') return { kind: 'page', verb: 'Reading', arg: base(a.file_path) }
  if (t === 'write_file') return { kind: 'page', verb: 'Writing', arg: base(a.file_path) }
  if (t === 'edit_file') return { kind: 'page', verb: 'Editing', arg: base(a.file_path) }
  if (t === 'ls') return { kind: 'data', verb: 'Listing files in', arg: a.path }
  if (t === 'glob') return { kind: 'search', verb: 'Finding files', arg: a.pattern }
  if (t === 'grep') return { kind: 'search', verb: 'Searching files for', arg: a.pattern }
  if (t === 'execute') return { kind: 'code', verb: 'Running', arg: a.command }
  if (t === 'task') return { kind: 'data', verb: 'Delegating', arg: a.description }
  return { kind: 'data', verb: tool || 'Working' }
}

/* The step icons, hand-drawn. The trace's markers are plain dots now, so the
   one place these still appear is inside a chip — the search glyph on a query
   — where they are drawn small enough to sit with the chip's text. */
function StepIcon({ kind, size = 14 }: { kind: StepKind; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    'aria-hidden': true,
  } as const
  if (kind === 'search') {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
    )
  }
  if (kind === 'page') {
    return (
      <svg {...common}>
        <path d="M4 2h5l3 3v9H4z" />
        <path d="M6 8h4M6 11h4" />
      </svg>
    )
  }
  if (kind === 'code') {
    return (
      <svg {...common}>
        <path d="M6 5L3 8l3 3M10 5l3 3-3 3" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M3 12V8M7 12V4M11 12V9" />
    </svg>
  )
}

// python_exec's code, shown Perplexity-style: a fixed "Running Python Code"
// label plus a single clickable file chip (no inline expansion) — clicking
// opens the code in the artifact side-panel instead, where it renders
// through the same highlighted-code path as an answer's own code blocks.
function ScriptCard({ filename, isActive, onOpen }: { filename: string; isActive?: boolean; onOpen?: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <div className={`text-[14.5px] leading-[1.45] ${isActive ? 'omni-shimmer-text-accent' : 'text-[var(--ink)]'}`}>
        Running Python
      </div>
      {/* The script itself takes the trace's code treatment — mono on raised
          paper — rather than a generic file chip, so it reads as the thing
          that ran rather than an attachment. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="group flex max-w-[280px] items-center gap-2.5 rounded-xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-3 py-2 text-left transition-colors enabled:cursor-pointer disabled:cursor-default enabled:hover:bg-[color-mix(in_srgb,var(--ink)_11%,transparent)]"
      >
        <Code2 size={14} strokeWidth={1.5} className="shrink-0 text-[var(--teal)]" />
        <span className="omni-mono min-w-0 truncate text-[12px] text-[var(--ink-soft)]">{filename}</span>
      </button>
    </div>
  )
}

/* Pills on the trace — the thing a step did something *to*: a query, a page, a
   ticker. One shape for all of them, so a step reads as "label, then chips"
   whatever the tool was. */
const CHIP_CLASS =
  'inline-flex max-w-full items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-2.5 py-[3px] text-[12.5px] leading-[1.5] text-[var(--ink-soft)]'

function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={CHIP_CLASS}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

// A page the step read: its site's favicon and bare domain, linking out (through
// the same Safe Link gate as every other outbound link) to the page itself.
function PageChip({ page }: { page: ToolResultPage }) {
  const host = domainOf(page.url)
  return (
    <SafeLink
      href={page.url}
      title={page.title || page.url}
      className={`${CHIP_CLASS} transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_11%,transparent)] hover:text-[var(--ink)]`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
        alt=""
        className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
        loading="lazy"
      />
      <span className="min-w-0 truncate">{host}</span>
    </SafeLink>
  )
}

// Pages shown before the rest fold behind a "+N more" chip. Five is what fits
// on a row or two without the step outweighing the answer it led to.
const PAGE_CHIPS_COLLAPSED = 5

function PageChips({ pages }: { pages: ToolResultPage[] }) {
  const [expanded, setExpanded] = useState(false)
  const overflow = pages.length - PAGE_CHIPS_COLLAPSED
  const shown = expanded || overflow <= 0 ? pages : pages.slice(0, PAGE_CHIPS_COLLAPSED)
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((p) => (
        <PageChip key={p.url} page={p} />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[12.5px] leading-[1.5] text-[var(--ink-muted)] transition-colors hover:text-[var(--teal)]"
        >
          {expanded ? 'Show less' : `+${overflow} more`}
          <ChevronDown size={12} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}

// A muted label over its chips — "Searching" / "Reading" in the reference
// design. `shimmer` marks the one the agent is still doing.
function StepSection({ label, shimmer, children }: { label: string; shimmer?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={`text-[13.5px] leading-[1.45] ${shimmer ? 'omni-shimmer-text-accent' : 'text-[var(--ink-muted)]'}`}>
        {label}
      </div>
      {children}
    </div>
  )
}

// A `python_exec` step (any tool whose sole arg is `code`): the clickable script
// card. Every other tool step is a `CollapsibleStep`.
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
  return (
    <ScriptCard
      filename={scriptFilename(step.args)}
      isActive={isActive}
      onOpen={scriptId && onOpenScript ? () => onOpenScript(scriptId) : undefined}
    />
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
        className="max-w-[62ch] overflow-hidden text-[14.5px] leading-[1.65] transition-[max-height] duration-300 ease-in-out"
      >
        <MarkdownMessage content={revealed} className="reasoning-markdown" />
        {clamped && collapsible && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[var(--paper-raised)] to-transparent" />
        )}
      </div>
      {collapsible && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-0.5 text-[12.5px] text-[var(--ink-muted)] transition-colors hover:text-[var(--teal)]"
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
    <div className="text-[14.5px] leading-[1.45] text-[var(--ink)]">
      Using <span className="text-[var(--ink-soft)]">{name}</span> skill
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
  const { verb, arg } = singleStepInfo(item.step.tool, item.step.args)
  const argText = typeof arg === 'string' ? arg.trim() : ''
  return truncatePreview(argText ? `${verb} ${argText}` : verb)
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

// The summary line's count is the one piece of it that changes on its own
// cadence — every finished step bumps it while the rest of the sentence
// ("Working · ", " steps completed") stays put. Cross-fading the whole
// sentence on every bump (the original `HeaderLabel` behavior) read as the
// entire line flickering once a second on a fast turn; only the number itself
// needs the swap-while-invisible treatment now; prefix and suffix render as
// plain, unanimated text around it.
//
// `suffix` is included in the delayed swap (not just `count`) because it
// carries the singular/plural word ("step" vs "steps") and, for the done
// label, nothing else — swapping it on the same tick as the number, at the
// midpoint where both are invisible, keeps them from ever landing out of
// sync (e.g. a stray "steps" next to a "1").
function CountHeaderLabel({ prefix, count, suffix }: { prefix: string; count: number; suffix: string }) {
  const [shownCount, setShownCount] = useState(count)
  const [shownSuffix, setShownSuffix] = useState(suffix)
  const [phase, setPhase] = useState<'idle' | 'out' | 'enter'>('idle')
  const latestCount = useRef(count)
  const latestSuffix = useRef(suffix)
  latestCount.current = count
  latestSuffix.current = suffix

  useEffect(() => {
    if (count === shownCount && suffix === shownSuffix) return
    setPhase('out')
    const t = setTimeout(() => {
      // Read from the refs, not the closed-over values: several steps can
      // land inside one fade, and only the newest should be what appears.
      setShownCount(latestCount.current)
      setShownSuffix(latestSuffix.current)
      setPhase('enter')
    }, LABEL_FADE_MS)
    return () => clearTimeout(t)
  }, [count, suffix, shownCount, shownSuffix])

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

  return (
    <span className="min-w-0 max-w-full truncate text-left">
      {prefix}
      <span
        className="inline-block tabular-nums"
        style={{
          opacity: phase === 'idle' ? 1 : 0,
          transform: phase === 'out' ? 'translateY(-4px)' : phase === 'enter' ? 'translateY(4px)' : 'translateY(0)',
          transition:
            phase === 'enter'
              ? 'none'
              : `opacity ${LABEL_FADE_MS}ms cubic-bezier(0.4,0,0.2,1), transform ${LABEL_FADE_MS}ms cubic-bezier(0.4,0,0.2,1)`,
        }}
      >
        {shownCount}
      </span>
      {shownSuffix}
    </span>
  )
}

// Sits a comfortable distance from the label rather than tucked against it, so
// the header reads as "a sentence, then an affordance" instead of one dense
// widget, and stays a shade lighter than the text it belongs to.
function Chevron({ open }: { open?: boolean }) {
  return <ChevronRight size={14} className={`shrink-0 opacity-70 transition-transform ${open ? 'rotate-90' : ''}`} />
}

// Either a plain sentence with nothing to isolate ("Thought about it"), or a
// sentence built around a count that changes on its own — see
// `CountHeaderLabel` for why the two get different animation treatment.
type HeaderLabelSpec = { text: string } | { prefix: string; count: number; suffix: string }

// The summary line: everything that has already finished, collapsed to a
// count. It owns the chevron whenever it is present, because the chevron
// always rides the topmost row.
function HeaderRow({ label, open, onToggle }: { label: HeaderLabelSpec; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="group flex max-w-full items-baseline gap-2 pl-0.5 text-[13.5px] text-[var(--ink-muted)] transition-colors hover:text-[var(--teal)]"
    >
      <span className="mb-px h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink-fainter)]" />
      {'text' in label ? (
        <HeaderLabel text={label.text} shimmer={false} />
      ) : (
        <CountHeaderLabel prefix={label.prefix} count={label.count} suffix={label.suffix} />
      )}
      <span className="shrink-0 text-[var(--ink-fainter)]">·</span>
      <span className="shrink-0">{open ? 'Hide steps' : 'View steps'}</span>
      {/* A 6px corner rather than a chevron glyph: at this size an icon-set
          chevron is mostly antialiasing, and this rotates cleanly. */}
      <span
        aria-hidden
        className="mt-0.5 h-1.5 w-1.5 shrink-0 border-l-[1.5px] border-t-[1.5px] border-[var(--ink-fainter)] transition-transform"
        style={{ transform: `rotate(${open ? 45 : 135}deg)` }}
      />
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
  chevron,
  open,
  onToggle,
  connectTop = false,
}: {
  label: string
  chevron: boolean
  open: boolean
  onToggle: () => void
  /** A step sits above this row on the thread. */
  connectTop?: boolean
}) {
  const body = (
    <span className="flex min-w-0 max-w-full items-center gap-2.5 text-[14.5px] leading-[1.45] text-[var(--teal)]">
      <HeaderLabel text={label} shimmer />
      {chevron && <Chevron open={open} />}
    </span>
  )
  return (
    <TraceRow animate={false} bullet={<Bullet live />} connectTop={connectTop}>
      {chevron ? (
        <button onClick={onToggle} className="flex max-w-full transition-colors">
          {body}
        </button>
      ) : (
        body
      )}
    </TraceRow>
  )
}

/* The 20px marker cell that opens every trace row: a small dot once a step is
   behind us, the turning ring for the one still running. No per-tool icons —
   the sentence beside the marker already says what the step did, and a second
   symbol for the same fact is what made the thread read as busy. */
function Bullet({ live }: { live?: boolean }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center">
      {live ? (
        /* A plain arc, deliberately. The mark's own orbit was tried here
           and pulled the eye off the answer: this sits beside text that is
           being read, and a thing with three moving parts asks to be watched
           where a turning arc just says "still going". */
        <span
          className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[var(--teal)] border-t-transparent"
          style={{ animation: 'omni-spin 900ms linear infinite' }}
        />
      ) : (
        <span className="h-[7px] w-[7px] rounded-full bg-[var(--ink-fainter)]" />
      )}
    </span>
  )
}

/* One trace row: an icon column that carries the thread, and the content.

   The icon column runs the full height of the row, with a hairline above and
   below the icon, so consecutive rows' icons are joined into one thread (the
   gap beside the icon keeps the line from touching it). Rows are divided by a
   rule on the CONTENT side only — it starts where the text starts and leaves
   the thread unbroken, which is what makes the rows read as steps on a path
   rather than as separate boxes. A real grid rather than absolute
   positioning, so a reasoning block that wraps to six lines keeps its icon on
   the first line and its text on a single left edge. */
function TraceRow({
  children,
  animate = true,
  bullet,
  connectTop = false,
  connectBottom = false,
}: {
  children: React.ReactNode
  animate?: boolean
  bullet: React.ReactNode
  /** A row sits above this one: thread line in, divider rule above the content. */
  connectTop?: boolean
  /** A row sits below this one: thread line out. */
  connectBottom?: boolean
}) {
  return (
    <div
      className="grid grid-cols-[20px_minmax(0,1fr)] gap-3"
      style={animate ? { animation: 'omni-rise 260ms ease both' } : undefined}
    >
      <div className="flex flex-col items-center">
        {connectTop ? (
          <span className="mb-[3px] h-[11px] w-px shrink-0 bg-[var(--ink-fainter)] opacity-60" />
        ) : (
          <span className="h-3.5 shrink-0" />
        )}
        {bullet}
        {connectBottom && <span className="mt-[3px] w-px flex-1 bg-[var(--ink-fainter)] opacity-60" />}
      </div>
      <div className={`min-w-0 py-3.5 ${connectTop ? 'border-t border-[var(--line-strong)]' : ''}`}>{children}</div>
    </div>
  )
}

/* A tool step that folds. The whole title line is the control — the sentence,
   not just the chevron — and it answers a hover or press by turning teal, the
   same as the "View steps" line above the card.

   Folded, the title is the one-line summary ("Searching “langchain valuation”");
   open, it becomes the longer label ("Searching through the Internet") over the
   step's chips and the sources it read. The swap is a short fade and the body
   opens on `grid-template-rows` (the same trick as the card's own collapse), so
   it grows to its real height with no measuring.

   The default follows the agent: the step running right now is open and every
   step behind it is folded, so the trace stays a short list of sentences while
   the live step shows its working. A click is the user's own say and sticks —
   it is not undone when the step finishes or the next one starts. */
function CollapsibleStep({ step, live }: { step: ToolStep; live: boolean }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? live

  // Swap animation is armed only after mount, so rows that are simply drawn
  // (a history reload, a step landing) do not fade in a second time.
  const [armed, setArmed] = useState(false)
  useEffect(() => setArmed(true), [])

  const { kind, verb, short, arg } = singleStepInfo(step.tool, step.args)
  const pages = step.results ?? []
  const waiting = live && pages.length === 0
  const rawArg = typeof arg === 'string' ? arg.replace(/^\u201C|\u201D$/g, '') : undefined

  // The sites a retrieval landed on — what a trace can say that a bare "Searching"
  // cannot. A page load shows the page it was asked for until the result names it.
  const isPageLoad = kind === 'page' && typeof step.args?.url === 'string'
  const reading: ToolResultPage[] =
    pages.length > 0 ? pages : isPageLoad ? [{ title: '', url: step.args.url }] : []

  const hover =
    'transition-colors duration-150 group-hover:text-[var(--teal)] group-active:text-[var(--teal-hover)] group-focus-visible:text-[var(--teal)]'

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="group flex w-full cursor-pointer items-start justify-between gap-3 text-left outline-none"
      >
        <span
          key={open ? 'label' : 'summary'}
          className={`min-w-0 flex-1 text-[14.5px] leading-[1.45] ${hover} ${
            armed ? 'animate-in fade-in duration-200 motion-reduce:animate-none' : ''
          } ${
            open
              ? waiting
                ? 'omni-shimmer-text-accent'
                : 'text-[var(--ink-soft)]'
              : 'truncate text-[var(--ink)]'
          }`}
        >
          {open ? (
            verb
          ) : (
            <>
              {short}
              {arg && <span className={`${hover} text-[var(--ink-soft)]`}> {arg}</span>}
            </>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`mt-[2.5px] shrink-0 text-[var(--ink-muted)] transition-[transform,color] duration-200 group-hover:text-[var(--teal)] group-active:text-[var(--teal-hover)] ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className="grid"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          // The height moves slowly and softly; the opacity is quicker, so a
          // closing body is already gone before the box finishes shrinking.
          transition: 'grid-template-rows 280ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
        }}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex min-w-0 flex-col gap-3 pt-2">
            {isPageLoad ? (
              <PageChips pages={reading} />
            ) : (
              <>
                {rawArg && (
                  <div className="flex flex-wrap gap-1.5">
                    <Chip
                      icon={
                        kind === 'search' ? (
                          <span className="shrink-0 text-[var(--ink-muted)]">
                            <StepIcon kind="search" size={12} />
                          </span>
                        ) : undefined
                      }
                    >
                      {rawArg}
                    </Chip>
                  </div>
                )}
                {pages.length > 0 && (
                  <StepSection label="Reading sources">
                    <PageChips pages={pages} />
                  </StepSection>
                )}
              </>
            )}
            {step.result && <div className="text-[13.5px] leading-[1.5] text-[var(--ink-soft)]">{step.result}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// One row on the shared vertical timeline: a connecting line on the left with
// this item's icon sitting on top of it (a plain dot for reasoning, the
// tool's own icon for tool calls, Blocks for skills), and its content to the
// right.
function TimelineRow({
  item,
  isActive,
  live,
  connectTop,
  connectBottom,
  idPrefix,
  onOpenScript,
}: {
  item: Item
  isActive: boolean
  /** The step the agent is on right now — spinner for its icon. */
  live: boolean
  connectTop: boolean
  connectBottom: boolean
  idPrefix?: string
  onOpenScript?: (id: string) => void
}) {
  let bullet: ReactNode
  let content: ReactNode
  if (item.kind === 'reasoning') {
    bullet = <Bullet />
    content = <ReasoningText content={item.step.content} isActive={isActive} />
  } else if (item.kind === 'skill') {
    bullet = <Bullet live={live} />
    content = <SkillRowContent name={item.name} />
  } else {
    const isCode = typeof item.step.args?.code === 'string'
    bullet = <Bullet live={live} />
    // Must match `scriptReportsFromSteps`' id scheme exactly — both walk the
    // same original `steps` array by position, so `item.stepIndex` (index
    // in that array, not in the filtered `items` list) lines up with the
    // `i` that function uses for the very same step.
    const scriptId = isCode && idPrefix ? `${idPrefix}-script-${item.stepIndex}` : undefined
    content = isCode ? (
      <ToolRowContent step={item.step} isActive={isActive} scriptId={scriptId} onOpenScript={onOpenScript} />
    ) : (
      <CollapsibleStep step={item.step} live={live} />
    )
  }

  return (
    <TraceRow bullet={bullet} connectTop={connectTop} connectBottom={connectBottom}>
      {content}
    </TraceRow>
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
  /**
   * This turn continues straight on from a hidden <question>/
   * <scheduled-research> decision message — no visible query introduced
   * it. Suppresses the empty "Thinking" skeleton (which reads as "a new
   * turn just started") for exactly the phase where nothing has arrived
   * yet; once real steps land they still show normally; the streaming
   * caret on the answer text itself carries the "still writing" feeling
   * instead.
   */
  continuesHiddenTurn?: boolean
}

export function ToolActivity({ steps = [], isStreaming, answered, drafting, idPrefix, onOpenScript, continuesHiddenTurn }: ToolActivityProps) {
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
  // A finished trace summarises itself by KIND, not by a total: "3 searches ·
  // 2 tool calls · 1 note" tells you what sort of work the answer rests on,
  // where "6 steps" tells you only that there were six of something.
  const doneLabel: HeaderLabelSpec = (() => {
    let searches = 0
    let others = 0
    let notes = 0
    for (const it of items) {
      if (it.kind === 'reasoning') notes++
      else if (it.kind === 'tool' && isSearch(it.step.tool)) searches++
      else others++
    }
    const bits: string[] = []
    if (searches) bits.push(`${searches} search${searches === 1 ? '' : 'es'}`)
    if (others) bits.push(`${others} tool call${others === 1 ? '' : 's'}`)
    if (notes) bits.push(notes === 1 ? '1 note' : `${notes} notes`)
    if (bits.length) return { text: bits.join(' · ') }
    return { text: hasReasoning ? 'Thought about it' : 'Completed' }
  })()
  // Present tense while the turn is still running, and the count demoted to a
  // subordinate clause: this line describes the state of the WHOLE turn, the
  // live row below it being one detail of that state. Leading with "Completed"
  // mid-run instead put a finished-tense claim directly above an unfinished
  // one, which is the tense clash that made the two rows read as a sequence
  // rather than as a summary and its detail.
  const workingLabel: HeaderLabelSpec = {
    prefix: 'Working · ',
    count: completedCount,
    suffix: ` step${completedCount === 1 ? '' : 's'} completed`,
  }
  const liveLabel = activityPreview(items, drafting)
  // Drafting keeps the live row alive past the end of thinking: an artifact is
  // still being written, and that row is now the only place that says so.
  const showLiveRow = thinking || !!drafting
  // A running turn shows its work. Every step that has finished stays on the
  // card as it lands, with the live row at the bottom — watching the trace
  // build is the whole point of showing one, and hiding it behind "Working ·
  // 3 steps completed · View steps" turned the most interesting moment of the
  // turn into a closed box. The summary line and the collapse are what a
  // FINISHED trace gets, when the steps have become reference rather than
  // news.
  const isLive = showLiveRow
  const showCompletedRow = !isLive

  // ── expand/collapse ────────────────────────────────────────────────────
  // Always starts collapsed, live turn or history alike — the header preview
  // is the at-a-glance story, and the step list is opt-in detail. Nothing
  // auto-collapses it afterwards either: once `open` is true it's because the
  // user clicked, and yanking it shut when the turn finishes would pull the
  // text out from under someone mid-read.
  const [open, setOpen] = useState(false)
  // Live turns are always expanded and have nothing to toggle; `open` only
  // governs a finished trace.
  const bodyOpen = isLive || open

  // The collapse is pure CSS now (`grid-template-rows: 0fr → 1fr` on the body
  // below), so there is no height to measure, no ref, and no rAF dance — and
  // no stale cached height for streaming content to fight.

  if (!thinking && !hasContent) return null

  // Nothing has streamed in yet: the live row on its own, with nothing to
  // expand and so no chevron. Rendered through the same `LiveRow` as every
  // other phase rather than as a bare label, so when the first step arrives
  // the text doesn't jump sideways into a gutter that suddenly exists.
  //
  // Skipped entirely when this turn continues a hidden decision message: no
  // visible query introduced it, so this card's "something new just started"
  // framing would contradict that — the answer's own streaming caret is what
  // carries "still writing" here instead. Once a real step lands, `items`
  // stops being empty and the normal live card below takes over as usual.
  if (thinking && items.length === 0 && !drafting) {
    if (continuesHiddenTurn) return null
    return (
      // The same card, gap and row geometry as every later phase, so nothing
      // shifts when the first step lands. The two bars stand in for the step
      // text that is about to arrive — a skeleton of the shape, not a spinner
      // in an empty box.
      <div className="omni-trace mb-6 flex flex-col">
        <div className="px-5">
          <LiveRow label={liveLabel} chevron={false} open={open} onToggle={() => setOpen((v) => !v)} />
        </div>
        <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 px-5 pb-4" style={{ animation: 'omni-rise 240ms ease both' }}>
          <span />
          <div className="flex flex-col gap-2">
            <div
              className="h-[9px] w-[58%] rounded-full bg-[var(--line-strong)]"
              style={{ animation: 'omni-soft-pulse 1300ms ease-in-out infinite' }}
            />
            <div
              className="h-[9px] w-[34%] rounded-full bg-[var(--line-strong)]"
              style={{ animation: 'omni-soft-pulse 1300ms ease-in-out 220ms infinite' }}
            />
          </div>
        </div>
      </div>
    )
  }

  // No closing "Done" row: the collapsed summary line above already says the
  // turn is finished, and a trailing row under the last step read as one more
  // step. The live row, below, is the only thing that says "more is coming".
  // Every step, in the order it happened — the live one included, drawn in
  // place with a spinner for its icon and its results filling in as they land,
  // so the trace reads as one thread of steps rather than a list with a status
  // line bolted on. The separate live row survives only for the two moments
  // there is no step to draw: the agent is reasoning before its first action,
  // or an artifact is being written.
  const showTailLive = (thinking && liveIdx < 0) || !!drafting
  const lastIdx = items.length - 1

  return (
    // Three stacked pieces, in this order and for this reason: the summary
    // line, then the collapsing body, then the live row. The body opening
    // BETWEEN the other two is what makes expansion feel like the list growing
    // out of the header rather than a second panel appearing — the live row
    // never moves relative to the steps above it, it just gets more of them.
    /* ── The trace ────────────────────────────────────────────────────────
       Everything the agent did, on a sand panel rather than on the page
       ground. The panel is what separates "how the answer was reached" from
       the answer itself, so it appears only when there is something in it:
       while the turn is live, and when a finished trace is expanded. A
       collapsed, finished trace is just its one-line summary — no empty box.
       The sweep at the top is deliberately indeterminate; the agent cannot
       report a percentage, so the bar must not imply one. */
    <div className="mb-6">
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

      {/* The panel itself: the design's sand card, a flat 16px-gap column.
          It appears only when there is something in it — while the turn is
          live, and when a finished trace is expanded. A collapsed, finished
          trace is just its summary line; an empty box under it would read as
          a loading state that never resolves. */}
      <div
        className={
          bodyOpen
            ? `omni-trace flex flex-col ${showCompletedRow ? 'mt-2' : ''}`
            : ''
        }
      >

        {/* The collapsing body. `grid-template-rows: 0fr → 1fr` rather than a
            measured max-height: it animates to the row's real height with no
            JS measurement, so a reasoning block still typing itself in mid-open
            can't out-grow a height that was measured a frame ago. Opacity
            fades faster than the height, so a still-updating last row is
            invisible well before the box finishes closing. */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateRows: bodyOpen ? '1fr' : '0fr', opacity: bodyOpen ? 1 : 0 }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col px-5">
              {items.map((item, i) => (
                <TimelineRow
                  key={i}
                  item={item}
                  isActive={thinking && i === lastIdx}
                  live={i === liveIdx}
                  connectTop={i > 0}
                  connectBottom={i < lastIdx || showTailLive}
                  idPrefix={idPrefix}
                  onOpenScript={onOpenScript}
                />
              ))}
            </div>
          </div>
        </div>

        {showTailLive && (
          <div className="px-5">
            <LiveRow
              connectTop={items.length > 0}
              label={liveLabel}
              // The chevron always rides the topmost row, so the live row only
              // owns it before the first step has finished — the phase where it
              // IS the header. And only if the body has something in it: a first
              // tool call that arrived with no reasoning ahead of it would
              // otherwise offer a chevron that opens an empty box.
              chevron={false}
              open={open}
              onToggle={() => setOpen((v) => !v)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
