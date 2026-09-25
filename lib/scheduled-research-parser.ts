// Parses an inline `<scheduled-research title="…" frequency="…" time="…">…</scheduled-research>`
// block out of an assistant answer — a proposal for a new recurring task,
// taught by the backend's scheduled-research skill.
//
// Like `<report>` and `<textblock>`, this streams inline in the plain `text`
// field rather than arriving as its own SSE event, but unlike those two it is
// meant to be the terminal thing in a turn (the skill teaches the agent to
// always end its response with it — same rule as the `<question>` block), so
// this parser follows `lib/question-parser.ts`'s simpler, non-progressive
// shape: while the block is still streaming in, everything from the opening
// tag onward is just hidden until the closing tag (and a parseable set of
// attributes) has fully arrived.

import type { ScheduleFrequency } from './cron'

export interface ParsedScheduledResearch {
  title: string
  /** The research instruction — becomes `prompt` in the create-task POST body. */
  prompt: string
  frequency: ScheduleFrequency
  time: string // "HH:MM", 24h, local
  weekday?: number // 0 (Sunday) – 6 (Saturday), only set when frequency === 'weekly'
  dayOfMonth?: number // 1–28, only set when frequency === 'monthly'
}

export interface ParsedScheduledResearchResult {
  /** Message text with the block stripped out. */
  text: string
  scheduledResearch: ParsedScheduledResearch | null
  /** True when the opening tag has arrived but the closing tag hasn't yet (mid-stream). */
  pending: boolean
}

const OPEN_TAG = /<scheduled-research\b/i
const BLOCK_RE = /<scheduled-research\b([^>]*)>([\s\S]*?)<\/scheduled-research\s*>/i
// Partial opening tag mid-stream, e.g. "<scheduled-rese" — stripped so it
// never flashes as literal text before the rest of the tag arrives.
const PARTIAL_OPEN_RE = /<s(?:c(?:h(?:e(?:d(?:u(?:l(?:e(?:d(?:-(?:r(?:e(?:s(?:e(?:a(?:r(?:c(?:h)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?$/i

function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'`, 'i')
  const m = attrs.match(re)
  if (!m) return undefined
  return (m[1] ?? m[2] ?? '').trim()
}

function clampInt(value: string | undefined, min: number, max: number): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = parseInt(value, 10)
  if (Number.isNaN(n)) return undefined
  return Math.min(max, Math.max(min, n))
}

/**
 * Extract a `<scheduled-research>…</scheduled-research>` block from `content`.
 * Mirrors `parseQuestion`'s contract: at most one block, always treated as
 * trailing the message (everything from the opening tag onward is hidden
 * until the block fully closes).
 */
export function parseScheduledResearch(content: string): ParsedScheduledResearchResult {
  const match = BLOCK_RE.exec(content)
  if (!match) {
    const openIdx = content.search(OPEN_TAG)
    if (openIdx !== -1) {
      return { text: content.slice(0, openIdx).trimEnd(), scheduledResearch: null, pending: true }
    }
    const stripped = content.replace(PARTIAL_OPEN_RE, '')
    return { text: stripped, scheduledResearch: null, pending: false }
  }

  const [, attrs, body] = match
  const before = content.slice(0, match.index).trimEnd()
  const after = content.slice(match.index + match[0].length).trimStart()
  const text = [before, after].filter(Boolean).join('\n\n')

  const prompt = body.trim()
  const title = attr(attrs, 'title') || 'Scheduled Research'
  const frequencyRaw = (attr(attrs, 'frequency') || 'daily').toLowerCase()
  const frequency: ScheduleFrequency =
    frequencyRaw === 'weekly' || frequencyRaw === 'monthly' ? frequencyRaw : 'daily'
  const time = attr(attrs, 'time') || '09:00'
  const weekday = frequency === 'weekly' ? clampInt(attr(attrs, 'weekday'), 0, 6) ?? 1 : undefined
  const dayOfMonth = frequency === 'monthly' ? clampInt(attr(attrs, 'day_of_month'), 1, 28) ?? 1 : undefined

  if (!prompt) {
    // Malformed/empty body — nothing sensible to propose; leave the raw tag
    // visible rather than silently dropping the agent's turn.
    return { text: content, scheduledResearch: null, pending: false }
  }

  return {
    text,
    scheduledResearch: { title, prompt, frequency, time, weekday, dayOfMonth },
    pending: false,
  }
}
