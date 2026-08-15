import type { Source } from './types'

/**
 * Preprocesses markdown content to fix math delimiters and other formatting issues.
 * Specifically handles display math wrapped in [ ] and inline math in ( )
 * by converting them to $$ $$ and $ $ for remark-math.
 *
 * Fenced code blocks (```...```) are left untouched, so JSON inside an
 * ```echarts``` / ```mermaid``` block never gets mangled by the math rewrites.
 */
// remark-math treats a bare `$` as an inline-math delimiter (`singleDollarTextMath`,
// on by default), which collides with plain currency amounts like "$1.25 billion".
// The model routinely cites two dollar figures in one sentence ("valued at $1.25
// billion ... raised $125 million"); remark-math then reads the first `$` as an
// opening delimiter and the *second* dollar amount's `$` as the matching close,
// swallowing everything between — headings, citation markers, even raw HTML spans
// — into one KaTeX node, which renders it in math mode (collapsing all whitespace
// into the squashed, italicized run seen in the bug report).
//
// Fix: escape every `$` immediately followed by a digit (the currency signature)
// to `\$` *before* remark-math ever sees it — CommonMark's backslash-escape turns
// it into a literal `$` text node, so it can no longer pair up as a delimiter.
// Doesn't touch `$` used to open real LaTeX (never followed directly by a digit,
// and in this app real math only ever arrives via the bracket/paren conversions
// below, which inject their own unescaped `$`/`$$` afterward).
function escapeCurrencyDollars(text: string): string {
    return text.replace(/(?<!\\)\$(?=\d)/g, '\\$')
}

function transformMath(text: string): string {
    return text
        // 1. Convert block math [ math ] or \[ math \] to $$ math $$
        // We look for [ or \[ at the start of a line (or after a newline)
        // and wait for the corresponding ] or \].
        .replace(/(^|\n)\[\s*([\s\S]*?)\s*\](?=\n|$)/g, '$1$$\n$2\n$$')
        .replace(/(^|\n)\\\[\s*([\s\S]*?)\s*\\\](?=\n|$)/g, '$1$$\n$2\n$$')

        // 2. Convert inline math ( math ) or \( math \) to $ math $ if it looks like LaTeX
        // We check if it contains common LaTeX commands to avoid false positives with regular parentheses
        .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, '$$$1$$')
        .replace(/\(\s*(\\.*|.*(\\text|\\frac|\\sum|\\approx|\\times|\\alpha|\\beta|\\gamma|\\rho|\\sigma|\\tau|\\theta|\\omega|\\Delta|\\nabla|\\partial|\\cdot|\\infty|\\le|\\ge|\\ne).*?)\s*\)/g, '$$$1$$')

        // 3. Handle leftover bracket math that might be mid-sentence but definitely looks like LaTeX
        .replace(/\[\s*(\\.*|.*(\\text|\\frac|\\sum|\\approx|\\times).*?)\s*\]/g, '$$$1$$')
}

// CommonMark only treats `**`/`*` as opening/closing emphasis when it isn't
// directly flanked by punctuation on the inside while an ordinary character
// sits on the outside (the "flanking" rule). Chinese prose commonly wraps a
// bolded term straight in quotes with no surrounding space —
// `一套**"数据操作系统"**，帮助…` — which fails that rule: the `**` right before
// the quote never opens, so it renders as a literal `**`, and the now-unpaired
// delimiter can go on to mis-pair with an unrelated `**` later in the
// document, corrupting rendering well past this one spot.
//
// Fix: peel quote/book-title-mark punctuation sitting just inside the `**`
// markers out to just outside them — `**"foo"**` -> `"**foo**"`. Once there,
// the `**` is flanked by ordinary text on both sides and always parses.
// Deliberately excludes `()`/（）, which double as link syntax `[text](url)`,
// so this can't collide with citations or links.
const WRAP_OPEN = '["\'“‘「『《【]'
const WRAP_CLOSE = '["\'”’」』》】]'
const BOLD_FLANKING_RE = new RegExp(`\\*\\*(${WRAP_OPEN}*)([^\\n]+?)(${WRAP_CLOSE}*)\\*\\*`, 'g')

function fixEmphasisFlanking(text: string): string {
    return text.replace(BOLD_FLANKING_RE, (match, lead, inner, trail) => {
        if (!lead && !trail) return match
        return `${lead}**${inner}**${trail}`
    })
}

// The mirror image of the same flanking rule, on the *closing* marker: a `**`
// preceded by punctuation only closes when the character right after it is
// whitespace or punctuation. Chinese prose breaks this constantly, because a
// bolded label keeps its colon inside the bold and the sentence runs straight
// on afterwards with no space:
//
//   `- **主题：**建筑秘道、湖滨小径。`
//
// The closing `**` is preceded by `：` and followed by `建`, so it never closes;
// the whole run renders as literal asterisks (exactly the bug report), and the
// unpaired delimiters can then mis-pair with a later `**` further down. The
// same thing happens in ASCII (`**Theme:**text`) — it's spec behaviour, not a
// CJK-only quirk — but only CJK text hits it routinely, since English writing
// naturally puts a space after the colon.
//
// Fix: peel the trailing punctuation out of the bold — `**主题：**建筑` ->
// `**主题**：建筑` — which parses and reads identically. Only runs that are
// actually broken get rewritten: when the character after the closing `**` is
// whitespace, punctuation or end of line, CommonMark closes it fine and the
// text is left exactly as written.
const BOLD_CLOSE_RE = /\*\*(?!\s)([^*\n]+?)\*\*(?=(\S))/gu
const INNER_TRAILING_PUNCT_RE = /[\p{P}\p{S}]+$/u
// An "ordinary" character for flanking purposes: anything CommonMark counts as
// neither whitespace nor punctuation. Letters (CJK ideographs included) and
// digits are what actually appear after a mis-closed `**`.
const ORDINARY_CHAR_RE = /[\p{L}\p{N}]/u

// Both emphasis repairs rewrite `**` markers, which are literal characters
// inside an inline code span — `` `**code：**inline` `` must survive untouched.
// The capturing group keeps the spans in the split result, so only the prose
// between them is rewritten. (Fenced blocks are already split off by
// `preprocessMarkdown` before any of this runs.)
function outsideInlineCode(text: string, fix: (segment: string) => string): string {
    return text
        .split(/(`+[^`\n]*?`+)/g)
        .map((segment) => (segment.startsWith('`') ? segment : fix(segment)))
        .join('')
}

function fixEmphasisClosing(text: string): string {
    return text.replace(BOLD_CLOSE_RE, (match, inner: string, next: string) => {
        if (!ORDINARY_CHAR_RE.test(next)) return match
        const trail = inner.match(INNER_TRAILING_PUNCT_RE)
        if (!trail) return match
        const head = inner.slice(0, inner.length - trail[0].length)
        // Nothing but punctuation inside — not a bold run worth rescuing.
        if (!head) return match
        return `**${head}**${trail[0]}`
    })
}

// Rewrites `[n]` inline citation markers into `[n](citation:n)` so they parse
// as ordinary markdown links (intercepted by a custom `a` renderer) instead of
// literal bracketed text. Only markers with a known source are rewritten —
// stray `[3]` with no matching source is left as plain text. Must run before
// transformMath, since a citation-marker-only line like `[1]` would otherwise
// be mistaken for a display-math block.
//
// Runs of adjacent markers for the same claim (`[1][2][3]`, emitted back-to-back
// by the model) are then merged into a single link carrying every number
// (`citation:1,2,3`), so the UI renders one combined badge instead of a pill
// per citation.
function transformCitations(text: string, citationNumbers?: Set<number>): string {
    if (!citationNumbers || citationNumbers.size === 0) return text
    // No `(?<!\])` guard here: that would also block the very common case of
    // adjacent markers (`[1][2]`) by rejecting the second one because it's
    // preceded by the first's `]`. Reference-style links (`[text][1]`) are not
    // a real concern for model-generated answers.
    const withLinks = text.replace(/\[(\d+)\](?!\()/g, (match, n) => {
        return citationNumbers.has(Number(n)) ? `[${n}](citation:${n})` : match
    })
    return withLinks.replace(/(?:\[\d+\]\(citation:\d+\))+/g, (run) => {
        const nums = [...run.matchAll(/\[(\d+)\]\(citation:\d+\)/g)].map((m) => m[1])
        return nums.length > 1 ? `[${nums[0]}](citation:${nums.join(',')})` : run
    })
}

// Same recognized-number guard as `transformCitations`, but removes the
// marker outright instead of linking it. Used while an answer is still
// streaming in: citations arrive interleaved with prose one token at a time,
// so linking (or even leaving bare `[1]` text visible) would flash pills/
// brackets into existence one by one as the model happens to emit them.
// Stripped during the stream, then revealed together — normalized by
// `moveCitationsAfterPunctuation`, each with its own fade-in — once it
// finishes.
function stripCitationsForStreaming(text: string, citationNumbers?: Set<number>): string {
    if (!citationNumbers || citationNumbers.size === 0) return text
    return text.replace(/\[(\d+)\](?!\()/g, (match, n) => (citationNumbers.has(Number(n)) ? '' : match))
}

// Moves a citation-marker run that landed immediately *before* trailing
// punctuation to just *after* it instead. The model very often emits
// "...520 万美元[1][2]。" — the citations glued right in front of the full
// stop — which reads oddly since the numbers interrupt the sentence's own
// punctuation rather than following it. Only touches a run that's directly
// adjacent (no space) to one of `。！？.!?，,；;：:` immediately following it;
// a citation that already sits after punctuation (including text this
// already ran on — it's idempotent), or isn't touching any punctuation at
// all, is left exactly where it was.
//
// Runs at RENDER time only, as a `preprocessMarkdown` step — never against
// content that gets stored or synced. The backend records each turn itself
// server-side and reconciles the frontend's /sync payloads against that
// record by content, so a frontend that syncs back a rewritten `content`
// creates a second, unmatched copy of the whole turn — the
// duplicated-turn-after-refresh bug. Doing it here keeps stored bytes
// identical to the backend's record while every render surface (chat,
// report panel, published Pages) still shows the tidied order.
function moveCitationsAfterPunctuation(segment: string): string {
    return segment.replace(/((?:\[\d+\])+)([。！？.!?，,；;：:])/g, '$2$1')
}

// Scans raw (untransformed) message content for `[n]` inline citation markers
// and returns the set of numbers actually cited in the text. Used to tell
// sources the model cited from sources it merely fetched but never referenced
// (excludes `[1](url)`-style markdown links, same guard as transformCitations).
export function extractCitedNumbers(content: string): Set<number> {
    const nums = new Set<number>()
    if (!content) return nums
    for (const match of content.matchAll(/\[(\d+)\](?!\()/g)) nums.add(Number(match[1]))
    return nums
}

export interface LabeledSource {
    source: Source
    /** Display number — the source's real citation number (`n`) when known, else its position. */
    label: number
}

// Splits sources into ones the text actually cites inline (`[n]`) and ones that
// were only fetched/read. Shared by every surface that lists an answer's
// sources (chat drawer, published Pages report) so "used" means the same thing
// everywhere. Falls back to a flat, unsplit list (`split: false`) when there's
// no citation data to go on — e.g. older content saved before `n` was tracked —
// so that content keeps looking exactly as it did before.
export function partitionSources(
    sources: Source[],
    citedNumbers?: Set<number>
): { used: LabeledSource[]; unused: LabeledSource[]; split: boolean } {
    const labeled = sources.map((s, i) => ({ source: s, label: s.n ?? i + 1 }))
    if (!citedNumbers || citedNumbers.size === 0) {
        return { used: [], unused: labeled, split: false }
    }
    const used = labeled.filter(({ source }) => typeof source.n === 'number' && citedNumbers.has(source.n))
    const unused = labeled.filter(({ source }) => !(typeof source.n === 'number' && citedNumbers.has(source.n)))
    return { used, unused, split: true }
}

export function preprocessMarkdown(
    content: any,
    citationNumbers?: Set<number>,
    options?: { hideCitations?: boolean }
): string {
    if (!content) return ''

    // Ensure content is a string before using .replace
    const text = typeof content === 'string' ? content : String(content)
    const citationStep = options?.hideCitations ? stripCitationsForStreaming : transformCitations

    // Split out fenced code blocks and only run citation/math transforms on the
    // prose between them. The capturing group keeps the fences in the result array.
    return text
        .split(/(```[\s\S]*?```)/g)
        .map((segment) =>
            segment.startsWith('```')
                ? segment
                : transformMath(
                      citationStep(
                          // `fixEmphasisFlanking` first: it peels quotes out of
                          // `**"foo"**`, which is what makes the closing marker
                          // legal there. Whatever punctuation it leaves inside
                          // the bold is then handled by `fixEmphasisClosing`.
                          outsideInlineCode(escapeCurrencyDollars(moveCitationsAfterPunctuation(segment)), (prose) =>
                              fixEmphasisClosing(fixEmphasisFlanking(prose))
                          ),
                          citationNumbers
                      )
                  )
        )
        .join('')
}
