import { NextRequest, NextResponse } from 'next/server'
import { buildLlmsTxtBody } from '@/lib/llms-txt'

/**
 * The whole benchmark, as Markdown, for a model to read.
 *
 * Every other page in this section is built for a human looking at a chart —
 * this is the machine-readable counterpart: the complete, current numbers for
 * every model, as one document, meant to be fetched directly rather than
 * rendered.
 *
 * The body is Markdown; the wire type is `text/plain`, not `text/markdown` —
 * those are deliberately different questions. `text/markdown` is a real,
 * RFC 7763-registered type, but most URL-fetching tools (ChatGPT's browsing
 * tool among them) check Content-Type against a narrow allowlist before
 * ingesting anything, and that type is rare enough to usually be missing from
 * it — the request gets rejected outright, not misparsed. `text/plain` is
 * close to universally accepted, and matches what virtually every host
 * (nginx, Vercel, Cloudflare, S3, GitHub Pages) already serves a `.txt` path
 * as by default. Every widely-used llms.txt in the wild follows this same
 * split — Markdown syntax in the body, `text/plain` on the wire — for exactly
 * this reason: the syntax is for the reader, the header is for whatever
 * fetched the URL to get out of its way.
 *
 * Regenerated on every request rather than built once: eval runs land
 * continuously, and a stale llms.txt would be actively misleading to whatever
 * reads it, worse than a slow one. `dynamic = 'force-dynamic'` stops Next from
 * freezing this at build time; the short edge cache below still absorbs a
 * crawler making several requests in a row.
 *
 * This is what a human browser (or a crawler Cloudflare lets through) gets.
 * Our own backend agent does not fetch this route at all — Cloudflare blocks
 * it outright — and instead reads a Redis-mirrored copy kept current by
 * lib/llms-txt.ts's `regenerateAgentLlmsTxtCache`. See that file for why.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    let body: string
    try {
        body = await buildLlmsTxtBody(request.nextUrl.origin)
    } catch (error) {
        console.error('[llms.txt]', error)
        return new NextResponse(
            '# Omni Benchmarks — temporarily unavailable\n\n' +
                'The evaluation backend could not be reached while generating this file. ' +
                'This is not a permanent state; retry the request.\n',
            { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        )
    }

    return new NextResponse(body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            // Short edge cache: long enough to absorb a crawler re-requesting
            // within the same minute, short enough that this never lags the
            // dashboard by more than that.
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
    })
}
