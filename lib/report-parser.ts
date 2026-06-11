// Parses inline `<report title="…">…</report>` blocks out of an assistant answer.
//
// Reports are streamed inline (like ```echarts charts) rather than delivered as a
// separate event, so the parser must cope with a block that is still arriving:
// an opening tag whose `>` hasn't streamed yet, or a body with no closing tag.
// In those cases the report is returned with `complete: false` and whatever body
// has arrived so far, so the side reader can render it live.

export interface ParsedReport {
  id: string
  title: string
  content: string
  complete: boolean
}

export interface ParsedAnswer {
  /** The answer with every `<report>` block removed — what shows inline in chat. */
  text: string
  reports: ParsedReport[]
}

const OPEN_TAG = /<report\b/i
const CLOSE_TAG = /<\/report\s*>/i

function extractTitle(attrs: string, body: string): string {
  const m = attrs.match(/title\s*=\s*"([^"]*)"/i) || attrs.match(/title\s*=\s*'([^']*)'/i)
  if (m && m[1].trim()) return m[1].trim()
  // Fall back to the first markdown heading in the body.
  const h = body.match(/^\s*#{1,6}\s+(.+?)\s*$/m)
  if (h && h[1].trim()) return h[1].trim()
  return 'Report'
}

export function parseReports(raw: string, keyPrefix = 'r'): ParsedAnswer {
  const source = raw || ''
  if (!OPEN_TAG.test(source)) {
    // Strip a trailing partial `<repor…` fragment so an opening tag that is
    // mid-stream never flashes as literal text in chat.
    return { text: source.replace(/<r(?:e(?:p(?:o(?:r(?:t)?)?)?)?)?$/i, ''), reports: [] }
  }

  const reports: ParsedReport[] = []
  let text = ''
  let rest = source
  let idx = 0

  while (true) {
    const open = rest.match(OPEN_TAG)
    if (!open) {
      text += rest
      break
    }
    text += rest.slice(0, open.index)
    const afterTag = rest.slice(open.index!) // starts with "<report"
    const gt = afterTag.indexOf('>')
    const id = `${keyPrefix}-report-${idx}`

    if (gt === -1) {
      // Opening tag itself is still streaming in — no body yet.
      reports.push({ id, title: extractTitle(afterTag.slice(7), ''), content: '', complete: false })
      break
    }

    const attrs = afterTag.slice(7, gt)
    const afterOpen = afterTag.slice(gt + 1)
    const close = afterOpen.match(CLOSE_TAG)
    if (!close) {
      // Body is still streaming — render what we have so far.
      reports.push({ id, title: extractTitle(attrs, afterOpen), content: afterOpen.trim(), complete: false })
      break
    }

    const body = afterOpen.slice(0, close.index)
    reports.push({ id, title: extractTitle(attrs, body), content: body.trim(), complete: true })
    rest = afterOpen.slice(close.index! + close[0].length)
    idx++
  }

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), reports }
}
