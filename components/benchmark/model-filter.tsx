'use client'

import { Check, SlidersHorizontal } from 'lucide-react'
import { useBenchmarkData, type ModelFilters } from '@/components/benchmark/benchmark-provider'
import { AnchoredPanel, useAnchoredPanel } from '@/components/benchmark/popover'
import { cn } from '@/lib/utils'

const FACETS: { key: keyof ModelFilters; label: string; hint: string }[] = [
    { key: 'multimodal', label: 'Multimodal', hint: 'Takes more than text as input' },
    { key: 'openWeights', label: 'Open weights', hint: 'Weights you can download and run' },
]

/**
 * Shown when the filter matches nothing.
 *
 * Without it every chart on the page would independently report "no model has
 * this recorded", which blames the data for a choice the reader just made and
 * offers no way back.
 */
export function NoModelsMatch() {
    const { filters, setFilters, models } = useBenchmarkData()
    const active = FACETS.filter((f) => filters[f.key])

    return (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-14 text-center">
            <p className="text-[14px] text-[var(--foreground)]">
                No model is {active.map((f) => f.label.toLowerCase()).join(' and ')}.
            </p>
            <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                All {models.length} models are hidden by the current filter.
            </p>
            <button
                type="button"
                onClick={() => setFilters({ multimodal: false, openWeights: false })}
                className="mt-4 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:border-[var(--accent)]/40"
            >
                Clear filter
            </button>
        </div>
    )
}


/**
 * Narrow the roster to models with a given trait.
 *
 * Checkboxes rather than a dropdown because these are independent questions,
 * not one choice: you can want a multimodal model, an open-weights one, or one
 * that is both. Ticking both narrows to models satisfying both — the ordinary
 * meaning of two filters, and the count in the trigger says what survived so
 * the effect is never something you have to infer from the charts.
 *
 * Nothing ticked means no filtering at all, which is deliberately also the
 * default: a benchmark should open showing everything it measured.
 */
export function ModelFilter() {
    const { filters, setFilters, models, visibleModels } = useBenchmarkData()
    const panel = useAnchoredPanel('right')
    const { open, setOpen, triggerRef } = panel

    const active = FACETS.filter((f) => filters[f.key]).length
    const hidden = models.length - visibleModels.length

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="true"
                aria-expanded={open}
                className={cn(
                    'inline-flex max-w-[70vw] items-center gap-2 rounded-lg border bg-[var(--card)]',
                    'px-2.5 py-1.5 text-[12px] transition-colors sm:max-w-none',
                    open || active > 0
                        ? 'border-[var(--accent)] text-[var(--foreground)]'
                        : 'border-[var(--border-subtle)] text-[var(--foreground)] hover:border-[var(--accent)]/40'
                )}
            >
                <SlidersHorizontal
                    className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]"
                    strokeWidth={1.5}
                />
                <span className="truncate">
                    {active === 0 ? 'All models' : FACETS.filter((f) => filters[f.key]).map((f) => f.label).join(' + ')}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                    {visibleModels.length}
                </span>
            </button>

            <AnchoredPanel state={panel} ariaLabel="Filter models" role="group">
                {FACETS.map((facet) => {
                    const on = filters[facet.key]
                    return (
                        <button
                            key={facet.key}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            // Stays open on toggle: these are independent
                            // switches, and closing after each one would make
                            // setting both take two round trips.
                            onClick={() => setFilters({ ...filters, [facet.key]: !on })}
                            className={cn(
                                'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                                'hover:bg-[var(--muted)] sm:px-2.5 sm:py-2'
                            )}
                        >
                            <span
                                className={cn(
                                    'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                                    on
                                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                        : 'border-[var(--border)] bg-transparent'
                                )}
                            >
                                <Check
                                    className={cn('h-3 w-3', on ? 'opacity-100' : 'opacity-0')}
                                    strokeWidth={3}
                                />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] text-[var(--foreground)]">
                                    {facet.label}
                                </span>
                                <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                                    {facet.hint}
                                </span>
                            </span>
                        </button>
                    )
                })}

                <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-3 pb-1 pt-2 sm:px-2.5">
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                        {hidden === 0
                            ? `Showing all ${models.length}`
                            : `${visibleModels.length} of ${models.length} shown`}
                    </span>
                    {active > 0 && (
                        <button
                            type="button"
                            onClick={() => setFilters({ multimodal: false, openWeights: false })}
                            className="text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </AnchoredPanel>
        </div>
    )
}
