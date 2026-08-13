/**
 * llms.txt: rendering, plus the Redis mirror the backend agent reads instead
 * of fetching this page itself.
 *
 * Cloudflare sits in front of this domain and blocks Spider (the backend's
 * scraper) outright — a direct backend fetch would fare no better, since
 * Cloudflare gates the inbound request itself, not which client makes it. So
 * instead of being fetched, this content is pushed into the same Upstash
 * Redis database the backend already talks to (same
 * UPSTASH_REDIS_REST_URL/TOKEN on both sides — see the backend's
 * core/utils/redis_cache.py); the backend reads it straight out of Redis,
 * no network hop past Cloudflare involved.
 *
 * The mirror is kept current by two explicit triggers — the "Ask Omni" link
 * and the benchmark page's Refresh button, both hitting
 * /api/benchmark/llms-txt/refresh — not by a schedule. `AGENT_LLMS_TXT_TTL_SECONDS`
 * is a long safety-net ceiling, not the normal freshness mechanism: if
 * neither trigger ever fires again, the mirror still expires eventually
 * instead of serving arbitrarily stale data forever.
 */
import { redis } from '@/lib/redis'
import {
    METRIC_CARDS,
    OMNI_CHAT_URL,
    type LeaderboardRow,
    type LeaderboardRowWithIndex,
    dedupeLeaderboard,
    modelTraits,
} from '@/lib/benchmark'

export const AGENT_LLMS_TXT_REDIS_KEY = 'agent_page:https://omniknows.xyz/benchmark/llms.txt'
export const AGENT_LLMS_TXT_TTL_SECONDS = 10 * 24 * 60 * 60

// Below this age, a regenerate call is treated as a duplicate (someone
// double-clicking, or the Refresh button and an "Ask Omni" click landing
// seconds apart) and skipped rather than re-fetching the leaderboard and
// re-writing Redis for no new data.
const REGENERATE_COOLDOWN_MS = 30_000

// Same rule the /api/evals proxy resolves its target from — kept as its own
// copy there deliberately (see that route's comment); this one is fine to
// share since both of this module's callers are plain lib code, not routes.
function backendBase(): string {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    return base.endsWith('/') ? base.slice(0, -1) : base
}

/** Column definitions, in table order. `get` reads the raw value; `fmt` prints it. */
const COLUMNS: { key: string; get: (r: LeaderboardRowWithIndex, rank: number) => unknown; fmt: (v: unknown) => string }[] = [
    { key: 'rank', get: (_r, rank) => rank, fmt: String },
    { key: 'model_label', get: (r) => r.model_label, fmt: str },
    { key: 'provider', get: (r) => r.provider, fmt: str },
    { key: 'model_family', get: (r) => r.model_family, fmt: str },
    { key: 'reasoning_effort', get: (r) => r.reasoning_effort, fmt: str },
    { key: 'multimodal', get: (r) => modelTraits(r.model_family, r.model_label, r.provider).multimodal, fmt: bool },
    { key: 'open_weights', get: (r) => modelTraits(r.model_family, r.model_label, r.provider).openWeights, fmt: bool },
    { key: 'omni_index', get: (r) => r.omni_index, fmt: (v) => num(v, 4) },
    { key: 'score', get: (r) => r.score, fmt: (v) => num(v, 4) },
    { key: 'pass_rate', get: (r) => r.pass_rate, fmt: (v) => num(v, 4) },
    { key: 'error_rate', get: (r) => r.error_rate, fmt: (v) => num(v, 4) },
    { key: 'latency_ms_p50', get: (r) => r.latency_ms_p50, fmt: (v) => num(v, 0) },
    { key: 'latency_ms_p95', get: (r) => r.latency_ms_p95, fmt: (v) => num(v, 0) },
    { key: 'ttft_ms_p50', get: (r) => r.ttft_ms_p50, fmt: (v) => num(v, 0) },
    { key: 'ttft_answer_ms_p50', get: (r) => r.ttft_answer_ms_p50, fmt: (v) => num(v, 0) },
    { key: 'turns_mean', get: (r) => r.turns_mean, fmt: (v) => num(v, 2) },
    { key: 'input_tokens_mean', get: (r) => r.input_tokens_mean, fmt: (v) => num(v, 0) },
    { key: 'output_tokens_mean', get: (r) => r.output_tokens_mean, fmt: (v) => num(v, 0) },
    { key: 'reasoning_tokens_mean', get: (r) => r.reasoning_tokens_mean, fmt: (v) => num(v, 0) },
    { key: 'cost_usd_per_case', get: (r) => r.cost_usd_per_case, fmt: (v) => num(v, 6) },
    { key: 'cost_usd_total', get: (r) => r.cost_usd_total, fmt: (v) => num(v, 4) },
    { key: 'n_results', get: (r) => r.n_results, fmt: (v) => num(v, 0) },
    { key: 'started_at', get: (r) => r.started_at, fmt: str },
]

/**
 * What each column means, for a reader with no other context.
 *
 * Pulled from `METRIC_CARDS[].doc.what` where a card exists for the column, so
 * the definition here can never drift from the one on the metric's own page —
 * hand-written only for the columns that have no card (identity fields like
 * `provider`, and metrics that aren't headline cards, like `latency_ms_p95`).
 */
const GLOSSARY: Record<string, string> = {
    rank: 'Position in this table, 1 = best. Sorted by omni_index descending; unpriced models fall to the bottom, ordered by score.',
    model_label: 'The name this model is identified by everywhere else on the site — cross-reference at /benchmark/model/<slug>.',
    provider: 'Which API served the requests for this model’s eval run.',
    model_family: 'Exact model identifier at weights-and-pricing granularity (finer than model_label groups models for display).',
    reasoning_effort: 'Requested reasoning effort for this run, where the provider exposes that knob. null if not applicable.',
    multimodal: 'Whether this model accepts non-text input (images, etc). Hand-classified, not measured by the eval.',
    open_weights: 'Whether this model’s weights are publicly downloadable, as opposed to API-only. Hand-classified, not measured by the eval.',
    latency_ms_p95: '95th-percentile wall-clock time to finish one case, in milliseconds.',
    ttft_answer_ms_p50: 'Median time to the first token of answer prose specifically (unlike ttft_ms_p50, which counts any output including reasoning or a tool call).',
    turns_mean: 'Mean number of LLM turns (model calls) per case.',
    input_tokens_mean: 'Mean input tokens consumed per case, across every turn.',
    reasoning_tokens_mean: 'Mean reasoning tokens per case. Billed by most providers but not shown to the end user.',
    cost_usd_total: 'Total USD spent evaluating this model across every case in its run, at time of measurement.',
    n_results: 'Number of individual case results this row is computed over.',
    started_at: 'ISO 8601 timestamp of the run this row reports (UTC). One model may have multiple runs recorded; this is the newest.',
}
for (const card of METRIC_CARDS) {
    // METRIC_CARDS keys line up with LeaderboardRow field names for every
    // metric that also has a headline card (score, pass_rate, error_rate,
    // latency_ms_p50, ttft_ms_p50, cost_usd_per_case, output_tokens_mean),
    // plus omni_index — see the card->column mapping in COLUMNS above.
    GLOSSARY[card.key] = card.doc.what
}

function str(v: unknown): string {
    if (v === null || v === undefined || v === '') return 'null'
    // Markdown table cells split on `|`; a model label or provider string is
    // never expected to contain one, but escaping costs nothing and a broken
    // table is a worse failure than an escaped character.
    return String(v).replace(/\|/g, '\\|')
}

function bool(v: unknown): string {
    return v ? 'true' : 'false'
}

function num(v: unknown, digits: number): string {
    if (typeof v !== 'number' || Number.isNaN(v)) return 'null'
    return digits === 0 ? String(Math.round(v)) : v.toFixed(digits)
}

/**
 * Best first. Unpriced models (no omni_index) sort after every priced one, by
 * quality, so the order still means something instead of being arbitrary for
 * the tail of the list.
 */
function sortByOmniIndex(rows: LeaderboardRowWithIndex[]): LeaderboardRowWithIndex[] {
    return [...rows].sort((a, b) => {
        if (a.omni_index !== null && b.omni_index !== null) return b.omni_index - a.omni_index
        if (a.omni_index !== null) return -1
        if (b.omni_index !== null) return 1
        return (b.score ?? -1) - (a.score ?? -1)
    })
}

/**
 * A lean Markdown document: what the benchmark page itself says, not a spec
 * for how to parse this file. An earlier version spent several lines on
 * file-format ground rules ("here is how to read this file") before getting
 * to any actual content — cut to one line folded into the intro, so the
 * column glossary and the table (the parts that are actually the benchmark)
 * aren't buried under scaffolding about the file they're in.
 */
export function renderLlmsTxt(models: LeaderboardRowWithIndex[], origin: string): string {
    const generatedAt = new Date().toISOString()
    const omniCard = METRIC_CARDS.find((c) => c.key === 'omni_index')

    const lines: string[] = []
    lines.push('# Omni Benchmarks')
    lines.push('')
    lines.push(
        'How each model behaves in Omni’s pro mode — skill triggering, output contracts, answer quality, ' +
            'and what it costs to get there. Machine-readable counterpart to the interactive dashboard at ' +
            `${origin}/benchmark, generated fresh on every request.`
    )
    lines.push('')
    lines.push(`Generated: ${generatedAt} · Models: ${models.length}`)
    lines.push('')
    lines.push(
        'All rates are fractions from 0 to 1, not percentages; `*_ms_*` fields are milliseconds and `cost_*` ' +
            'fields are US dollars; `null` means never measured, not zero — an unpriced model is left out of ' +
            'cost and Omni Index comparisons rather than scored as free.'
    )
    lines.push('')

    if (omniCard) {
        lines.push('## Omni Index')
        lines.push('')
        lines.push(omniCard.doc.what)
        lines.push('')
        lines.push(omniCard.doc.how)
        lines.push('')
    }

    lines.push('## Columns')
    lines.push('')
    for (const col of COLUMNS) {
        const doc = GLOSSARY[col.key]
        if (doc) lines.push(`- \`${col.key}\`: ${doc}`)
    }
    lines.push('')

    lines.push('## All models, ranked by Omni Index')
    lines.push('')

    if (models.length === 0) {
        lines.push('No evaluation runs recorded yet.')
        lines.push('')
        return lines.join('\n')
    }

    const ranked = sortByOmniIndex(models)
    lines.push(`| ${COLUMNS.map((c) => c.key).join(' | ')} |`)
    lines.push(`| ${COLUMNS.map(() => '---').join(' | ')} |`)
    ranked.forEach((row, i) => {
        const rank = i + 1
        lines.push(`| ${COLUMNS.map((c) => c.fmt(c.get(row, rank))).join(' | ')} |`)
    })
    lines.push('')

    lines.push('---')
    lines.push(`Source: ${origin}/benchmark — request this URL again for the latest recorded runs.`)

    return lines.join('\n')
}

/** Fetches the leaderboard and renders it, exactly as the live route does. */
export async function buildLlmsTxtBody(origin: string): Promise<string> {
    const res = await fetch(`${backendBase()}/api/evals/leaderboard`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`leaderboard responded ${res.status}`)
    const body: { rows: LeaderboardRow[] } = await res.json()
    const models = dedupeLeaderboard(body.rows)
    return renderLlmsTxt(models, origin)
}

/**
 * Regenerates the agent-facing Redis mirror on demand.
 *
 * Always rendered from the fixed production origin, not the caller's — the
 * mirror is what `LLMS_TXT_URL` (always production) points an agent at, so a
 * copy written while previewing on a staging domain must not bake that
 * domain into the document's own text.
 */
export async function regenerateAgentLlmsTxtCache(): Promise<{ refreshed: boolean; retryAfter: number }> {
    const existingRaw = await redis.get(AGENT_LLMS_TXT_REDIS_KEY)
    if (existingRaw) {
        const existing = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw
        const updatedAtMs = typeof existing?.updated_at === 'string' ? Date.parse(existing.updated_at) : NaN
        if (Number.isFinite(updatedAtMs)) {
            const age = Date.now() - updatedAtMs
            if (age < REGENERATE_COOLDOWN_MS) {
                return { refreshed: false, retryAfter: Math.ceil((REGENERATE_COOLDOWN_MS - age) / 1000) }
            }
        }
    }

    const content = await buildLlmsTxtBody(OMNI_CHAT_URL)
    await redis.set(
        AGENT_LLMS_TXT_REDIS_KEY,
        JSON.stringify({ title: 'Omni Benchmarks', content, updated_at: new Date().toISOString() }),
        { ex: AGENT_LLMS_TXT_TTL_SECONDS }
    )
    return { refreshed: true, retryAfter: 0 }
}
