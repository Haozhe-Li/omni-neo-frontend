'use client'

import { MarkdownMessage } from '@/components/markdown-message'

interface StreamingTextProps {
  /** The full (report-stripped) answer accumulated so far. */
  content: string
  /**
   * When true, the answer is still streaming: show each chunk the moment it
   * arrives with a soft fade at the trailing edge. When false, render the whole
   * thing immediately (messages loaded from history, or the turn just finished).
   */
  animate: boolean
}

/**
 * Streamed answer renderer. The backend flushes the answer in small (~15-char)
 * chunks; we render each chunk the instant it lands — no character-by-character
 * typewriter — and let a trailing fade mask ease the newest text in. This reads
 * calmer and more polished than a typewriter while staying perfectly in sync
 * with the real stream.
 */
export function StreamingText({ content, animate }: StreamingTextProps) {
  if (!animate) return <MarkdownMessage content={content} />
  return (
    <div className="omni-stream-reveal">
      <MarkdownMessage content={trimDanglingFence(content)} />
    </div>
  )
}

// Never leave a fenced code block half-open mid-stream: if the visible slice has
// an odd number of ``` markers, there's a dangling open fence. For a chart
// (```echarts) still streaming in, synthesize a closing fence so it renders as
// the "drawing chart" placeholder instead of vanishing. For any other language,
// pull back to just before the fence so raw, unterminated code doesn't flash.
function trimDanglingFence(s: string): string {
  let count = 0
  let lastIdx = -1
  const re = /```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    count++
    lastIdx = m.index
  }
  if (count % 2 === 0) return s
  const lang = /^```([a-zA-Z0-9_-]*)/.exec(s.slice(lastIdx))?.[1]?.toLowerCase() ?? ''
  if (lang === 'echarts') return s + '\n```'
  return s.slice(0, lastIdx)
}

