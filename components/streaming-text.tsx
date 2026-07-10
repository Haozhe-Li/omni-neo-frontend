'use client'

import { useEffect, useRef, useState } from 'react'
import { MarkdownMessage } from '@/components/markdown-message'
import type { Source } from '@/lib/types'
import type { VerifiedSpan } from '@/lib/verify-claims'

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
  /** See `MarkdownMessage` — passed straight through. */
  verifiedClaims?: VerifiedSpan[]
  onVerifiedClaimClick?: (id: string) => void
}

// Reveal pacing. The cursor advances at a steady base rate, and faster when it's
// fallen behind — so bursty token arrival drains smoothly instead of the answer
// popping out a chunk at a time. CATCHUP keeps the lag small (~backlog / CATCHUP
// seconds) so the typewriter never trails the real stream by much.
const BASE_CPS = 80 // characters/sec revealed at minimum
const CATCHUP = 4 // proportional drain: a bigger backlog reveals faster

/**
 * Always renders through the same `Typewriter` element regardless of `animate`,
 * rather than switching between `<Typewriter>` and a bare `<MarkdownMessage>`.
 * Swapping element types at this position made React unmount and recreate the
 * whole answer's DOM the instant a message finished streaming (`animate` flips
 * true -> false) — which silently collapses any browser text selection anchored
 * inside it (the Selection API drops a selection when its nodes are removed),
 * hiding the follow-up/check-source popup with no error. Keeping one stable
 * element type lets React patch the existing nodes in place instead.
 */
export function StreamingText({ content, animate, sources, verifiedClaims, onVerifiedClaimClick }: StreamingTextProps) {
  return <Typewriter content={content} animate={animate} sources={sources} verifiedClaims={verifiedClaims} onVerifiedClaimClick={onVerifiedClaimClick} />
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

function Typewriter({ content, animate, sources, verifiedClaims, onVerifiedClaimClick }: { content: string; animate: boolean; sources?: Source[]; verifiedClaims?: VerifiedSpan[]; onVerifiedClaimClick?: (id: string) => void }) {
  // Latest content is read off a ref so the rAF loop can stay mounted once.
  const contentRef = useRef(content)
  contentRef.current = content
  const shownRef = useRef(animate ? 0 : content.length)
  const [shown, setShown] = useState(shownRef.current)

  useEffect(() => {
    if (!animate) {
      // Not animating (historical message, or streaming just finished): reveal
      // everything immediately instead of running the rAF reveal loop.
      shownRef.current = contentRef.current.length
      setShown(shownRef.current)
      return
    }
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
  }, [animate])

  const slice = contentRef.current.slice(0, Math.min(shown, contentRef.current.length))
  // `verifiedClaims` offsets are computed against the full, final content —
  // only safe to apply once the whole thing is revealed (`!animate`), never
  // against the still-growing `slice`.
  return animate ? (
    <MarkdownMessage content={trimDanglingFence(slice)} sources={sources} />
  ) : (
    <MarkdownMessage content={contentRef.current} sources={sources} verifiedClaims={verifiedClaims} onVerifiedClaimClick={onVerifiedClaimClick} />
  )
}
