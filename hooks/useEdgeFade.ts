'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** How much of the edge dissolves once there is something past it. */
const FADE_PX = 44

/**
 * Softens the edges of a scroll container, and in doing so tells the reader
 * there is more of it.
 *
 * A panel with its scrollbar hidden ends in a hard horizontal cut, and a card
 * sliced clean through by that cut reads as a rendering bug rather than as a
 * list that continues. Fading the edge out instead says "this carries on"
 * with no chrome at all — no arrow, no "scroll for more", nothing that has to
 * be styled or translated.
 *
 * The fade is proportional rather than switched on: it grows from 0 to 44px
 * over the first 44px of travel. So it appears as you begin to scroll and
 * retreats as you reach the end, which is both smoother than a toggle and
 * more honest — the size of the fade is how much is left over there. An
 * unscrollable panel gets no fade at all, so a short list never looks cut.
 *
 * Applied as a mask on the element's own content, not an overlay gradient: an
 * overlay would have to match the ground exactly, and this ground carries a
 * dot texture that a flat gradient would visibly cover.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [fade, setFade] = useState({ top: 0, bottom: 0 })
  // Held in a ref as well so `measure` can bail before calling setState —
  // it runs on every render (see below) and would otherwise loop.
  const fadeRef = useRef(fade)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const overflow = el.scrollHeight - el.clientHeight
    // `- 1` absorbs the sub-pixel rounding a fractional layout leaves behind,
    // which would otherwise pin a permanent 1px fade on a panel that does not
    // actually scroll.
    const top = overflow > 1 ? Math.min(FADE_PX, Math.max(0, el.scrollTop)) : 0
    const bottom = overflow > 1 ? Math.min(FADE_PX, Math.max(0, overflow - el.scrollTop)) : 0
    const prev = fadeRef.current
    if (Math.abs(prev.top - top) < 0.5 && Math.abs(prev.bottom - bottom) < 0.5) return
    fadeRef.current = { top, bottom }
    setFade({ top, bottom })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    // Catches the element's own box changing — a sibling column opening, the
    // window resizing. Content growing past a capped max-height does not
    // resize the box, which is what the every-render measure below is for.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      ro?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [measure])

  // Deliberately no dependency array: the panel re-renders exactly when its
  // contents change, which is the one event neither the scroll listener nor
  // the ResizeObserver can see. `measure` early-returns unless the numbers
  // actually moved, so this cannot loop.
  useEffect(measure)

  return {
    ref,
    /** Spread onto the scroll container alongside `omni-edge-fade`. */
    style: {
      '--fade-top': `${fade.top}px`,
      '--fade-bottom': `${fade.bottom}px`,
    } as React.CSSProperties,
  }
}
