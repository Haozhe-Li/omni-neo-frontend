// Parses inline `<textblock>…</textblock>` blocks out of an assistant answer.
//
// The backend emits these when the user asked for a finished, standalone piece
// of text — a polish/proofread/translation result, a drafted document, or a
// drafted email (`<textblock type="email" subject="…">…</textblock>`). Like
// `<report>` blocks they stream inline rather than arriving as a separate
// event, so the parser tolerates a block that's still arriving: an opening
// tag whose `>` hasn't streamed yet, or a body with no closing tag. In those
// cases the block comes back with `complete: false` and whatever body has
// arrived so far, so the card can render live while it fills in.

export interface ParsedTextBlock {
  id: string
  kind: 'text' | 'email'
  /** Only set when kind === 'email'. */
  subject: string | null
  content: string
  complete: boolean
}

export type TextBlockSegment = { type: 'text'; content: string } | { type: 'textblock'; block: ParsedTextBlock }

const OPEN_TAG = /<textblock\b/i
const CLOSE_TAG = /<\/textblock\s*>/i

function extractAttrs(attrs: string): { kind: 'text' | 'email'; subject: string | null } {
  const typeMatch = attrs.match(/type\s*=\s*"([^"]*)"/i) || attrs.match(/type\s*=\s*'([^']*)'/i)
  const subjectMatch = attrs.match(/subject\s*=\s*"([^"]*)"/i) || attrs.match(/subject\s*=\s*'([^']*)'/i)
  const kind = typeMatch && typeMatch[1].trim().toLowerCase() === 'email' ? 'email' : 'text'
  return { kind, subject: subjectMatch ? subjectMatch[1] : null }
}

/**
 * Extract every `<textblock>…</textblock>` (or `<textblock type="email" …>`)
 * block from `raw`, in source order, alongside the surrounding narration.
 * `keyPrefix` should be unique per call site so ids don't collide when a
 * message has been split into several segments already (e.g. around reports
 * or a `<question>` block).
 */
export function parseTextBlocks(raw: string, keyPrefix = 'tb'): { text: string; segments: TextBlockSegment[] } {
  const source = raw || ''
  if (!OPEN_TAG.test(source)) {
    // Strip a trailing partial `<textblo…` fragment so an opening tag that is
    // mid-stream never flashes as literal text in chat.
    const stripped = source.replace(/<t(?:e(?:x(?:t(?:b(?:l(?:o(?:c(?:k)?)?)?)?)?)?)?)?$/i, '')
    return { text: stripped, segments: stripped ? [{ type: 'text', content: stripped }] : [] }
  }

  const segments: TextBlockSegment[] = []
  let text = ''
  let rest = source
  let idx = 0

  const pushText = (chunk: string) => {
    if (!chunk) return
    text += chunk
    segments.push({ type: 'text', content: chunk })
  }

  while (true) {
    const open = rest.match(OPEN_TAG)
    if (!open) {
      pushText(rest)
      break
    }
    pushText(rest.slice(0, open.index))
    const afterTag = rest.slice(open.index!) // starts with "<textblock"
    const gt = afterTag.indexOf('>')
    const id = `${keyPrefix}-textblock-${idx}`

    if (gt === -1) {
      // Opening tag itself is still streaming in — no attrs/body yet.
      segments.push({ type: 'textblock', block: { id, kind: 'text', subject: null, content: '', complete: false } })
      break
    }

    const attrs = afterTag.slice(10, gt)
    const afterOpen = afterTag.slice(gt + 1)
    const { kind, subject } = extractAttrs(attrs)
    const close = afterOpen.match(CLOSE_TAG)

    if (!close) {
      // Body is still streaming — render what we have so far.
      segments.push({ type: 'textblock', block: { id, kind, subject, content: afterOpen.trim(), complete: false } })
      break
    }

    const body = afterOpen.slice(0, close.index)
    segments.push({ type: 'textblock', block: { id, kind, subject, content: body.trim(), complete: true } })
    rest = afterOpen.slice(close.index! + close[0].length)
    idx++
  }

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), segments }
}
