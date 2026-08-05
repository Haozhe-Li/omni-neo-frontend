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

// ── model traits ────────────────────────────────────────────────────────────
/**
 * Facts about a model that the evaluation does not measure.
 *
 * The eval records what a model *did*; whether it can read an image, or
 * whether you can download its weights, is a property of the model itself and
 * has to be stated here. Kept as a hand-maintained classification rather than
 * pretending it comes from the data — and keyed on the family group, so a new
 * variant of a family it already knows (another gpt-oss effort level, another
 * gemini flash) is classified correctly without an edit.
 *
 * Note that `gpt-oss` is open weights despite the name it shares with the
 * closed gpt-5 line, which is why these match on the family group rather than
 * on a `gpt` prefix. Gemma is likewise open weights, unlike Gemini.
 */
export interface ModelTraits {
    multimodal: boolean
    openWeights: boolean
}

/** Families that take text only. Everything else is treated as multimodal. */
const TEXT_ONLY = ['gpt-oss', 'glm']
/** Families whose weights are not published. Everything else is open. */
const CLOSED_WEIGHTS = ['gpt-5', 'gemini']

export function modelTraits(family: string | null | undefined, label?: string): ModelTraits {
    const group = modelFamilyGroup(family ?? label ?? '')
    const matches = (list: string[]) => list.some((f) => group === f || group.startsWith(`${f}-`))
    return {
        multimodal: !matches(TEXT_ONLY),
        openWeights: !matches(CLOSED_WEIGHTS),
    }
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

/** The parts behind one model's {@link omniIndex}, for explaining the score. */
export interface OmniBreakdown {
    /** Raw quality, the term that dominates the product. */
    quality: number
    /** Latency mapped to (0,1] — higher is faster. */
    latencyScore: number
    /** Cost mapped to (0,1] — higher is cheaper. */
    priceScore: number
    /** Weighted blend of the two above, in (0,1]. */
    efficiency: number
    /** What efficiency multiplies quality by, in [OMNI_QUALITY_FLOOR, 1]. */
    multiplier: number
    index: number
}

/**
 * The index plus the terms that produced it.
 *
 * Exposed separately from {@link omniIndex} so the UI can show *why* a model
 * ranks where it does — a bare composite number invites "where did that come
 * from", and the answer is three sub-scores the caller would otherwise have to
 * recompute (and risk drifting from) on its own.
 */
export function omniBreakdown(
    row: Pick<LeaderboardRow, 'score' | 'latency_ms_p50' | 'cost_usd_per_case'>
): OmniBreakdown | null {
    const { score, latency_ms_p50, cost_usd_per_case } = row
    // A NULL cost means "unpriced", not "free" — same rule fmtCost enforces.
    // An unpriced model must not win the index just because its price axis
    // is missing, the way it would if this defaulted a missing cost to 0.
    if (score === null || latency_ms_p50 === null || cost_usd_per_case === null) return null

    const quality = Math.max(score, 0)
    const latencyScore = OMNI_LATENCY_REF_MS / (OMNI_LATENCY_REF_MS + latency_ms_p50)
    const priceScore = OMNI_PRICE_REF_USD / (OMNI_PRICE_REF_USD + cost_usd_per_case)
    const efficiency =
        OMNI_EFFICIENCY_WEIGHTS.cost * priceScore + OMNI_EFFICIENCY_WEIGHTS.latency * latencyScore
    const multiplier = OMNI_QUALITY_FLOOR + (1 - OMNI_QUALITY_FLOOR) * efficiency

    return { quality, latencyScore, priceScore, efficiency, multiplier, index: quality * multiplier }
}

export function omniIndex(
    row: Pick<LeaderboardRow, 'score' | 'latency_ms_p50' | 'cost_usd_per_case'>
): number | null {
    return omniBreakdown(row)?.index ?? null
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

export const Y_AXIS_METRICS = ['score', 'omni_index', 'pass_rate', 'error_rate'] as const

export function metricValue(row: Record<string, unknown>, key: string): number | null {
    const v = row[key]
    return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

// ── overview cards ──────────────────────────────────────────────────────────
/**
 * The overview page is one bar chart per metric, so the page is a `.map` over
 * this list rather than eight hand-written cards. `blurb` is the one line under
 * the card title — it says what the metric means, not what the chart is.
 *
 * Order is the reading order: the composite first, then quality, then the two
 * axes that trade against it (speed, cost), then the diagnostics.
 */
export interface MetricCardDef {
    key: string
    /**
     * URL segment for this metric's own page. Readable rather than the raw key
     * — `/metric/cost` beats `/metric/cost_usd_per_case`, and these pages are
     * the section's main search surface, so the address is part of the content.
     */
    slug: string
    /** Short title on the card — not METRICS[key].label, which is axis-length. */
    title: string
    blurb: string
    /** Renders full-width at the top of the grid instead of in a column. */
    wide?: boolean
    /**
     * Metrics worth showing beside each row on this metric's page.
     *
     * Deliberately two or three, not every column: a full grid of numbers is
     * the leaderboard table this section was built to replace. These are only
     * the ones that explain the ranking — the terms behind the Omni Index, the
     * tail behind a median latency.
     */
    context: string[]
    /**
     * How the metric is defined, in four parts.
     *
     * Written as data rather than markup because a standalone benchmark site
     * needs a methodology page, and that page is these eight entries collected
     * — a `.map` if this stays structured, a rewrite if it becomes JSX.
     */
    doc: {
        /** One sentence: what the number is. */
        what: string
        /** Where it comes from — the pipeline, the formula. */
        how: string
        /** How to read it: what counts as good, what gap is meaningful. */
        reading: string
        /** What it does not say, and what would make it misleading. */
        caveat: string
    }
}

export const METRIC_CARDS: MetricCardDef[] = [
    {
        key: 'omni_index',
        slug: 'omni-index',
        title: 'Omni Index',
        blurb: 'Quality, with speed and cost as a capped tiebreaker · Higher is better',
        wide: true,
        context: ['score', 'latency_ms_p50', 'cost_usd_per_case'],
        doc: {
            what: 'Omni’s own answer to "which model should I use" — quality, speed and price folded into one sortable number.',
            how: `Quality multiplied by a bounded efficiency term: index = score × (${OMNI_QUALITY_FLOOR} + ${(1 - OMNI_QUALITY_FLOOR).toFixed(2)} × efficiency), where efficiency blends a price score and a latency score ${OMNI_EFFICIENCY_WEIGHTS.cost} to ${OMNI_EFFICIENCY_WEIGHTS.latency}. Each of those is a saturating curve, ref / (ref + x), against fixed reference points — ${OMNI_LATENCY_REF_MS / 1000}s of latency and $${OMNI_PRICE_REF_USD} per case each score 0.5. The references are calibration constants, not derived from the models on screen, so a model’s index does not drift when a different subset is selected.`,
            reading: `Quality is the dominant term by construction. Speed and cost together can only move the result by ${Math.round((1 - OMNI_QUALITY_FLOOR) * 100)}%, so they break ties between close models and can never lift a fast, cheap model above a meaningfully more accurate one.`,
            caveat: 'A model with no price recorded gets no index at all rather than a free ride — it is absent from this ranking, not last in it. The shape is also a deliberate editorial choice: it encodes that accuracy matters more than either speed or price, which is right for research work and would be wrong for a high-volume classifier.',
        },
    },
    {
        key: 'score',
        slug: 'quality',
        title: 'Quality',
        blurb: 'Weighted rubric score across every case · Higher is better',
        context: ['pass_rate', 'error_rate'],
        doc: {
            what: 'How well the answers actually satisfied what each case asked for, from 0 to 1.',
            how: 'Every case carries a rubric of weighted checks — deterministic ones that inspect the output directly (did it produce a report, did it call the right skill, is the table well-formed) and judge-model ones that read the answer against a written criterion. A case’s score is its weighted pass fraction; the model’s score is the weighted mean across cases, averaged over repeats.',
            reading: 'Scores cluster: most models land within a narrow band near the top, so a gap of 0.02 is noise and a gap of 0.08 is real. The per-case view on a model’s page is where a headline score becomes legible — two models on the same number often fail completely different cases.',
            caveat: 'Part of this is a judge model’s opinion, so it inherits that model’s biases, and runs judged by different models are not strictly comparable. A high error rate also silently deflates the score, since a run that crashed scores zero on everything it did not reach.',
        },
    },
    {
        key: 'pass_rate',
        slug: 'hard-checks',
        title: 'Hard checks',
        blurb: 'Share of cases passing every must-pass check · Higher is better',
        context: ['score', 'error_rate'],
        doc: {
            what: 'The fraction of cases where nothing that had to happen failed to happen.',
            how: 'A subset of each rubric is marked must-pass — the contract rather than the craft: the report exists, the right skill was triggered, the requested chart was produced, the negative case was correctly refused. A case passes only if every one of them passes; partial credit does not apply.',
            reading: 'This is the floor and quality is the ceiling. A model can score well on quality while failing hard checks, and that combination means good prose that did not do what it was told — usually worse in production than a duller answer that honoured the contract.',
            caveat: 'It is all-or-nothing per case, so it moves in coarse jumps and one flaky check can cost a whole case. Read it beside quality, never instead of it.',
        },
    },
    {
        key: 'latency_ms_p50',
        slug: 'speed',
        title: 'Speed',
        blurb: 'Median wall-clock time to finish a case · Lower is better',
        context: ['latency_ms_p95', 'ttft_ms_p50', 'turns_mean'],
        doc: {
            what: 'How long a whole case takes end to end, at the median.',
            how: 'Wall-clock from the request until the final answer is complete — every LLM turn plus every tool call in between, exactly as a user would experience it. The median across cases and repeats, not the mean, so one pathological case cannot dominate.',
            reading: 'Compare it against p95 in the context column. A model whose p95 is close to its p50 is predictable; one whose p95 is several times its p50 is usually getting stuck in long tool loops on a minority of cases, and that tail is what users actually complain about.',
            caveat: 'This includes time spent in searches and page fetches, which are network-bound and not the model’s doing — so it measures the agent, not the raw model. Runs with the tool cache off see real network latency and are not comparable to cached runs.',
        },
    },
    {
        key: 'ttft_ms_p50',
        slug: 'first-token',
        title: 'Time to first token',
        blurb: 'Median wait before anything streams back · Lower is better',
        context: ['ttft_answer_ms_p50', 'latency_ms_p50'],
        doc: {
            what: 'How long the screen stays empty before the model produces anything at all.',
            how: 'Median time from the request to the first streamed chunk of any kind, including a reasoning block or a tool call the user never sees as prose.',
            reading: 'This is the perceived responsiveness number, and it is often uncorrelated with total latency — a model can start instantly and then grind, or think for eight seconds and finish quickly. The context column also carries time to the first *answer prose*, which is closer to what the reader experiences as "it started".',
            caveat: 'A model that opens with a long reasoning block scores well here while still feeling slow, because the first thing to arrive was not an answer. That is exactly why both numbers are recorded.',
        },
    },
    {
        key: 'cost_usd_per_case',
        slug: 'cost',
        title: 'Cost per case',
        blurb: 'Average USD to answer one case · Lower is better',
        context: ['score', 'output_tokens_mean', 'reasoning_tokens_mean'],
        doc: {
            what: 'What one case costs in API spend, on average.',
            how: 'Token counts from the run, priced with the per-model rates in the eval_pricing table — input, output, cached input and reasoning tokens each at their own rate, summed across every turn of the case.',
            reading: 'The spread here is the widest of any metric on the page, often two orders of magnitude, which is why the trade-off chart uses a log axis. Read it against quality: the useful question is never "what is cheapest" but "what is the cheapest thing that is good enough".',
            caveat: 'A model with no row in eval_pricing has no cost, and is left out of this ranking rather than shown at $0 — otherwise an unpriced model would win every cost comparison it appeared in. Prices also change, and these are the rates in the table at the time the page loaded, not at the time of the run.',
        },
    },
    {
        key: 'output_tokens_mean',
        slug: 'verbosity',
        title: 'Verbosity',
        blurb: 'Mean output tokens per case · Lower is better',
        context: ['reasoning_tokens_mean', 'cost_usd_per_case', 'score'],
        doc: {
            what: 'How much the model writes to answer one case.',
            how: 'Mean output tokens per case, counted across every turn. Reasoning tokens are counted separately and shown alongside, since on most providers they are billed but never shown to the reader.',
            reading: 'Lower is better only up to a point — this is a cost and latency driver, not a quality signal. The interesting models are the ones that are terse *and* score well; a model that is terse and scores badly is just not doing the work.',
            caveat: 'Cases differ in how much output they legitimately need, so this is only comparable between models on the same case set. It is not a measure of writing quality in either direction.',
        },
    },
    {
        key: 'error_rate',
        slug: 'errors',
        title: 'Error rate',
        blurb: 'Share of runs that errored or timed out · Lower is better',
        context: ['score', 'pass_rate', 'turns_mean'],
        doc: {
            what: 'How often a case did not complete at all.',
            how: 'The share of results whose status is error or timeout rather than ok — provider errors, refusals that broke the harness, context overflows, and runs that hit the wall-clock or turn limit.',
            reading: 'Treat this as a gate before reading anything else. Under a couple of percent is background noise; above that, every other number for the model is computed over the subset of cases that survived, and the quality score is dragged down by cases that scored zero for never finishing.',
            caveat: 'It does not distinguish the model’s fault from the harness’s. A provider outage during a run shows up here identically to a model that reliably loops until it hits the turn limit.',
        },
    },
]

export function metricCard(key: string): MetricCardDef | null {
    return METRIC_CARDS.find((c) => c.key === key) ?? null
}

export function metricCardBySlug(slug: string): MetricCardDef | null {
    const wanted = decodeURIComponent(slug).toLowerCase()
    return METRIC_CARDS.find((c) => c.slug === wanted) ?? METRIC_CARDS.find((c) => c.key === wanted) ?? null
}

/** The five metrics that get a rank tile on a model page, in tile order. */
export const RANK_TILES: { key: string; title: string; hint: string }[] = [
    { key: 'omni_index', title: 'Omni Index', hint: 'quality × efficiency' },
    { key: 'score', title: 'Quality', hint: 'rubric score' },
    { key: 'latency_ms_p50', title: 'Speed', hint: 'median latency' },
    { key: 'cost_usd_per_case', title: 'Price', hint: 'USD per case' },
    { key: 'output_tokens_mean', title: 'Verbosity', hint: 'output tokens' },
]

// ── ranking & distribution ──────────────────────────────────────────────────
/**
 * Where one model sits on one metric, among the models that have that metric.
 *
 * `total` counts only rows with a value, not every row on the page — an
 * unpriced model is absent from the price ranking rather than last in it, so
 * "#3 / 9" on a page of thirteen models is correct, not a bug.
 *
 * `percentile` is 1 for the best value and 0 for the worst, already flipped for
 * lower-is-better metrics, so a meter can render it without knowing which way
 * the metric points.
 */
export interface MetricRank {
    rank: number
    total: number
    value: number
    percentile: number
    median: number
}

export function rankOn(
    rows: Record<string, unknown>[],
    key: string,
    modelLabel: string
): MetricRank | null {
    const def = METRICS[key]
    if (!def) return null

    const scored = rows
        .map((r) => ({ label: String(r.model_label ?? ''), value: metricValue(r, key) }))
        .filter((r): r is { label: string; value: number } => r.value !== null)
    if (scored.length === 0) return null

    const mine = scored.find((r) => r.label === modelLabel)
    if (!mine) return null

    const sorted = [...scored].sort((a, b) =>
        def.higherIsBetter ? b.value - a.value : a.value - b.value
    )
    const rank = sorted.findIndex((r) => r.label === modelLabel) + 1
    const percentile = sorted.length === 1 ? 1 : 1 - (rank - 1) / (sorted.length - 1)

    return {
        rank,
        total: sorted.length,
        value: mine.value,
        percentile,
        median: median(scored.map((r) => r.value)) ?? mine.value,
    }
}

export function median(values: number[]): number | null {
    const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b)
    if (clean.length === 0) return null
    const mid = Math.floor(clean.length / 2)
    return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid]
}

/**
 * The models nothing else beats on both axes at once.
 *
 * The scatter's whole argument is "pick from the frontier, not from the top of
 * a list", and asking a reader to derive that frontier by eye from thirteen
 * scattered dots is asking too much. A point is on it when no other point is at
 * least as good on both axes and strictly better on one.
 */
export function paretoFrontier<T>(
    points: T[],
    x: (p: T) => number,
    y: (p: T) => number,
    xHigherIsBetter: boolean,
    yHigherIsBetter: boolean
): T[] {
    const better = (a: number, b: number, higher: boolean) => (higher ? a > b : a < b)
    const atLeast = (a: number, b: number, higher: boolean) => (higher ? a >= b : a <= b)

    const front = points.filter((p) =>
        !points.some(
            (q) =>
                q !== p &&
                atLeast(x(q), x(p), xHigherIsBetter) &&
                atLeast(y(q), y(p), yHigherIsBetter) &&
                (better(x(q), x(p), xHigherIsBetter) || better(y(q), y(p), yHigherIsBetter))
        )
    )
    return front.sort((a, b) => x(a) - x(b))
}

// ── bar scale ───────────────────────────────────────────────────────────────
/**
 * Where a bar chart's baseline should sit for a given set of values.
 *
 * A bar encodes magnitude *from its baseline*, so moving that baseline off zero
 * exaggerates differences — the classic misleading chart. It is also the only
 * way to read a metric whose values are all bunched together: quality scores
 * land between roughly 0.85 and 0.94, and against a zero baseline eighteen
 * models render as eighteen bars of visually identical height. Both of those
 * are real failures, and which one you get depends entirely on the metric.
 *
 * So the baseline is chosen from the data's own dynamic range rather than fixed
 * either way. Latency and cost span an order of magnitude and keep an honest
 * zero baseline; quality and pass rate are compressed and get a fitted one.
 * When it *is* fitted, the caller is told (`truncated`) and must say so on the
 * chart — a magnified axis is legitimate, silently magnifying one is not.
 */
export interface BarScale {
    /** Value at the foot of the bar. */
    floor: number
    /** Value at a full-height bar. */
    max: number
    /** True when `floor` is not zero, so the UI can declare the magnification. */
    truncated: boolean
}

/**
 * Below this relative spread, a zero-baseline chart is unreadable and the
 * baseline gets fitted. 0.4 means "the smallest value is more than 60% of the
 * largest" — at that point every bar is in the top half of the plot.
 */
const SPREAD_FLOOR = 0.4

/** How much of the data's range to keep as air under the smallest bar. */
const HEADROOM = 0.3

export function barScale(values: number[]): BarScale {
    const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
    if (clean.length === 0) return { floor: 0, max: 1, truncated: false }

    const max = Math.max(...clean)
    const min = Math.min(...clean)

    // A single value, all-equal values, or anything touching zero or below has
    // no meaningful range to fit against — keep the honest baseline.
    if (clean.length < 2 || max <= 0 || max === min) return { floor: 0, max, truncated: false }

    if ((max - min) / max >= SPREAD_FLOOR) return { floor: 0, max, truncated: false }

    // Leave the smallest bar a visible stub rather than sitting it exactly on
    // the floor, where it would read as "zero" — the opposite of the truth for
    // a value that is within a few percent of the leader.
    const floor = Math.max(0, min - HEADROOM * (max - min))
    return { floor, max, truncated: floor > 0 }
}

/** A value's height in a {@link BarScale}, as a percentage. */
export function barPercent(value: number, scale: BarScale, minimum = 2): number {
    const span = scale.max - scale.floor
    if (span <= 0) return 100
    return Math.max(((value - scale.floor) / span) * 100, minimum)
}

// ── routes ──────────────────────────────────────────────────────────────────
/**
 * Every link into this section, in one place.
 *
 * The benchmark is built to be liftable out of the app into a site of its own,
 * where `/benchmark/models` becomes `/models`. Route strings scattered across a
 * dozen components would each be an edit on that day; this is one constant.
 */
export const BENCH_BASE = '/benchmark'

export const benchRoutes = {
    overview: () => BENCH_BASE,
    model: (label: string) => `${BENCH_BASE}/model/${modelSlug(label)}`,
    /** A metric's own full-roster ranking page. Accepts a key or a slug. */
    metric: (keyOrSlug: string) =>
        `${BENCH_BASE}/metric/${metricCard(keyOrSlug)?.slug ?? keyOrSlug}`,
    compare: (labels: string[] = []) =>
        labels.length === 0
            ? `${BENCH_BASE}/compare`
            : `${BENCH_BASE}/compare?models=${labels.map(modelSlug).join(',')}`,
    /** The Markdown dump of every model's raw scores, meant for LLM readers. */
    llmsTxt: () => `${BENCH_BASE}/llms.txt`,
}

/** Where "Open in Omni" sends a reader to ask questions about the benchmark. */
export const OMNI_CHAT_URL = 'https://omniknows.xyz'
/** Where an LLM chat should fetch the raw data from — always production, even
 *  when the benchmark itself is being previewed on localhost or staging. */
export const LLMS_TXT_URL = 'https://omniknows.xyz/benchmark/llms.txt'

// ── model slugs ─────────────────────────────────────────────────────────────
/**
 * URL-safe id for a model page.
 *
 * Model labels carry parentheses, dots and spaces (`gpt-oss-120b (high)`,
 * `gemini-3.6-flash`), all of which survive `encodeURIComponent` but make an
 * unreadable, un-pasteable URL. Slugs are matched back case-insensitively
 * against the roster, with the raw label as a fallback so an old link built
 * from an encoded label still resolves.
 */
export function modelSlug(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function findBySlug<T extends { model_label: string }>(rows: T[], slug: string): T | null {
    const wanted = decodeURIComponent(slug)
    return (
        rows.find((r) => modelSlug(r.model_label) === wanted) ??
        rows.find((r) => r.model_label === wanted) ??
        rows.find((r) => modelSlug(r.model_label) === modelSlug(wanted)) ??
        null
    )
}

// ── generated prose ─────────────────────────────────────────────────────────
/**
 * The paragraph at the top of a model page, written from the numbers.
 *
 * Deliberately deterministic — no model call. Every clause is a comparison the
 * reader could verify off the charts below it, and phrasing it once here means
 * "above average" always means the same thing (better than the median on that
 * metric) instead of drifting per sentence.
 */
export function modelSummary(
    row: LeaderboardRowWithIndex,
    all: LeaderboardRowWithIndex[]
): string[] {
    const rows = all as unknown as Record<string, unknown>[]
    const label = row.model_label
    const sentences: string[] = []

    const band = (r: MetricRank): string => {
        if (r.total < 3) return 'in a field too small to place'
        if (r.rank === 1) return 'the best of any model here'
        if (r.percentile >= 0.75) return `among the top of the ${r.total} models measured`
        if (r.percentile >= 0.45) return 'around the middle of the field'
        return `in the slower half of the ${r.total} models measured`
    }

    const quality = rankOn(rows, 'score', label)
    if (quality) {
        const vs =
            quality.value > quality.median
                ? `above the median of ${fmtScore(quality.median)}`
                : quality.value < quality.median
                    ? `below the median of ${fmtScore(quality.median)}`
                    : 'exactly at the median'
        sentences.push(
            `${label} scores ${fmtScore(quality.value)} on quality — ${vs} — ranking #${quality.rank} of ${quality.total}.`
        )
    }

    const speed = rankOn(rows, 'latency_ms_p50', label)
    if (speed) {
        sentences.push(
            `It finishes a case in ${fmtMs(speed.value)} at the median, ${band(speed)} (median ${fmtMs(speed.median)}).`
        )
    }

    const cost = rankOn(rows, 'cost_usd_per_case', label)
    if (cost) {
        const ratio = cost.median > 0 ? cost.value / cost.median : null
        const rel =
            ratio === null
                ? ''
                : ratio >= 1.15
                    ? ` — roughly ${ratio.toFixed(1)}× the median case`
                    : ratio <= 0.85
                        ? ` — about ${(1 / ratio).toFixed(1)}× cheaper than the median case`
                        : ' — close to the median case'
        sentences.push(`Each case costs ${fmtCost(cost.value)}${rel}.`)
    } else {
        sentences.push(
            'No price is recorded for this model, so it is left out of every cost comparison rather than counted as free.'
        )
    }

    const verbosity = rankOn(rows, 'output_tokens_mean', label)
    if (verbosity && verbosity.median > 0) {
        const ratio = verbosity.value / verbosity.median
        const word = ratio >= 1.3 ? 'notably verbose' : ratio <= 0.7 ? 'notably terse' : 'about average in length'
        sentences.push(
            `Answers run ${fmtTokens(verbosity.value)} output tokens, ${word} against the ${fmtTokens(verbosity.median)}-token median.`
        )
    }

    if (row.error_rate !== null && row.error_rate > 0.02) {
        sentences.push(
            `${fmtPct(row.error_rate)} of its runs errored or timed out, which caps how far the other numbers can be trusted.`
        )
    }

    if (row.omni_index === null) {
        sentences.push(
            'It has no Omni Index: that composite needs quality, latency and price together, and at least one is missing.'
        )
    }

    return sentences
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

/**
 * Collapse a raw leaderboard response to one row per model, with `omni_index`
 * computed once.
 *
 * Runs accumulate forever — a smoke run and a full matrix run of the same
 * model both persist — so without this a model can appear more than once with
 * different case coverage, and the same name would land at two different
 * scores depending which consumer looked. Shared by the client provider and
 * the llm.txt route, which both need exactly this collapse and must not
 * arrive at it two different ways.
 */
export function dedupeLeaderboard(rows: LeaderboardRow[]): LeaderboardRowWithIndex[] {
    const newest = new Map<string, LeaderboardRow>()
    for (const row of rows) {
        const existing = newest.get(row.model_label)
        if (!existing || new Date(row.started_at) > new Date(existing.started_at)) {
            newest.set(row.model_label, row)
        }
    }
    return [...newest.values()]
        .sort(compareModels)
        .map((row): LeaderboardRowWithIndex => ({ ...row, omni_index: omniIndex(row) }))
}
