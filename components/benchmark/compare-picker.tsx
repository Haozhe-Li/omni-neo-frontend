'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import {
    type LeaderboardRowWithIndex,
    compareModels,
    modelFamilyGroup,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

export const MAX_COMPARE = 4

interface ComparePickerProps {
    rows: LeaderboardRowWithIndex[]
    selected: string[]
    onChange: (models: string[]) => void
    /** Series colour per selected model, so chips match the charts. */
    colorOf: (label: string) => string
}

/**
 * Pick up to four models to compare.
 *
 * Four is a real limit, not a soft one: a radar with five overlapping polygons
 * is decoration, and grouped bars stop being comparable once a group is wider
 * than the eye can hold. When the limit is reached the remaining models stay
 * visible but disabled, so it is obvious that the cap is a cap rather than the
 * list having ended.
 *
 * Chips carry the model's *series* colour, not its provider colour — on this
 * page a reader's first question about any mark is "which of my four is that",
 * and two Gemini variants sharing one provider colour would make that
 * unanswerable.
 */
export function ComparePicker({ rows, selected, onChange, colorOf }: ComparePickerProps) {
    const [open, setOpen] = useState(false)
    const full = selected.length >= MAX_COMPARE

    const groups = useMemo(() => {
        const byFamily = new Map<string, LeaderboardRowWithIndex[]>()
        for (const row of rows) {
            const family = modelFamilyGroup(row.model_family)
            if (!byFamily.has(family)) byFamily.set(family, [])
            byFamily.get(family)!.push(row)
        }
        return [...byFamily.entries()]
            .map(([family, models]) => ({ family, models: models.sort(compareModels) }))
            .sort((a, b) => b.models.length - a.models.length || a.family.localeCompare(b.family))
    }, [rows])

    const toggle = (label: string) => {
        if (selected.includes(label)) {
            onChange(selected.filter((m) => m !== label))
        } else if (!full) {
            onChange([...selected, label])
        }
    }

    return (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-medium text-[var(--foreground)]">
                    Comparing{' '}
                    <span className="tabular-nums text-[var(--muted-foreground)]">
                        {selected.length} / {MAX_COMPARE}
                    </span>
                </h2>
                {selected.length > 0 && (
                    <button
                        onClick={() => onChange([])}
                        className="text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {selected.map((label) => (
                    <span
                        key={label}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-1.5 text-[12px]"
                        style={{
                            borderColor: `${colorOf(label)}66`,
                            backgroundColor: `${colorOf(label)}14`,
                        }}
                    >
                        <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: colorOf(label) }}
                        />
                        <span className="truncate text-[var(--foreground)]">{label}</span>
                        <button
                            onClick={() => toggle(label)}
                            aria-label={`Remove ${label}`}
                            className="rounded-full p-0.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        >
                            <X className="h-3 w-3" strokeWidth={2} />
                        </button>
                    </span>
                ))}

                <button
                    onClick={() => setOpen((v) => !v)}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-[12px] transition-colors',
                        open
                            ? 'border-[var(--accent)] text-[var(--accent)]'
                            : 'border-[var(--border-subtle)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    )}
                >
                    <Plus className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-45')} strokeWidth={1.75} />
                    {open ? 'Done' : 'Add model'}
                </button>
            </div>

            {open && (
                <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto border-t border-[var(--border-subtle)] pt-3">
                    {full && (
                        <p className="text-[11px] text-[var(--muted-foreground)]">
                            Four is the limit — remove one to swap in another.
                        </p>
                    )}
                    {groups.map((group) => (
                        <div key={group.family}>
                            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                {group.family}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {group.models.map((row) => {
                                    const on = selected.includes(row.model_label)
                                    const disabled = !on && full
                                    return (
                                        <button
                                            key={row.model_label}
                                            onClick={() => toggle(row.model_label)}
                                            disabled={disabled}
                                            className={cn(
                                                'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors',
                                                on
                                                    ? 'border-[var(--accent)]/50 bg-[var(--accent)]/[0.08] text-[var(--foreground)]'
                                                    : 'border-[var(--border-subtle)] text-[var(--muted-foreground)]',
                                                disabled
                                                    ? 'cursor-not-allowed opacity-40'
                                                    : 'hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]'
                                            )}
                                        >
                                            {on ? (
                                                <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
                                            ) : (
                                                <span
                                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: providerColor(row.provider) }}
                                                />
                                            )}
                                            <span className="truncate">{row.model_label}</span>
                                            <span className="shrink-0 text-[10px] opacity-60">
                                                {providerLabel(row.provider)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
