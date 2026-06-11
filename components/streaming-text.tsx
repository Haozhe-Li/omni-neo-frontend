'use client'

import { useEffect, useRef, useState } from 'react'
import { MarkdownMessage } from '@/components/markdown-message'

interface StreamingTextProps {
  /** The full text accumulated so far (may keep growing while streaming). */
  content: string
  /**
   * When true, reveal the text gradually (typewriter). When false, render the
   * whole thing immediately (e.g. messages loaded from history).
   */
  animate: boolean
}

/**
 * Smooths out coarse server-side streaming into a steady character-by-character
 * reveal. Providers chunk tokens very differently (Groq ≈ per-token, Gemini in
 * ~10-word blocks); this decouples the typewriter feel from that granularity.
 */
export function StreamingText({ content, animate }: StreamingTextProps) {
  const [shown, setShown] = useState(animate ? 0 : content.length)
  const targetRef = useRef(content.length)
  targetRef.current = content.length

  useEffect(() => {
    if (!animate) {
      setShown(content.length)
      return
    }
    const id = setInterval(() => {
      setShown((prev) => {
        const target = targetRef.current
        if (prev >= target) return prev
        // Catch up faster the further behind we are, but always move a little.
        const step = Math.max(2, Math.floor((target - prev) / 6))
        return Math.min(target, prev + step)
      })
    }, 28)
    return () => clearInterval(id)
  }, [animate])

  // If we somehow fell behind on a finished message, snap forward.
  useEffect(() => {
    if (!animate && shown !== content.length) setShown(content.length)
  }, [animate, content.length, shown])

  const text = animate ? content.slice(0, shown) : content
  return <MarkdownMessage content={text} />
}
