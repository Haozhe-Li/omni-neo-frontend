/**
 * Preprocesses markdown content to fix math delimiters and other formatting issues.
 * Specifically handles display math wrapped in [ ] and inline math in ( )
 * by converting them to $$ $$ and $ $ for remark-math.
 *
 * Fenced code blocks (```...```) are left untouched, so JSON inside an
 * ```echarts``` / ```mermaid``` block never gets mangled by the math rewrites.
 */
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

export function preprocessMarkdown(content: any, citationNumbers?: Set<number>): string {
    if (!content) return ''

    // Ensure content is a string before using .replace
    const text = typeof content === 'string' ? content : String(content)

    // Split out fenced code blocks and only run citation/math transforms on the
    // prose between them. The capturing group keeps the fences in the result array.
    return text
        .split(/(```[\s\S]*?```)/g)
        .map((segment) =>
            segment.startsWith('```') ? segment : transformMath(transformCitations(segment, citationNumbers))
        )
        .join('')
}
