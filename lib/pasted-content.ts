// Long or code-like text pasted into a composer is lifted out of the query box
// and uploaded as `pasted_content.txt` through the normal file-upload flow, so
// it rides along as an attachment chip. Signed-out users can do this too.

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

/**
 * A lifted paste is uploaded as an ordinary text file with this name. The
 * backend recognises it (core/stream.py `is_pasted_content_name`) so it is
 * mounted for the agent like any upload but never cited or listed as a source.
 */
export const PASTED_FILE_NAME = 'pasted_content.txt'

export function pastedTextToFile(text: string): File {
    return new File([text], PASTED_FILE_NAME, { type: 'text/plain' })
}

export function isPastedFileName(name: string): boolean {
    return /^pasted_content(?:\(\d+\))?\.txt$/i.test(name)
}

/** What a chip calls an attachment: pasted text reads as such, files keep their name. */
export function attachmentLabel(name: string): string {
    return isPastedFileName(name) ? 'Pasted text' : name
}
