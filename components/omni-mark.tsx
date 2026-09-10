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
export function OmniMark({
    size = 22,
    tone = 'brand',
}: {
    size?: number
    /**
     * `brand` is teal and rust from the palette. `current` draws all three
     * rings in `currentColor` — for a solid teal button or any ground the
     * brand colours would vanish into. The opacity stagger still separates
     * the rings, so the mark keeps its depth when it loses its colour.
     */
    tone?: 'brand' | 'current'
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
            className="relative block shrink-0"
            style={{ width: size, height: size }}
        >
            <span
                className="absolute inset-0 rounded-full"
                style={{ border: `${stroke}px solid ${outer}` }}
            />
            <span
                className="absolute inset-0 rounded-full opacity-85"
                style={{
                    border: `${stroke}px solid ${middle}`,
                    transform: `translate(${size * 0.227}px, ${size * 0.09}px) scale(0.72)`,
                }}
            />
            <span
                className="absolute inset-0 rounded-full"
                style={{
                    border: `${stroke}px solid ${outer}`,
                    opacity: faint,
                    transform: `translate(${-size * 0.045}px, ${size * 0.273}px) scale(0.5)`,
                }}
            />
        </span>
    )
}
