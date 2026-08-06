import { NextResponse } from 'next/server'
import { regenerateAgentLlmsTxtCache } from '@/lib/llms-txt'

/**
 * Regenerates the agent-facing Redis mirror of llms.txt on demand.
 *
 * Fired by two triggers, not a schedule: the "Ask Omni" link
 * (components/benchmark/llms-txt-menu.tsx) and the benchmark page's Refresh
 * button (components/benchmark/benchmark-provider.tsx) — both fire-and-forget,
 * since neither should block on this. See lib/llms-txt.ts for why the mirror
 * exists at all (Cloudflare blocks the backend from fetching this page
 * itself) and why a long TTL, not this route, is the freshness safety net.
 */
export async function POST() {
    try {
        const { refreshed, retryAfter } = await regenerateAgentLlmsTxtCache()
        return NextResponse.json({ refreshed, retry_after: retryAfter })
    } catch (error) {
        console.error('[llms-txt/refresh]', error)
        return NextResponse.json({ refreshed: false, retry_after: 0 }, { status: 502 })
    }
}
