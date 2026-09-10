'use client'

import { useCallback, useState } from 'react'

/**
 * The three-ring mark: offset and shrinking — a question, its narrowing, the
 * thing found.
 *
 * Drawn from three CSS borders rather than shipped as a raster, so it takes
 * its colours from the theme instead of needing one file per mode, and stays
 * sharp at any size on any density. `public/omni-mark.svg` is traced from this
 * component for the places that must have a file — favicon, OS icons.
 *
 * Every offset is a multiple of `size`, so the whole mark scales from one
 * number. The rings deliberately hang off the box on the right and bottom;
 * that overhang is the composition, not a mistake, and callers that clip
 * (`overflow-hidden`) will cut it.
 */

/**
 * `burst` is one finite run, for a click. `orbit` runs until told otherwise,
 * for "working on it".
 */
export type MarkMotion = 'rest' | 'burst' | 'orbit'

/**
 * A burst is one gesture: both rings start together, end together, and ease
 * together — they differ only in how far they travel inside that window, so
 * they pull apart and re-converge the way two bodies on different orbits do.
 * Whole turns, so the mark finishes in the composition it was drawn in rather
 * than wherever it stopped. The distance goes through `--omni-turn` rather
 * than iteration count because the easing has to span the whole run; two eased
 * iterations would pulse instead of winding up and settling.
 */
const BURST = { ms: 1600, turns: [2, 1] }

/**
 * An orbit just runs, so here the rings differ in period instead. Linear and
 * unhurried on purpose: this sits beside text that is being read, and
 * anything that accelerates there pulls the eye off the words. The two
 * periods are 2:3, close enough to look related and far enough apart that the
 * pair never settles into looking like one rigid thing turning.
 */
const ORBIT_MS = [1600, 2400]

function orbitStyle(motion: MarkMotion, ring: 0 | 1): React.CSSProperties | undefined {
    if (motion === 'rest') return undefined
    if (motion === 'burst') {
        return {
            '--omni-turn': `${BURST.turns[ring] * 360}deg`,
            animation: `omni-orbit ${BURST.ms}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        } as React.CSSProperties
    }
    return { animation: `omni-orbit ${ORBIT_MS[ring]}ms linear infinite` }
}

export function OmniMark({
    size = 22,
    tone = 'brand',
    motion = 'rest',
    onBurstEnd,
}: {
    size?: number
    /**
     * `brand` is teal and rust from the palette. `current` draws all three
     * rings in `currentColor` — for a solid teal button or any ground the
     * brand colours would vanish into. The opacity stagger still separates
     * the rings, so the mark keeps its depth when it loses its colour.
     */
    tone?: 'brand' | 'current'
    motion?: MarkMotion
    /** Fires when a `burst` finishes, so the caller can drop back to `rest`. */
    onBurstEnd?: () => void
}) {
    const outer = tone === 'current' ? 'currentColor' : 'var(--teal)'
    const middle = tone === 'current' ? 'currentColor' : 'var(--rust)'

    // The stroke is proportional so a 14px mark is not four times as heavy as
    // a 22px one — except at the bottom, where it stops scaling. Under about
    // 16px a true-to-ratio stroke lands below a pixel and renders as grey
    // haze rather than a line, so it holds at 1.1: fractionally bolder than
    // scale, which is the same trade the favicon makes at tab size.
    const stroke = Math.max(1.1, (size * 1.5) / 22)
    // Same reason, same threshold: at small sizes the faintest ring drops out
    // of sight entirely at 0.5 and the mark reads as two rings.
    const faint = size < 18 ? 0.6 : 0.5

    return (
        <span
            aria-hidden="true"
            className={`relative block shrink-0 ${motion === 'orbit' ? 'omni-mark-breathe' : ''}`}
            style={{ width: size, height: size }}
        >
            {/* The outer ring is concentric with the box, so orbiting it would
                move nothing. It stays put and the other two travel inside it —
                which is also the better picture: a fixed shell with bodies in
                it, rather than the whole mark spinning as one piece. */}
            <span
                className="absolute inset-0 rounded-full"
                style={{ border: `${stroke}px solid ${outer}` }}
            />
            {/* Each orbiting ring sits inside a wrapper that covers the whole
                box, so the wrapper's rotation is centred on the mark and
                carries the ring's own offset around with it. The offset and
                scale stay on the ring itself and never animate. */}
            <span
                className="omni-mark-orbit absolute inset-0"
                style={orbitStyle(motion, 0)}
                onAnimationEnd={motion === 'burst' ? onBurstEnd : undefined}
            >
                <span
                    className="absolute inset-0 rounded-full opacity-85"
                    style={{
                        border: `${stroke}px solid ${middle}`,
                        transform: `translate(${size * 0.227}px, ${size * 0.09}px) scale(0.72)`,
                    }}
                />
            </span>
            <span className="omni-mark-orbit absolute inset-0" style={orbitStyle(motion, 1)}>
                <span
                    className="absolute inset-0 rounded-full"
                    style={{
                        border: `${stroke}px solid ${outer}`,
                        opacity: faint,
                        transform: `translate(${-size * 0.045}px, ${size * 0.273}px) scale(0.5)`,
                    }}
                />
            </span>
        </span>
    )
}

/**
 * Click-to-spin, for a mark that is already a link or a button.
 *
 * Spread `mark` onto the `OmniMark`, give it `key={run}`, and call `trigger`
 * from the handler the element already has. The key is what makes a second
 * click mid-run restart the spin instead of being swallowed — remounting is
 * the only way to replay a CSS animation that is already going.
 */
export function useMarkBurst() {
    const [run, setRun] = useState(0)
    const [spinning, setSpinning] = useState(false)

    const trigger = useCallback(() => {
        setRun((n) => n + 1)
        setSpinning(true)
    }, [])

    return {
        trigger,
        run,
        mark: {
            motion: (spinning ? 'burst' : 'rest') as MarkMotion,
            onBurstEnd: () => setSpinning(false),
        },
    }
}
