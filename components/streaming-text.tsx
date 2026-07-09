'use client'

import { useEffect, useRef, useState } from 'react'
import { MarkdownMessage } from '@/components/markdown-message'
import type { Source } from '@/lib/types'

interface StreamingTextProps {
  /** The full (report-stripped) answer accumulated so far. */
  content: string
  /**
   * When true, reveal the answer with the buffered typewriter. When false, render
   * the whole thing immediately (e.g. messages loaded from history, or the turn
   * just finished).
   */
  animate: boolean
  /** Sources for this message, used to render `[n]` markers as citation badges. */
  sources?: Source[]
}

// Reveal pacing. The cursor advances at a steady base rate, and faster when it's
// fallen behind — so bursty token arrival drains smoothly instead of the answer
// popping out a chunk at a time. CATCHUP keeps the lag small (~backlog / CATCHUP
// seconds) so the typewriter never trails the real stream by much.
const BASE_CPS = 80 // characters/sec revealed at minimum
const CATCHUP = 4 // proportional drain: a bigger backlog reveals faster

/**
 * Buffered typewriter: reveals the answer character-by-character at a smooth,
 * self-pacing rate rather than dumping whole lines/blocks or jittering one token
 * at a time. Driven by a single rAF loop that interpolates the shown length
 * toward the content length each frame.
 */
export function StreamingText({ content, animate, sources }: StreamingTextProps) {
  if (!animate) return <MarkdownMessage content={content} sources={sources} />
  return <Typewriter content={content} sources={sources} />
}

// Never leave a fenced code block half-open mid-reveal: if the visible slice has
// an odd number of ``` markers, there's a dangling open fence. Synthesize a
// closing fence so react-markdown treats it as a complete (if still growing)
// code block and reveals its contents incrementally, rather than the whole
// block vanishing until the real closing fence arrives.
function trimDanglingFence(s: string): string {
  let count = 0
  const re = /```/g
  while (re.exec(s)) count++
  if (count % 2 === 0) return s
  return s + '\n```'
}

function Typewriter({ content, sources }: { content: string; sources?: Source[] }) {
  // Latest content is read off a ref so the rAF loop can stay mounted once.
  const contentRef = useRef(content)
  contentRef.current = content
  const shownRef = useRef(0)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) // seconds, clamped after a stall
      last = now
      const target = contentRef.current.length
      let cur = shownRef.current
      if (cur < target) {
        const speed = Math.max(BASE_CPS, (target - cur) * CATCHUP)
        cur = Math.min(target, cur + speed * dt)
        shownRef.current = cur
        setShown(Math.floor(cur))
      } else if (cur > target) {
        // Content shrank (e.g. a <report> block was just stripped out) — snap back.
        shownRef.current = target
        setShown(target)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const slice = contentRef.current.slice(0, Math.min(shown, contentRef.current.length))
  return <MarkdownMessage content={trimDanglingFence(slice)} sources={sources} />
}
