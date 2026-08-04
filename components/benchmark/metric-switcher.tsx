'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { METRICS, METRIC_CARDS, type MetricCardDef, benchRoutes } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * Which metric the page ranks by.
 *
 * Links, not local state. Ranking the roster by quality instead of by the Omni
 * Index is a different view worth sending someone, and state that lives only in
 * a component cannot be linked to, bookmarked, or indexed. Every position of
 * this control is a real address.
 */
export function MetricSwitcher({ active }: { active: string }) {
    return (
        <nav
            aria-label="Rank by"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
            <span className="flex shrink-0 items-center pr-1 text-[11px] text-[var(--muted-foreground)]">
                Rank by
            </span>
            {METRIC_CARDS.map((card) => {
                const on = card.key === active
                return (
                    <Link
                        key={card.key}
                        href={benchRoutes.metric(card.key)}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                            'shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors',
                            on
                                ? 'border-[var(--accent)]/45 bg-[var(--accent)]/[0.08] font-medium text-[var(--foreground)]'
                                : 'border-[var(--border-subtle)] text-[var(--muted-foreground)] hover:border-[var(--accent)]/35 hover:text-[var(--foreground)]'
                        )}
                    >
                        {card.title}
                    </Link>
                )
            })}
        </nav>
    )
}

/**
 * What the metric is, in four parts.
 *
 * The copy lives in `METRIC_CARDS[].doc` rather than here, so a methodology
 * page can collect all eight of these later without any of it being rewritten.
 * This component only decides how one entry looks.
 */
export function MetricExplainer({ card }: { card: MetricCardDef }) {
    const def = METRICS[card.key]

    const sections = [
        { k: 'What it measures', v: card.doc.what },
        { k: 'How it is computed', v: card.doc.how },
        { k: 'How to read it', v: card.doc.reading },
        { k: 'What it does not tell you', v: card.doc.caveat },
    ]

    return (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">
                    About {card.title}
                </h2>
                <span className="ml-auto shrink-0 text-[10px] text-[var(--muted-foreground)]">
                    {def?.higherIsBetter ? 'higher is better' : 'lower is better'}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {sections.map((s) => (
                    <div key={s.k} className="min-w-0">
                        <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                            {s.k}
                        </h3>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--foreground)]/85">
                            {s.v}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    )
}
