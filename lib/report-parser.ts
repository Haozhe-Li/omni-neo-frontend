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

export type ParsedSegment = { type: 'text'; content: string } | { type: 'report'; report: ParsedReport }

export interface ParsedAnswer {
  /** The answer with every `<report>` block removed — what shows inline in chat. */
  text: string
  reports: ParsedReport[]
  /** Text and report blocks in the order they appeared in the source, so a
      report card can be rendered between the narration that surrounds it. */
  segments: ParsedSegment[]
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
    const stripped = source.replace(/<r(?:e(?:p(?:o(?:r(?:t)?)?)?)?)?$/i, '')
    return { text: stripped, reports: [], segments: stripped ? [{ type: 'text', content: stripped }] : [] }
  }

  const reports: ParsedReport[] = []
  const segments: ParsedSegment[] = []
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
    const afterTag = rest.slice(open.index!) // starts with "<report"
    const gt = afterTag.indexOf('>')
    const id = `${keyPrefix}-report-${idx}`

    if (gt === -1) {
      // Opening tag itself is still streaming in — no body yet.
      const report = { id, title: extractTitle(afterTag.slice(7), ''), content: '', complete: false }
      reports.push(report)
      segments.push({ type: 'report', report })
      break
    }

    const attrs = afterTag.slice(7, gt)
    const afterOpen = afterTag.slice(gt + 1)
    const close = afterOpen.match(CLOSE_TAG)
    if (!close) {
      // Body is still streaming — render what we have so far.
      const report = { id, title: extractTitle(attrs, afterOpen), content: afterOpen.trim(), complete: false }
      reports.push(report)
      segments.push({ type: 'report', report })
      break
    }

    const body = afterOpen.slice(0, close.index)
    const report = { id, title: extractTitle(attrs, body), content: body.trim(), complete: true }
    reports.push(report)
    segments.push({ type: 'report', report })
    rest = afterOpen.slice(close.index! + close[0].length)
    idx++
  }

  const cleanedSegments = segments
    .map((s) => (s.type === 'text' ? { type: 'text' as const, content: s.content.replace(/\n{3,}/g, '\n\n') } : s))
    .filter((s) => s.type !== 'text' || s.content.trim())
  // Trim leading/trailing whitespace on the outermost text segments only.
  if (cleanedSegments[0]?.type === 'text') cleanedSegments[0].content = cleanedSegments[0].content.replace(/^\s+/, '')
  const last = cleanedSegments[cleanedSegments.length - 1]
  if (last?.type === 'text') last.content = last.content.replace(/\s+$/, '')

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), reports, segments: cleanedSegments }
}
