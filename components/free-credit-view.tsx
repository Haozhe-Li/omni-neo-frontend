'use client'

import Link from 'next/link'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ArrowLeft, Check, Clock, Copy, Gift, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

/**
 * What the /get-free-credit page is showing. Derived by the client from the
 * backend's cooldown state (GET /api/free_credit) and from what the user does
 * on the page; this component only draws it.
 */
export type FreeCreditViewState =
    | { kind: 'loading' }
    /** Nothing on file for the last 3 days — the "Grab a code" button is offered. */
    | { kind: 'available' }
    /** A code is on file and still unclaimed. */
    | { kind: 'code'; code: string; expiresAt: string | null }
    /** The code was claimed within the last 3 days — no new one until `availableAt`. */
    | { kind: 'redeemed'; code: string; availableAt: string | null; creditsAdded: number | null }
    | { kind: 'denied'; availableAt: string | null }
    | { kind: 'error' }

interface FreeCreditViewProps {
    view: FreeCreditViewState
    busy?: boolean
    copied?: boolean
    redeeming?: boolean
    redeemError?: string | null
    onGrab?: () => void
    onCopy?: () => void
    onRedeem?: () => void
    onRetry?: () => void
}

const STEPS = [
    ['Grab', 'Ask for a one-time code, made for this account only.'],
    ['Redeem', 'Add it to your balance with one click, right here.'],
    ['Spend', 'Extra credits are used first and never expire.'],
] as const

// `.omni-pill` is unlayered CSS, so Tailwind's padding utilities lose to it —
// the size lives in a style object instead.
const BUTTON_STYLE = { padding: '11px 26px', fontSize: 14, justifyContent: 'center' } as const

function fmtDay(iso: string | null) {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : format(d, 'MMM d, h:mm a')
}

function fmtIn(iso: string | null) {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : formatDistanceToNowStrict(d)
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-background px-5 py-16">
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                <div
                    className="absolute -inset-[50%] opacity-[0.06] dark:opacity-[0.1]"
                    style={{
                        background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 58%)',
                        filter: 'blur(100px)',
                    }}
                />
            </div>
            <Link
                href="/"
                aria-label="Back home"
                className="absolute left-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink-muted)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
            >
                <ArrowLeft size={16} />
            </Link>
            <div className="relative z-10 flex w-full max-w-[420px] flex-col animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out">
                {children}
            </div>
        </main>
    )
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
    return (
        <header className="mb-8 text-center">
            <p className="omni-eyebrow mb-3">{eyebrow}</p>
            <h1 className="omni-display text-[38px] leading-[1.05] text-[var(--ink)]">{title}</h1>
            {children && (
                <p className="mx-auto mt-3 max-w-[340px] text-balance text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
                    {children}
                </p>
            )}
        </header>
    )
}

/** A ticket: the code on top, a perforated tear line, the fine print below. */
function Ticket({
    code,
    muted,
    badge,
    copied,
    onCopy,
    meta,
}: {
    code: string
    muted?: boolean
    badge: React.ReactNode
    copied?: boolean
    onCopy?: () => void
    meta: Array<[string, string]>
}) {
    return (
        <div className="relative overflow-hidden rounded-[22px] border border-[var(--line-strong)] bg-[var(--paper-raised)] shadow-[0_1px_0_rgba(43,39,36,0.04),0_18px_40px_-24px_rgba(43,39,36,0.28)]">
            <div className="px-6 pb-6 pt-5">
                <div className="mb-4 flex items-center justify-between">
                    <span className="omni-eyebrow">Your code</span>
                    {badge}
                </div>
                <div
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 ${
                        muted
                            ? 'border-[var(--line)] bg-[var(--sand)]/50'
                            : 'border-[var(--teal-line)] bg-[var(--teal-tint-deep)]'
                    }`}
                >
                    <span
                        className={`omni-mono min-w-0 truncate text-[17px] font-medium tracking-[0.06em] ${
                            muted ? 'text-[var(--ink-faint)] line-through decoration-[var(--ink-fainter)]' : 'text-[var(--ink)]'
                        }`}
                    >
                        {code}
                    </span>
                    {onCopy && (
                        <button
                            onClick={onCopy}
                            aria-label="Copy code"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-raised)] hover:text-[var(--teal)]"
                        >
                            {copied ? <Check size={16} className="text-[var(--teal)]" /> : <Copy size={16} />}
                        </button>
                    )}
                </div>
            </div>

            {/* Tear line: dashed rule with a bite out of each edge. */}
            <div className="relative h-0">
                <div className="absolute inset-x-6 top-0 border-t border-dashed border-[var(--line-strong)]" />
                <span className="absolute -left-3 top-0 size-6 -translate-y-1/2 rounded-full border border-[var(--line-strong)] bg-background" />
                <span className="absolute -right-3 top-0 size-6 -translate-y-1/2 rounded-full border border-[var(--line-strong)] bg-background" />
            </div>

            <dl className="grid grid-cols-2 gap-4 px-6 pb-5 pt-6">
                {meta.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                        <dt className="omni-eyebrow mb-1">{k}</dt>
                        <dd className="truncate text-[13.5px] text-[var(--ink)]">{v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}

function Badge({ tone, children }: { tone: 'teal' | 'muted'; children: React.ReactNode }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] ${
                tone === 'teal'
                    ? 'bg-[var(--teal-tint)] text-[var(--teal)]'
                    : 'bg-[var(--sand-deep)] text-[var(--ink-muted)]'
            }`}
        >
            {children}
        </span>
    )
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--sand)]/60 px-4 py-3.5 text-[13.5px] leading-[1.6] text-[var(--ink-soft)]">
            <span className="mt-0.5 shrink-0 text-[var(--ink-muted)]">{icon}</span>
            <div>{children}</div>
        </div>
    )
}

export function FreeCreditView({
    view,
    busy,
    copied,
    redeeming,
    redeemError,
    onGrab,
    onCopy,
    onRedeem,
    onRetry,
}: FreeCreditViewProps) {
    if (view.kind === 'loading') {
        return (
            <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
                <Spinner className="size-6 text-muted-foreground" />
            </div>
        )
    }

    if (view.kind === 'available') {
        return (
            <Shell>
                <Heading eyebrow="Free credit" title="Ran out of credit?">
                    Grab a one-time code and top up your balance. No card, no catch.
                </Heading>

                <button
                    onClick={onGrab}
                    disabled={busy}
                    className="omni-pill omni-pill-solid w-full disabled:cursor-not-allowed disabled:opacity-60"
                    style={BUTTON_STYLE}
                >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Gift size={15} />}
                    {busy ? 'Checking…' : 'Grab a code'}
                </button>
                <p className="mt-3 text-center text-[12.5px] text-[var(--ink-faint)]">
                    You can grab one code every 3 days.
                </p>

                <ol className="omni-card mt-10 divide-y divide-[var(--line)] overflow-hidden">
                    {STEPS.map(([title, body], i) => (
                        <li key={title} className="flex items-start gap-4 px-5 py-4">
                            <span className="omni-mono mt-0.5 text-[12px] text-[var(--teal)]">0{i + 1}</span>
                            <div>
                                <p className="text-[14px] text-[var(--ink)]">{title}</p>
                                <p className="mt-0.5 text-[13px] leading-[1.55] text-[var(--ink-muted)]">{body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </Shell>
        )
    }

    if (view.kind === 'code') {
        const until = fmtDay(view.expiresAt)
        const left = fmtIn(view.expiresAt)
        return (
            <Shell>
                <Heading eyebrow="Free credit" title="Here’s your code">
                    Made for this account alone. Redeem it now, or paste it into Settings → Usage later.
                </Heading>

                <Ticket
                    code={view.code}
                    copied={copied}
                    onCopy={onCopy}
                    badge={
                        <Badge tone="teal">
                            <Sparkles size={11} /> Ready to redeem
                        </Badge>
                    }
                    meta={[
                        ['Valid until', until ?? '3 days from now'],
                        ['Time left', left ?? '—'],
                    ]}
                />

                <button
                    onClick={onRedeem}
                    disabled={redeeming}
                    className="omni-pill omni-pill-solid mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60"
                    style={BUTTON_STYLE}
                >
                    {redeeming ? <Loader2 size={15} className="animate-spin" /> : <Gift size={15} />}
                    {redeeming ? 'Redeeming…' : 'Redeem now'}
                </button>
                {redeemError && (
                    <p className="mt-3 text-center text-[12.5px] text-[var(--destructive)]">{redeemError}</p>
                )}
            </Shell>
        )
    }

    if (view.kind === 'redeemed') {
        const next = fmtDay(view.availableAt)
        const wait = fmtIn(view.availableAt)
        return (
            <Shell>
                <Heading
                    eyebrow="Free credit"
                    title={view.creditsAdded != null ? 'Credits added' : 'Already claimed'}
                >
                    {view.creditsAdded != null
                        ? `${view.creditsAdded.toLocaleString()} credits are in your balance and will be spent first.`
                        : 'You’ve already redeemed a code in the last 3 days.'}
                </Heading>

                <Ticket
                    code={view.code}
                    muted
                    badge={
                        <Badge tone="muted">
                            <Check size={11} /> Redeemed
                        </Badge>
                    }
                    meta={[
                        ['Next code', next ?? 'In a few days'],
                        ['Available in', wait ?? '—'],
                    ]}
                />

                <Link
                    href="/"
                    className="omni-pill omni-pill-solid mt-5 w-full"
                    style={BUTTON_STYLE}
                >
                    Back to chat
                </Link>
            </Shell>
        )
    }

    if (view.kind === 'denied') {
        const wait = fmtIn(view.availableAt)
        return (
            <Shell>
                <Heading eyebrow="Free credit" title="Not right now" />
                <Notice icon={<Clock size={16} />}>
                    We can’t offer a code for this account at the moment
                    {wait ? `. Please try again in about ${wait}.` : ', please try again later.'}
                </Notice>
                <Link href="/" className="omni-pill w-full" style={BUTTON_STYLE}>
                    Back to chat
                </Link>
            </Shell>
        )
    }

    return (
        <Shell>
            <Heading eyebrow="Free credit" title="Something went wrong" />
            <Notice icon={<TriangleAlert size={16} />}>We couldn’t reach the server. Please try again.</Notice>
            <button onClick={onRetry} className="omni-pill w-full" style={BUTTON_STYLE}>
                Try again
            </button>
        </Shell>
    )
}
