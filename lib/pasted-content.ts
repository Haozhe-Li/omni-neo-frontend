// Long text pasted into a composer is lifted out of the query box into an
// attachment chip and sent as `pasted_content` (core/utils/data_model.py), not
// uploaded as a file: it has to work signed-out, and it must never show up in
// the Sources rail.

/** Mirrors QueryRequest.pasted_content's cap (max 5 items). */
export const MAX_PASTED_ITEMS = 5
/** Mirrors MAX_PASTED_CONTENT_CHARS in core/utils/data_model.py. */
export const MAX_PASTED_CHARS = 100_000

// "Long": either many characters (CJK counts per character, so 1000 is still a
// lot of text) or many lines (a pasted list, a log excerpt).
const LONG_MIN_CHARS = 1000
const LONG_MIN_LINES = 15
// "Code": needs a few lines to be told apart from a pasted command or a
// sentence with a semicolon in it.
const CODE_MIN_LINES = 3
const CODE_MIN_RATIO = 0.4

const CODE_LINE_PATTERNS: RegExp[] = [
    /[;{}]\s*$/,
    /=>|::|\+\+|--\w|&&|\|\||!==?|===?/,
    /^\s*(?:async\s+)?(?:def|function|fn|func)\s+\w+\s*[(<]/,
    /^\s*(?:class|interface|enum|struct)\s+\w+[^.!?]*[{:(]\s*$/,
    /^\s*(?:const|let|var)\s+[\w{[]+.*=/,
    /^\s*import\s+(?:[\w*{},\s]+\s+from\s+)?["'][^"']+["']/,
    /^\s*import\s+[\w.*]+;?\s*$/,
    /^\s*export\s+(?:default|const|function|class|async|type|interface)\b/,
    /^\s*(?:public|private|protected)\s+[^.!?]*[({=;]/,
    /^\s*(?:package|namespace)\s+[\w.]+;?\s*$/,
    /^\s*from\s+[\w.]+\s+import\b/,
    /^\s*#\s*(?:include|define|ifdef|endif|pragma)\b/,
    /^\s*(?:if|for|while|switch|catch|elif)\s*\(.*\)/,
    /^\s*(?:else|try|finally|elif|except)\b.*:\s*$/,
    /^\s*(?:\/\/|\/\*|\*\/|\*\s|#!)/,
    /^\s*<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\/?>/,
    /^\s*@\w+(?:\(.*\))?\s*$/,
    /\w\(.*\)\s*(?:\{|:|;)?\s*$/,
    /^\s*["']?[\w-]+["']?\s*:\s*[^\s].*,\s*$/,
]

function nonEmptyLines(text: string): string[] {
    return text.split(/\r?\n/).filter((l) => l.trim().length > 0)
}

export function looksLikeCode(text: string): boolean {
    const t = text.trim()
    const lines = nonEmptyLines(t)
    if (lines.length < CODE_MIN_LINES) return false
    // A fenced block is code however its lines look.
    if (/^```/m.test(t) && /```\s*$/.test(t)) return true
    // JSON / array literal spread over several lines.
    if (/^[[{]/.test(t) && /[\]}]$/.test(t)) {
        try {
            JSON.parse(t)
            return true
        } catch {
            /* fall through to the line heuristic */
        }
    }
    const hits = lines.filter((l) => CODE_LINE_PATTERNS.some((re) => re.test(l))).length
    return hits / lines.length >= CODE_MIN_RATIO
}

export function isLongText(text: string): boolean {
    return text.trim().length >= LONG_MIN_CHARS || nonEmptyLines(text).length >= LONG_MIN_LINES
}

/** Whether a paste should become an attachment instead of landing in the box. */
export function shouldAttachPaste(text: string): boolean {
    if (!text.trim()) return false
    return isLongText(text) || looksLikeCode(text)
}

export function describePaste(text: string): { label: string; detail: string } {
    const chars = text.length
    const lines = text.split(/\r?\n/).length
    const detail = lines > 1 ? `${lines.toLocaleString()} lines · ${chars.toLocaleString()} chars` : `${chars.toLocaleString()} chars`
    return { label: looksLikeCode(text) ? 'Pasted code' : 'Pasted text', detail }
}
