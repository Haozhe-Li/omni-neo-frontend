// "Verify claim" dashed-underline candidates — the frontend half of a
// silent, best-effort claim-checking feature: pick a handful of sentences
// from a finished answer that look like they carry a checkable claim
// (a bolded figure, a bare number, a verdict-y superlative), fire each
// through the existing `/check_source` endpoint in the background, and let
// the caller decide what to do with whichever ones come back with matches.
//
// Deliberately imprecise — accuracy isn't the goal, `/check_source` is the
// real filter (a sentence with no supporting chunk just gets no badge, at
// the cost of one wasted request). This only needs to keep request volume
// bounded (see `max` in `extractClaimCandidates`) and never pick a span that
// would corrupt the surrounding markdown when wrapped.

const VERDICT_KEYWORDS = [
    '超额', '首个', '第一', '最大', '最小', '最快', '最高', '最低', '唯一', '领先', '顶级', '独家', '领投', '突破',
    'first', 'largest', 'smallest', 'fastest', 'highest', 'lowest', 'only', 'leading', 'oversubscribed', 'record',
]

// Hard floor so we don't fire `/check_source` for a two-word fragment.
const MIN_LEN = 6

export interface ClaimCandidate {
    /** Stable within one extraction run — callers that need global uniqueness
     * should namespace it themselves (e.g. by message index), since a single
     * `ClaimCandidate[]` is always scoped to one message's content. */
    id: string
    start: number
    end: number
    /** Original text, formatting and citation markers intact — this is what
     * gets wrapped in a `<span data-verify>` for rendering. */
    raw: string
    /** `raw` with `[n]` citation markers and `**`/`` ` `` emphasis stripped —
     * this is what actually gets sent to `/check_source` as the claim. */
    query: string
}

function stripCitationMarkers(s: string): string {
    return s.replace(/\[(\d+)\](?!\()/g, '')
}

function stripEmphasis(s: string): string {
    return s.replace(/\*\*/g, '').replace(/`/g, '')
}

function scoreSentence(raw: string): number {
    let score = 0
    if (/\*\*[^*]*\d[^*]*\*\*/.test(raw)) score += 2
    else if (/\d/.test(raw)) score += 1
    if (VERDICT_KEYWORDS.some((k) => raw.includes(k))) score += 1
    if (/\[(\d+)\](?!\()/.test(raw)) score += 1
    return score
}

// A span is only safe to wrap in `<span data-verify>` if it doesn't leave an
// odd `**` behind — an unpaired `**` would corrupt bold parsing for
// everything after it, not just this span. `[`/`]`/`(`/`)` balance isn't
// checked: citation links are always fully contained in one sentence in
// practice, and a wrap failure here just means one fewer badge, not broken
// rendering (the `<span>` tag itself can't break on odd brackets).
function isSafeToWrap(text: string): boolean {
    const boldMarkers = text.match(/\*\*/g)
    return !boldMarkers || boldMarkers.length % 2 === 0
}

interface RawSpan {
    start: number
    end: number
    text: string
}

// Sentence-splits a single line (no `\n`) with offsets. Two different rules
// per punctuation family, because CJK prose doesn't put a space after a
// sentence-ending mark the way English does:
//   - `。！？` split immediately, unconditionally — these are never used as
//     decimal separators or in abbreviations, so there's no ambiguity to
//     guard against (mirrors `splitIntoLines` in `lib/highlight.ts`, but that
//     one only handles the "no `\n` at all" case; this also has to split
//     *within* a single long CJK line that has no spaces anywhere).
//   - `.!?` only split when followed by whitespace, so "520.5" or "U.S."
//     don't get sliced into fragments.
function splitLineIntoSentences(line: string, lineOffset: number): RawSpan[] {
    const spans: RawSpan[] = []
    const sepRe = /(?<=[。！？])|(?<=[.!?])(?=\s)/g
    let cursor = 0
    for (const m of line.matchAll(sepRe)) {
        const idx = m.index as number
        if (idx <= cursor) continue
        const text = line.slice(cursor, idx)
        if (text.trim()) spans.push({ start: lineOffset + cursor, end: lineOffset + idx, text })
        cursor = idx
    }
    const rest = line.slice(cursor)
    if (rest.trim()) spans.push({ start: lineOffset + cursor, end: lineOffset + line.length, text: rest })
    return spans
}

// A list item's `- `/`1. ` marker must stay at column 0 of its line for
// remark to recognize it as a list item — wrapping a span that starts at
// the marker itself would push it past column 0 and silently turn the list
// item into a plain paragraph. This finds how much of the line to skip.
const LIST_MARKER_RE = /^(\s*)(?:[-*+]|\d+\.)\s+/

// A trailing citation is often placed at the very start of the *next*
// sentence's text rather than glued to the end of the one it belongs to
// (e.g. "...超额认购。[2] Menos AI 是..." — the `[2]` backs the previous
// sentence). Left alone, the next span's wrap would visually swallow that
// unrelated citation pill under its dashed underline. Trim it off the front.
const LEADING_CITATIONS_RE = /^(?:\[\d+\]\s*)+/

function candidateSpansInLine(line: string, lineOffset: number): RawSpan[] {
    const trimmed = line.trim()
    if (!trimmed) return []
    if (/^```/.test(trimmed)) return [] // caller already excludes fence bodies; belt-and-suspenders
    if (/^#{1,6}\s/.test(trimmed)) return [] // heading
    if (/^\|/.test(trimmed)) return [] // table row
    if (/^>/.test(trimmed)) return [] // blockquote — skip for simplicity

    const listMatch = line.match(LIST_MARKER_RE)
    const proseStart = listMatch ? listMatch[0].length : 0
    const prose = line.slice(proseStart)
    return splitLineIntoSentences(prose, lineOffset + proseStart).map((span) => {
        const leading = span.text.match(LEADING_CITATIONS_RE)
        if (!leading) return span
        return { start: span.start + leading[0].length, end: span.end, text: span.text.slice(leading[0].length) }
    })
}

// Splits raw markdown into sentence-ish spans with offsets into the original
// string, skipping fenced code blocks, headings, table rows and blockquotes
// (wrapping across those risks corrupting their markdown syntax; list items
// and plain paragraphs are fair game).
function collectCandidateSpans(content: string): RawSpan[] {
    const spans: RawSpan[] = []
    let cursor = 0
    let inFence = false
    for (const line of content.split('\n')) {
        const lineOffset = cursor
        cursor += line.length + 1 // account for the '\n' split() consumed
        if (/^\s*```/.test(line)) { inFence = !inFence; continue }
        if (inFence) continue
        spans.push(...candidateSpansInLine(line, lineOffset))
    }
    return spans
}

/**
 * Picks up to `max` sentence-ish spans from a finished answer that look
 * worth silently checking against `/check_source`, highest-scoring first
 * (ties broken by document order). Call once per finished message — not
 * meant to run against content that's still streaming in.
 */
export function extractClaimCandidates(content: string, max = 5): ClaimCandidate[] {
    const spans = collectCandidateSpans(content)
    const scored = spans
        .map((s, i) => ({ ...s, i, score: scoreSentence(s.text) }))
        .filter((s) => s.score > 0 && s.text.trim().length >= MIN_LEN && isSafeToWrap(s.text))
    scored.sort((a, b) => b.score - a.score || a.i - b.i)
    return scored.slice(0, max).map((s, idx) => ({
        id: `vc${idx}`,
        start: s.start,
        end: s.end,
        raw: s.text,
        query: stripEmphasis(stripCitationMarkers(s.text)).replace(/\s{2,}/g, ' ').trim(),
    }))
}

export interface VerifiedSpan {
    id: string
    start: number
    end: number
}

/**
 * Wraps each confirmed span (one that came back from `/check_source` with a
 * hit) in `<span data-verify="id">…</span>`, splicing directly into the raw
 * markdown string *before* it reaches `preprocessMarkdown` — offsets are
 * computed against this exact string, so nothing else may touch it first.
 * `rehypeRaw` parses the tag as inline HTML, so markdown inside it (bold,
 * citation links) keeps rendering normally; overlapping/out-of-range spans
 * are dropped rather than risk a malformed splice.
 */
export function spliceVerifyMarkers(content: string, spans: VerifiedSpan[]): string {
    if (spans.length === 0) return content
    const sorted = [...spans].sort((a, b) => a.start - b.start)
    let result = ''
    let cursor = 0
    for (const s of sorted) {
        if (s.start < cursor || s.end <= s.start || s.end > content.length) continue
        result += content.slice(cursor, s.start)
        result += `<span data-verify="${s.id}">${content.slice(s.start, s.end)}</span>`
        cursor = s.end
    }
    result += content.slice(cursor)
    return result
}
