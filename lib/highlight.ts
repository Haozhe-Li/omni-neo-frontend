// Locate a verbatim (or near-verbatim) excerpt inside its source chunk so the
// UI can highlight just that span — mirrors Perplexity's "sources that
// support this claim" panel, where only the supporting phrase is highlighted
// rather than the whole passage.
//
// The backend's rerank LLM is instructed to copy the excerpt character-for-
// character from the chunk, so an exact `indexOf` is the common case. The
// whitespace/case-normalized fallback below covers the LLM collapsing a
// newline to a space or drifting on casing — anything beyond that just
// renders unhighlighted rather than guessing.

export interface HighlightSegment {
  text: string
  highlight: boolean
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

export function highlightExcerpt(chunk: string, excerptRaw: string): HighlightSegment[] {
  const excerpt = (excerptRaw || '').trim()
  if (!excerpt) return [{ text: chunk, highlight: false }]

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

  if (start === -1 || end <= start) {
    return [{ text: chunk, highlight: false }]
  }

  const segments: HighlightSegment[] = []
  if (start > 0) segments.push({ text: chunk.slice(0, start), highlight: false })
  segments.push({ text: chunk.slice(start, end), highlight: true })
  if (end < chunk.length) segments.push({ text: chunk.slice(end), highlight: false })
  return segments
}
