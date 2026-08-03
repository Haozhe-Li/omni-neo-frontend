/**
 * Types, scales and formatters for the benchmark page.
 *
 * Shapes mirror the backend's `/api/evals/*` responses (see the backend's
 * doc/evals_api.md). Kept in one module so the page, the charts and the
 * drawer all agree on what a run or a check looks like.
 */

// ── API shapes ──────────────────────────────────────────────────────────────
export interface EvalRun {
    run_id: string
    label: string | null
    mode: string
    model_label: string
    model_id: string
    provider: string | null
    reasoning_effort: string | null
    model_family: string | null
    judge_model: string | null
    git_sha: string | null
    prompt_sha: string | null
    skills_sha: string | null
    repeats: number
    tool_cache: boolean
    suites: string[]
    status: string
    score: number | null
    pass_rate: number | null
    suite_scores: Record<string, number> | null
    n_cases: number | null
    n_errors: number
    total_latency_ms: number | null
    total_cost_usd: number | null
    started_at: string
    finished_at: string | null
}

export interface LeaderboardRow {
    run_id: string
    model_label: string
    model_family: string | null
    provider: string | null
    reasoning_effort: string | null
    started_at: string
    score: number | null
    pass_rate: number | null
    n_results: number
    error_rate: number | null
    ttft_ms_p50: number | null
    ttft_answer_ms_p50: number | null
    latency_ms_p50: number | null
    latency_ms_p95: number | null
    turns_mean: number | null
    input_tokens_mean: number | null
    output_tokens_mean: number | null
    reasoning_tokens_mean: number | null
    cost_usd_total: number | null
    cost_usd_per_case: number | null
}

/** A leaderboard row with the client-computed {@link omniIndex} merged in. */
export type LeaderboardRowWithIndex = LeaderboardRow & { omni_index: number | null }

export interface MatrixCell {
    run_id: string
    score_mean: number | null
    score_stdev: number | null
    pass_rate: number | null
    n_errors: number
    n_repeats: number
    latency_ms_p50: number | null
    ttft_ms_p50: number | null
    cost_usd_mean: number | null
}

export interface MatrixResponse {
    models: string[]
    cases: { case_id: string; suite: string }[]
    cells: Record<string, Record<string, MatrixCell>>
    runs: Pick<
        EvalRun,
        'run_id' | 'model_label' | 'provider' | 'reasoning_effort' | 'model_family' | 'label' | 'started_at' | 'score' | 'pass_rate'
    >[]
}

export interface FamilyGridRow {
    model_family: string
    provider: string
    reasoning_effort: string | null
    n_runs: number
    score: number | null
    pass_rate: number | null
    reasoning_tokens_mean: number | null
    output_tokens_mean: number | null
    ttft_ms_p50: number | null
    latency_ms_p50: number | null
    cost_usd_per_case: number | null
    error_rate: number | null
}

export interface CheckFailureRow {
    key: string
    label: string
    kind: 'deterministic' | 'judge'
    n_evaluated: number
    n_failed: number
    failure_rate: number | null
}

export interface EvalCase {
    case_id: string
    suite: string
    skill: string | null
    title: string
    lang: string
    turns: string[]
    rubric: RubricItem[]
    rubric_version: number
    is_negative: boolean
    weight: number
}

export interface RubricItem {
    layer: 'deterministic' | 'judge'
    key: string
    check?: string
    args?: Record<string, unknown>
    prompt?: string
    weight: number
    turn?: number | string
    pass_at?: number
}

export interface EvalResultSummary {
    result_id: string
    run_id: string
    case_id: string
    repeat_idx: number
    status: 'ok' | 'error' | 'timeout'
    error: string | null
    score: number | null
    passed_hard: boolean | null
    n_tool_calls: number | null
    n_searches: number | null
    n_pages_read: number | null
    n_charts: number | null
    n_maps: number | null
    has_report: boolean | null
    has_question: boolean | null
    word_count: number | null
    skills_loaded: string[]
    hit_run_limit: boolean
    ttft_ms: number | null
    ttft_answer_ms: number | null
    ttft_report_ms: number | null
    latency_ms: number | null
    per_turn_latency_ms: number[] | null
    n_llm_turns: number | null
    input_tokens: number | null
    output_tokens: number | null
    cached_input_tokens: number | null
    reasoning_tokens: number | null
    peak_context_tokens: number | null
    cost_usd: number | null
    created_at: string
}

export interface EvalResultDetail extends EvalResultSummary {
    final_texts: string[]
    report_md: string | null
    report_title: string | null
    trace: TraceStep[] | null
}

export interface TraceStep {
    turn: number
    i: number
    name: string
    args: Record<string, unknown>
    result_head: string
}

export interface EvalCheck {
    check_id: number
    result_id: string
    run_id: string
    case_id: string
    kind: 'deterministic' | 'judge'
    key: string
    label: string
    turn: number | null
    passed: boolean | null
    score: number
    max_score: number
    weight: number
    evidence: string | null
    reason: string | null
    detail: Record<string, unknown> | null
}

// ── palette ─────────────────────────────────────────────────────────────────
/**
 * The product's chart palette (the same one the charting skill mandates for
 * agent-authored charts), so a benchmark chart reads as part of Omni rather
 * than a bolted-on dashboard. Never saturated "tech blue".
 */
export const SERIES_COLORS = [
    '#20B2AA', // washed teal — the app accent
    '#005A5A', // deep teal
    '#7B9E9E', // muted teal-gray
    '#C4A882', // warm tan
    '#8B7D6B', // warm brown
    '#5B8FA8', // steel blue
]

/** Provider identity, used consistently across every chart and badge. */
export const PROVIDER_COLORS: Record<string, string> = {
    cerebras: '#20B2AA',
    groq: '#C4A882',
    google_genai: '#5B8FA8',
    openai: '#8B7D6B',
    anthropic: '#005A5A',
}

export function providerColor(provider: string | null | undefined): string {
    return PROVIDER_COLORS[provider ?? ''] ?? '#7B9E9E'
}

export function providerLabel(provider: string | null | undefined): string {
    if (!provider) return 'unknown'
    return provider === 'google_genai' ? 'google' : provider
}

/**
 * Coarse product-line grouping for the model picker, distinct from
 * `model_family` itself. `model_family` stays at exact-weights granularity
 * (the eval's pricing lookups and the gpt-oss-120b provider×effort grid both
 * depend on that precision — e.g. `gemini-3-flash-preview` and
 * `gemini-3.6-flash` are priced ~3x apart and must never merge there). This
 * only reshapes how the *picker* buckets rows: every Gemini variant under one
 * "gemini" group, every gpt-5.x variant under one "gpt-5" group, gpt-oss-120b
 * and gpt-oss-20b together under "gpt-oss", etc. Falls through to the raw
 * family for anything not covered (currently qwen/glm/gemma, which are
 * already one family each and need no grouping).
 */
export function modelFamilyGroup(family: string | null | undefined): string {
    const f = family ?? 'other'
    if (f.startsWith('gemini')) return 'gemini'
    if (f.startsWith('gpt-5')) return 'gpt-5'
    if (f.startsWith('gpt-oss')) return 'gpt-oss'
    return f
}

export function seriesColor(index: number): string {
    return SERIES_COLORS[index % SERIES_COLORS.length]
}

/**
 * Score -> background colour, as a teal ramp.
 *
 * Uses opacity over the accent rather than a red-to-green ramp: this codebase
 * is deliberately low-chroma, and a traffic-light heatmap would be the loudest
 * thing on the page. Failure still reads clearly because the low end lands on
 * near-transparent while a passing cell is solidly tinted.
 */
export function scoreTint(score: number | null | undefined): string {
    if (score === null || score === undefined) return 'transparent'
    const clamped = Math.max(0, Math.min(1, score))
    // Floor at 0.06 so a genuine zero is still visibly a cell, not a hole.
    const alpha = 0.06 + clamped * 0.72
    return `rgba(32, 178, 170, ${alpha.toFixed(3)})`
}

export function scoreTextColor(score: number | null | undefined): string {
    if (score === null || score === undefined) return 'var(--muted-foreground)'
    return score >= 0.62 ? '#0b3b3b' : 'var(--foreground)'
}

// ── formatters ──────────────────────────────────────────────────────────────
export function fmtScore(value: number | null | undefined, digits = 3): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    return value.toFixed(digits)
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    return `${(value * 100).toFixed(digits)}%`
}

export function fmtMs(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    if (value < 1000) return `${Math.round(value)}ms`
    if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
    const mins = Math.floor(value / 60_000)
    const secs = Math.round((value % 60_000) / 1000)
    return `${mins}m ${secs}s`
}

export function fmtTokens(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
    return String(Math.round(value))
}

/**
 * Cost, or an explicit "n/a".
 *
 * Never renders a missing price as $0.00. The backend writes NULL — not zero —
 * when a model has no row in `eval_pricing`, precisely so an unpriced model
 * reads as unknown instead of winning every cost comparison it appears in.
 * Collapsing that back to 0 here would undo it.
 */
export function fmtCost(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
    if (value === 0) return '$0'
    if (value < 0.01) return `$${value.toFixed(4)}`
    if (value < 1) return `$${value.toFixed(3)}`
    return `$${value.toFixed(2)}`
}

export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function shortCaseId(caseId: string): string {
    const slash = caseId.indexOf('/')
    return slash === -1 ? caseId : caseId.slice(slash + 1)
}

export function suiteOf(caseId: string): string {
    const slash = caseId.indexOf('/')
    return slash === -1 ? caseId : caseId.slice(0, slash)
}

// ── Omni Index ──────────────────────────────────────────────────────────────
/**
 * Omni's headline number: quality, latency and price folded into one
 * sortable score, computed entirely client-side from fields the leaderboard
 * API already returns (no backend change, no new endpoint).
 *
 * quality * (bounded efficiency multiplier) — NOT a weighted geometric mean.
 * An earlier version used `score^0.75 * latencyScore^0.1 * priceScore^0.15`,
 * and on paper that reads as "quality dominates." It didn't in practice:
 * real quality scores cluster tightly (roughly 0.7-0.95, under a 1.4x range),
 * while latency/cost swing 10-100x across the roster. In a geometric mean,
 * what determines each axis's actual pull on the result is weight × log-range
 * — so latency and cost's huge dynamic range let their small nominal weights
 * (0.1 and 0.15) out-pull quality's large nominal weight (0.75) whenever a
 * fast/cheap model faced a slower/pricier-but-better one. That's the exact
 * failure this shape is built to rule out.
 *
 * Now quality directly multiplies the result — nothing on the cost/latency
 * side can zero it out or swap two models whose quality gap exceeds
 * `1 - OMNI_QUALITY_FLOOR`, no matter how extreme their speed/cost is.
 * Cost and latency only modulate that quality score within a fixed, capped
 * band (`OMNI_QUALITY_FLOOR` to 1.0) — a tiebreaker among close-quality
 * models, not a force that can out-vote a real quality difference.
 *
 * Latency and cost still become "higher is better" scores in (0, 1] via a
 * saturating curve — `ref / (ref + x)` — anchored to fixed reference points
 * rather than min-max against the rows on screen, so a model's index doesn't
 * drift just because a different subset happens to be selected. The refs are
 * calibration points, not derived from data: `OMNI_LATENCY_REF_MS` is "a
 * latency that scores 0.5", ditto `OMNI_PRICE_REF_USD` for cost per case.
 * Within that band, cost still counts for more than latency (0.6 : 0.4),
 * matching the old formula's 0.15 : 0.1 ratio.
 */
export const OMNI_QUALITY_FLOOR = 0.9
export const OMNI_EFFICIENCY_WEIGHTS = {
    cost: 0.6,
    latency: 0.4,
} as const

export const OMNI_LATENCY_REF_MS = 5000
export const OMNI_PRICE_REF_USD = 0.01

export function omniIndex(
    row: Pick<LeaderboardRow, 'score' | 'latency_ms_p50' | 'cost_usd_per_case'>
): number | null {
    const { score, latency_ms_p50, cost_usd_per_case } = row
    // A NULL cost means "unpriced", not "free" — same rule fmtCost enforces.
    // An unpriced model must not win the index just because its price axis
    // is missing, the way it would if this defaulted a missing cost to 0.
    if (score === null || latency_ms_p50 === null || cost_usd_per_case === null) return null

    const latencyScore = OMNI_LATENCY_REF_MS / (OMNI_LATENCY_REF_MS + latency_ms_p50)
    const priceScore = OMNI_PRICE_REF_USD / (OMNI_PRICE_REF_USD + cost_usd_per_case)
    const efficiency =
        OMNI_EFFICIENCY_WEIGHTS.cost * priceScore + OMNI_EFFICIENCY_WEIGHTS.latency * latencyScore

    const multiplier = OMNI_QUALITY_FLOOR + (1 - OMNI_QUALITY_FLOOR) * efficiency
    return Math.max(score, 0) * multiplier
}

// ── metric registry ─────────────────────────────────────────────────────────
/**
 * The metrics a user can pivot the page on. Centralised so the scatter axes,
 * the matrix colouring and the table columns all offer the same vocabulary and
 * format numbers identically.
 *
 * `higherIsBetter` drives sort direction and the scatter's "better" quadrant
 * hint — latency and cost are the ones where down is up.
 */
export interface MetricDef {
    key: string
    label: string
    unit: string
    higherIsBetter: boolean
    format: (v: number | null | undefined) => string
    /** Log scale suits cost and latency, which span orders of magnitude. */
    log?: boolean
}

export const METRICS: Record<string, MetricDef> = {
    omni_index: { key: 'omni_index', label: 'Omni Index', unit: '', higherIsBetter: true, format: (v) => fmtScore(v) },
    score: { key: 'score', label: 'Quality score', unit: '', higherIsBetter: true, format: (v) => fmtScore(v) },
    pass_rate: { key: 'pass_rate', label: 'Hard-check pass rate', unit: '', higherIsBetter: true, format: (v) => fmtPct(v) },
    error_rate: { key: 'error_rate', label: 'Error rate', unit: '', higherIsBetter: false, format: (v) => fmtPct(v) },
    ttft_ms_p50: { key: 'ttft_ms_p50', label: 'TTFT (first chunk)', unit: 'ms', higherIsBetter: false, format: fmtMs, log: true },
    ttft_answer_ms_p50: { key: 'ttft_answer_ms_p50', label: 'TTFT (answer prose)', unit: 'ms', higherIsBetter: false, format: fmtMs, log: true },
    latency_ms_p50: { key: 'latency_ms_p50', label: 'Latency p50', unit: 'ms', higherIsBetter: false, format: fmtMs, log: true },
    latency_ms_p95: { key: 'latency_ms_p95', label: 'Latency p95', unit: 'ms', higherIsBetter: false, format: fmtMs, log: true },
    cost_usd_per_case: { key: 'cost_usd_per_case', label: 'Cost per case', unit: 'USD', higherIsBetter: false, format: fmtCost, log: true },
    turns_mean: { key: 'turns_mean', label: 'LLM turns', unit: '', higherIsBetter: false, format: (v) => (v == null ? '—' : v.toFixed(1)) },
    output_tokens_mean: { key: 'output_tokens_mean', label: 'Output tokens', unit: '', higherIsBetter: false, format: fmtTokens },
    reasoning_tokens_mean: { key: 'reasoning_tokens_mean', label: 'Reasoning tokens', unit: '', higherIsBetter: false, format: fmtTokens },
    input_tokens_mean: { key: 'input_tokens_mean', label: 'Input tokens', unit: '', higherIsBetter: false, format: fmtTokens },
}

export const X_AXIS_METRICS = [
    'cost_usd_per_case',
    'latency_ms_p50',
    'ttft_ms_p50',
    'ttft_answer_ms_p50',
    'output_tokens_mean',
    'reasoning_tokens_mean',
] as const

export function metricValue(row: Record<string, unknown>, key: string): number | null {
    const v = row[key]
    return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

/** Stable, readable model ordering: family, then provider, then effort. */
const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

export function compareModels(a: LeaderboardRow, b: LeaderboardRow): number {
    const fam = (a.model_family ?? '').localeCompare(b.model_family ?? '')
    if (fam !== 0) return fam
    const prov = (a.provider ?? '').localeCompare(b.provider ?? '')
    if (prov !== 0) return prov
    const ea = EFFORT_ORDER[a.reasoning_effort ?? ''] ?? -1
    const eb = EFFORT_ORDER[b.reasoning_effort ?? ''] ?? -1
    return ea - eb
}
