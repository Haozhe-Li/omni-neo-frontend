'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Reveals `target` a few characters at a time instead of snapping to it
 * whenever it changes — used to smooth out text that arrives in coarse
 * bursts (Deepgram's partial_transcript updates a phrase at a time, not a
 * character at a time) into a consistent typewriter feel, and applied to
 * the agent's reply too for the same visual language even though its
 * deltas are already fairly fine-grained.
 *
 * `resetKey` is a separate value from `target` on purpose: changing it (e.g.
 * a new turn id) snaps the reveal back to empty and starts typing `target`
 * out from scratch, whereas `target` growing on its own (more of the same
 * utterance/reply arriving) just continues revealing from where it left off.
 */
export function useTypewriter(
    target: string,
    resetKey: string | number,
    opts?: { charsPerTick?: number; tickMs?: number }
): { text: string; isTyping: boolean } {
    const charsPerTick = opts?.charsPerTick ?? 2
    const tickMs = opts?.tickMs ?? 24

    const [revealed, setRevealed] = useState('')
    const revealedLenRef = useRef(0)
    const targetRef = useRef(target)
    const resetKeyRef = useRef(resetKey)

    useEffect(() => {
        targetRef.current = target
    }, [target])

    useEffect(() => {
        if (resetKeyRef.current !== resetKey) {
            resetKeyRef.current = resetKey
            revealedLenRef.current = 0
            setRevealed('')
        }
    }, [resetKey])

    useEffect(() => {
        let cancelled = false
        let timer: number | undefined

        const tick = () => {
            if (cancelled) return
            const t = targetRef.current
            if (revealedLenRef.current < t.length) {
                revealedLenRef.current = Math.min(t.length, revealedLenRef.current + charsPerTick)
                setRevealed(t.slice(0, revealedLenRef.current))
            }
            timer = window.setTimeout(tick, tickMs)
        }
        timer = window.setTimeout(tick, tickMs)

        return () => {
            cancelled = true
            if (timer !== undefined) window.clearTimeout(timer)
        }
        // charsPerTick/tickMs are read fresh each tick via closures over the
        // outer args, not deps — changing them mid-stream isn't a real use
        // case here, so restarting the loop for it would be pointless churn.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return { text: revealed, isTyping: revealed.length < target.length }
}
