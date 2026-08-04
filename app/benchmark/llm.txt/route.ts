import { NextRequest, NextResponse } from 'next/server'
import {
    METRIC_CARDS,
    type LeaderboardRow,
    type LeaderboardRowWithIndex,
    dedupeLeaderboard,
    modelTraits,
} from '@/lib/benchmark'

/**
 * The whole benchmark, as plain text, for a model to read.
 *
 * Every other page in this section is built for a human looking at a chart —
 * this one exists so a language model (or anything else scraping for facts
 * rather than rendering pixels) can get the complete, current numbers in one
 * request without parsing HTML or driving a browser. Same data as the
 * dashboard, no chart in the way.
 *
 * Regenerated on every request rather than built once: eval runs land
 * continuously, and a stale llm.txt would be actively misleading to whatever
 * reads it, worse than a slow one. `dynamic = 'force-dynamic'` stops Next from
 * freezing this at build time; the short edge cache below still absorbs a
 * crawler making several requests in a row.
 */
export const dynamic = 'force-dynamic'

// Same rule the /api/evals proxy resolves its target from — duplicated rather
// than shared, since importing a Next.js API route module into another route
// handler is exactly the kind of coupling that route was built to avoid.
function backendBase(): string {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    return base.endsWith('/') ? base.slice(0, -1) : base
}

export async function GET(request: NextRequest) {
    let rows: LeaderboardRow[]
    try {
        const res = await fetch(`${backendBase()}/api/evals/leaderboard`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`leaderboard responded ${res.status}`)
        const body: { rows: LeaderboardRow[] } = await res.json()
        rows = body.rows
    } catch (error) {
        console.error('[llm.txt]', error)
        return new NextResponse(
            'Omni Benchmarks — temporarily unavailable\n\n' +
                'The evaluation backend could not be reached while generating this file. ' +
                'This is not a permanent state; retry the request.\n',
            { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        )
    }

    const models = dedupeLeaderboard(rows)
    const body = renderLlmTxt(models, request.nextUrl.origin)

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

/** Column definitions, in table order. `get` reads the raw value; `fmt` prints it. */
const COLUMNS: { key: string; get: (r: LeaderboardRowWithIndex, rank: number) => unknown; fmt: (v: unknown) => string }[] = [
    { key: 'rank', get: (_r, rank) => rank, fmt: String },
    { key: 'model_label', get: (r) => r.model_label, fmt: str },
    { key: 'provider', get: (r) => r.provider, fmt: str },
    { key: 'model_family', get: (r) => r.model_family, fmt: str },
    { key: 'reasoning_effort', get: (r) => r.reasoning_effort, fmt: str },
    { key: 'multimodal', get: (r) => modelTraits(r.model_family, r.model_label).multimodal, fmt: bool },
    { key: 'open_weights', get: (r) => modelTraits(r.model_family, r.model_label).openWeights, fmt: bool },
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
    rank: 'Position in this file, 1 = best. Sorted by omni_index descending; unpriced models (see omni_index) fall to the bottom, ordered by score.',
    model_label: 'The name this model is identified by everywhere else on the site — use it to cross-reference /benchmark/model/<slug>.',
    provider: 'Which API served the requests for this model’s eval run.',
    model_family: 'Exact model identifier at weights-and-pricing granularity (finer than model_label groups models for display).',
    reasoning_effort: 'Requested reasoning effort for this run, where the provider exposes that knob. null if not applicable.',
    multimodal: 'Whether this model accepts non-text input (images, etc). Hand-classified, not measured by the eval.',
    open_weights: 'Whether this model’s weights are publicly downloadable, as opposed to API-only. Hand-classified, not measured by the eval.',
    latency_ms_p95: '95th-percentile wall-clock time to finish one case, in milliseconds.',
    ttft_answer_ms_p50: 'Median time to the first token of answer prose specifically (as opposed to ttft_ms_p50, which counts any output including reasoning or a tool call).',
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
 * Best first. Unpriced models (no omni_index — see the field's own glossary
 * entry) sort after every priced one, by quality, so the order still means
 * something instead of being arbitrary for the tail of the list.
 */
function sortByOmniIndex(rows: LeaderboardRowWithIndex[]): LeaderboardRowWithIndex[] {
    return [...rows].sort((a, b) => {
        if (a.omni_index !== null && b.omni_index !== null) return b.omni_index - a.omni_index
        if (a.omni_index !== null) return -1
        if (b.omni_index !== null) return 1
        return (b.score ?? -1) - (a.score ?? -1)
    })
}

function renderLlmTxt(models: LeaderboardRowWithIndex[], origin: string): string {
    const generatedAt = new Date().toISOString()
    const omniCard = METRIC_CARDS.find((c) => c.key === 'omni_index')

    const lines: string[] = []
    lines.push('# Omni Benchmarks — raw model scores')
    lines.push('')
    lines.push(
        'This file is generated for language models and other automated readers. ' +
            'It is the complete, current result of every model this project has evaluated, as one table — ' +
            'no charts, no client-side rendering, nothing to infer.'
    )
    lines.push('')
    lines.push(`Generated: ${generatedAt}`)
    lines.push(`Models: ${models.length}`)
    lines.push(`Interactive version, per-model detail, and methodology: ${origin}/benchmark`)
    lines.push('')

    if (omniCard) {
        lines.push('## What is the Omni Index?')
        lines.push('')
        lines.push(omniCard.doc.what)
        lines.push(omniCard.doc.how)
        lines.push('')
    }

    lines.push('## How to read this file')
    lines.push('')
    lines.push(
        '- One row per model. Where a model has been evaluated more than once, only the most recent run is shown.'
    )
    lines.push(
        '- `null` means the value was never measured or does not apply — never assume it means zero. ' +
            'This matters most for cost: an unpriced model is left out of cost and Omni Index comparisons entirely, ' +
            'not scored as free.'
    )
    lines.push('- All rates (score, pass_rate, error_rate) are fractions from 0 to 1, not percentages.')
    lines.push('- All *_ms_* fields are milliseconds. All cost_* fields are US dollars.')
    lines.push('- Lower is better for: error_rate, latency_ms_p50, latency_ms_p95, ttft_ms_p50, ttft_answer_ms_p50, cost_usd_per_case, cost_usd_total.')
    lines.push('- Higher is better for every other numeric column.')
    lines.push('')

    lines.push('## Column glossary')
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
    lines.push(
        `Machine-readable source, kept in sync with the dashboard: ${origin}/benchmark. ` +
            'Regenerate this file by requesting this URL again — it always reflects the latest recorded runs.'
    )

    return lines.join('\n')
}
