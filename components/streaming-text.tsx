'use client'

import { useEffect, useRef, useState } from 'react'
import { MarkdownMessage } from '@/components/markdown-message'

interface StreamingTextProps {
  /** The full (report-stripped) answer accumulated so far. */
  content: string
  /**
   * When true, reveal the answer progressively as it streams. When false, render
   * the whole thing immediately (e.g. messages loaded from history).
   */
  animate: boolean
}

// Split markdown into top-level blocks on blank lines, but never inside a ```
// fenced block — so an echarts/JSON fence stays intact and renders as one unit.
function splitBlocks(src: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let inFence = false
  for (const line of src.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (!inFence && line.trim() === '') {
      if (cur.length) {
        out.push(cur.join('\n'))
        cur = []
      }
    } else {
      cur.push(line)
    }
  }
  if (cur.length) out.push(cur.join('\n'))
  return out
}

/**
 * Streams the answer in a buffered, block-at-a-time way instead of a per-token
 * typewriter: it reveals only whole lines (so words never pop in mid-token),
 * groups them into markdown blocks, and fades each new block in as it lands.
 */
export function StreamingText({ content, animate }: StreamingTextProps) {
  if (!animate) return <MarkdownMessage content={content} />
  return <BufferedReveal content={content} />
}

function BufferedReveal({ content }: { content: string }) {
  // Only complete lines are eligible to show; hold back the trailing partial line
  // until its newline arrives (or `animate` flips off and the parent renders all).
  const nl = content.lastIndexOf('\n')
  const readyLines = nl >= 0 ? content.slice(0, nl).split('\n') : []
  const targetRef = useRef(readyLines.length)
  targetRef.current = readyLines.length

  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setShown((prev) => {
        const target = targetRef.current
        if (prev >= target) return prev
        // Reveal roughly a line or two per tick; catch up faster when far behind.
        const step = Math.max(1, Math.floor((target - prev) / 4))
        return Math.min(target, prev + step)
      })
    }, 80)
    return () => clearInterval(id)
  }, [])

  const blocks = splitBlocks(readyLines.slice(0, shown).join('\n'))
  return (
    <div>
      {blocks.map((b, i) => (
        <div key={i} className="omni-block-in">
          <MarkdownMessage content={b} />
        </div>
      ))}
    </div>
  )
}
