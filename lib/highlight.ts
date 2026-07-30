// Locate a verbatim (or near-verbatim) excerpt inside its source chunk so the
// UI can highlight just that span — mirrors Perplexity's "sources that
// support this claim" panel, where only the supporting phrase is highlighted
// rather than the whole passage.
//
// The backend's rerank LLM is instructed to copy the excerpt character-for-
// character from the chunk, so an exact `indexOf` is the common case. The
// whitespace/case-normalized fallback below covers the LLM collapsing a
// newline to a space or drifting on casing.
//
// Display policy: when the excerpt is found, show it highlighted plus up to
// `CONTEXT_LINES` lines of surrounding context on each side — not the whole
// chunk, which can run long. When it can't be found at all, fall back to a
// plain, unhighlighted prefix of the chunk (`FALLBACK_CHARS`) rather than
// guessing at a match.

const CONTEXT_LINES = 2
const FALLBACK_CHARS = 200

export interface HighlightSegment {
  text: string
  highlight: boolean
}

interface MatchRange {
  start: number
  end: number
}

interface LineRange {
  start: number
  end: number
}

function buildNormalizedMap(source: string): { normalized: string; map: number[] } {
  let normalized = ''
  const map: number[] = []
  let prevWasSpace = true // swallow leading whitespace instead of emitting a leading space
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        normalized += ' '
        map.push(i)
        prevWasSpace = true
      }
      continue
    }
    normalized += ch.toLowerCase()
    map.push(i)
    prevWasSpace = false
  }
  return { normalized, map }
}

function normalizeExcerpt(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function findMatchRange(chunk: string, excerptRaw: string): MatchRange | null {
  const excerpt = (excerptRaw || '').trim()
  if (!excerpt) return null

  let start = chunk.indexOf(excerpt)
  let end = start === -1 ? -1 : start + excerpt.length

  if (start === -1) {
    const { normalized, map } = buildNormalizedMap(chunk)
    const normExcerpt = normalizeExcerpt(excerpt)
    const normStart = normExcerpt ? normalized.indexOf(normExcerpt) : -1
    if (normStart !== -1 && map.length > 0) {
      const normEnd = normStart + normExcerpt.length - 1
      start = map[normStart]
      end = (map[normEnd] ?? map[map.length - 1]) + 1
    }
  }

  if (start === -1 || end <= start) return null
  return { start, end }
}

// "Lines" for context-window purposes: real newlines when the chunk has any,
// otherwise sentence boundaries — chunks are usually one continuous
// paragraph, so without this a chunk with no "\n" would count as a single
// line and the context window would degenerate to "the whole chunk".
function splitIntoLines(text: string): LineRange[] {
  const sepRe = text.includes('\n') ? /\n+/g : /(?<=[.!?。！？])\s+/g
  const lines: LineRange[] = []
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = sepRe.exec(text))) {
    lines.push({ start: cursor, end: m.index })
    cursor = m.index + m[0].length
  }
  lines.push({ start: cursor, end: text.length })
  return lines
}

function lineIndexAt(lines: LineRange[], pos: number): number {
  for (let i = 0; i < lines.length; i++) {
    if (pos >= lines[i].start && pos <= lines[i].end) return i
  }
  return lines.length - 1
}

// The backend prepends a `{title}\n{url}` header to each chunk (context for
// its own retrieval), which isn't part of the passage itself — the card
// already shows title/domain above this excerpt, so leaking it again here
// (verbatim, still percent-encoded) reads as a rendering bug. Strip any
// leading lines that are blank or equal `title`/`url` before matching or
// falling back, so neither can surface in what the reader sees.
function stripChunkHeader(chunk: string, title?: string, url?: string): string {
  const targets = [title, url]
    .filter((s): s is string => !!s && s.trim() !== '')
    .map((s) => s.trim().toLowerCase())
  if (targets.length === 0) return chunk

  const lines = chunk.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line === '' || targets.includes(line.toLowerCase())) {
      i++
      continue
    }
    break
  }
  return i === 0 ? chunk : lines.slice(i).join('\n').replace(/^\s+/, '')
}

// Whether `excerptRaw` can actually be located inside `chunkRaw` (same
// matching logic as `highlightExcerpt`, without building the segments) —
// used to decide whether an automatic check-source hit is worth surfacing
// as a highlightable dashed underline at all.
export function canHighlightExcerpt(chunkRaw: string, excerptRaw: string, title?: string, url?: string): boolean {
  const chunk = stripChunkHeader(chunkRaw, title, url)
  return findMatchRange(chunk, excerptRaw) !== null
}

export function highlightExcerpt(chunkRaw: string, excerptRaw: string, title?: string, url?: string): HighlightSegment[] {
  const chunk = stripChunkHeader(chunkRaw, title, url)
  const match = findMatchRange(chunk, excerptRaw)
  if (!match) {
    const truncated = chunk.length > FALLBACK_CHARS
    return [{ text: chunk.slice(0, FALLBACK_CHARS).trimEnd() + (truncated ? '…' : ''), highlight: false }]
  }

  const lines = splitIntoLines(chunk)
  const startLineIdx = lineIndexAt(lines, match.start)
  const endLineIdx = lineIndexAt(lines, Math.max(match.start, match.end - 1))
  const windowStart = lines[Math.max(0, startLineIdx - CONTEXT_LINES)].start
  const windowEnd = lines[Math.min(lines.length - 1, endLineIdx + CONTEXT_LINES)].end

  const segments: HighlightSegment[] = []
  const prefix = chunk.slice(windowStart, match.start)
  if (windowStart > 0 || prefix) {
    segments.push({ text: (windowStart > 0 ? '…' : '') + prefix, highlight: false })
  }
  segments.push({ text: chunk.slice(match.start, match.end), highlight: true })
  const suffix = chunk.slice(match.end, windowEnd)
  if (windowEnd < chunk.length || suffix) {
    segments.push({ text: suffix + (windowEnd < chunk.length ? '…' : ''), highlight: false })
  }
  return segments
}
