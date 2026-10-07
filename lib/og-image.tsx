import { ImageResponse } from 'next/og'

/**
 * Link-preview ("Open Graph") images — one builder, two looks.
 *
 *   brand   the three-ring mark beside the wordmark. The home page, the Pages
 *           index, and — deliberately — every PRIVATE /thread/{id}, so pasting a
 *           private conversation's link never says anything about its contents.
 *   bubble  a speech bubble holding a short preview, the wordmark and mark under
 *           it. A shared conversation (/s/{id}) previews the user's first
 *           question; a published page (/pages/{id}) previews its title.
 *
 * This replaces the static /omniknows_main.png and the dark title-card route;
 * nothing references those any more.
 *
 * Fonts are fetched per request from Google Fonts, subset to just the glyphs on
 * the card (a few KB), because satori cannot read the woff2 files next/font
 * ships and a CJK face is far too big to bundle whole. If a fetch fails the card
 * still renders, in satori's bundled Latin face — see `loadFonts`.
 */

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

// The site's own light palette (app/globals.css), so a card reads as Omni's.
const BG = '#F1EADC' // --sand
const BUBBLE = '#FFFDF9' // --paper-raised
const INK = '#2B2724'
const LINE = '#E2D8C9'
const TEAL = '#26696B'
const RUST = '#C0673C'

const WORDMARK = 'OmniKnows'
// Satori reads TTF, not woff2; Google serves TTF to this old Safari user agent.
const OLD_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1'

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500; style: 'normal' }

async function googleFont(family: string, weight: number | null, text: string): Promise<ArrayBuffer | null> {
  try {
    const spec = weight ? `${family.replace(/ /g, '+')}:wght@${weight}` : family.replace(/ /g, '+')
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${spec}&text=${encodeURIComponent(text)}`, {
        headers: { 'User-Agent': OLD_SAFARI_UA },
        cache: 'force-cache',
      })
    ).text()
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
    if (!url) return null
    const res = await fetch(url, { cache: 'force-cache' })
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

/** The faces a card needs. Any that fail to load are left out, never fatal. */
async function loadFonts(bodyText: string): Promise<OgFont[]> {
  const [serif, sans, cjk] = await Promise.all([
    googleFont('Instrument Serif', null, WORDMARK),
    bodyText ? googleFont('Hanken Grotesk', 500, bodyText) : Promise.resolve(null),
    // Only worth a request when the text has something Latin glyphs can't cover.
    bodyText && /[^\u0000-ɏ -⁯]/.test(bodyText)
      ? googleFont('Noto Sans SC', 500, bodyText)
      : Promise.resolve(null),
  ])
  const fonts: OgFont[] = []
  if (serif) fonts.push({ name: 'Instrument Serif', data: serif, weight: 400, style: 'normal' })
  if (sans) fonts.push({ name: 'Hanken Grotesk', data: sans, weight: 500, style: 'normal' })
  if (cjk) fonts.push({ name: 'Noto Sans SC', data: cjk, weight: 500, style: 'normal' })
  return fonts
}

/** Collapse whitespace, drop markup-ish noise, and cap the length. */
export function previewText(raw: unknown, max = 220): string {
  const text = String(raw ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max).trimEnd() : text
}

// Satori cannot measure text, so how much room the preview needs is estimated:
// a CJK character is one em wide, a Latin one about half, a space a quarter.
function emWidth(text: string): number {
  let em = 0
  for (const ch of text) {
    em += /[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : ch === ' ' ? 0.25 : 0.56
  }
  return em
}

// The text window is 866px wide and four lines tall (304px). Short text gets
// bigger type so a one-word question does not sit in an empty bubble; each tier
// is sized so its worst case still fits the window without wrapping past it.
function fontSizeFor(em: number): number {
  if (em <= 10) return 104 // <= 2 lines at 104px
  if (em <= 24) return 76 // <= 3 lines at 76px
  return 58 // <= 4 lines at 58px (~15 em per line)
}

// At 58px a line holds ~15 em and four show. Wrapping wastes some of each line,
// hence 3.7 rather than 4 lines of headroom before the fade is worth drawing.
function likelyOverflows(em: number): boolean {
  return em > 3.7 * (866 / 58)
}

/** The three-ring mark, geometry from public/omni-mark.svg (light palette). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-0.55 -1.25 25 25" xmlns="http://www.w3.org/2000/svg">
      <g fill="none">
        <circle cx="11" cy="11" r="10.15" stroke={TEAL} strokeWidth="1.7" />
        <circle cx="15.994" cy="12.98" r="7.308" stroke={RUST} strokeWidth="1.224" opacity="0.85" />
        <circle cx="10.01" cy="17.006" r="5.075" stroke={TEAL} strokeWidth="0.85" opacity="0.6" />
      </g>
    </svg>
  )
}

function wordmarkStyle(size: number) {
  return {
    display: 'flex',
    fontFamily: 'Instrument Serif, serif',
    fontSize: size,
    lineHeight: 1,
    color: INK,
    letterSpacing: '-0.02em',
  } as const
}

/** Mark + wordmark, centred. Home, the Pages index, and private threads. */
export async function brandImage(headers?: Record<string, string>): Promise<ImageResponse> {
  const fonts = await loadFonts('')
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
          <Mark size={208} />
          <div style={wordmarkStyle(178)}>{WORDMARK}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers }
  )
}

/**
 * A bubble with `text` in it, the wordmark and mark beneath. The text sits in a
 * fixed four-line window that fades out at the bottom, so a long question reads
 * as "there is more" instead of being chopped mid-line.
 */
export async function bubbleImage(text: string, headers?: Record<string, string>): Promise<ImageResponse> {
  const body = previewText(text)
  if (!body) return brandImage(headers)
  const fonts = await loadFonts(body)
  const em = emWidth(body)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
        }}
      >
        <div
          style={{
            width: 1010,
            height: 486,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '54px 72px 50px',
            background: BUBBLE,
            borderRadius: 64,
            boxShadow: `0 0 0 2px ${LINE}, 0 36px 70px -34px rgba(43, 39, 36, 0.38)`,
          }}
        >
          <div style={{ display: 'flex', position: 'relative', height: 304, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Hanken Grotesk, Noto Sans SC, sans-serif',
                fontSize: fontSizeFor(em),
                fontWeight: 500,
                lineHeight: 1.3,
                color: INK,
                wordBreak: 'break-word',
              }}
            >
              {body}
            </div>
            {/* Only when there is more to say than fits: a title that fits should
                not have its last line washed out. */}
            {likelyOverflows(em) && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 120,
                  display: 'flex',
                  backgroundImage: `linear-gradient(to bottom, rgba(255, 253, 249, 0), rgba(255, 253, 249, 0.92) 70%, ${BUBBLE})`,
                }}
              />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={wordmarkStyle(64)}>{WORDMARK}</div>
            <Mark size={64} />
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers }
  )
}
