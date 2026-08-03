'use client'

import { useMemo } from 'react'
import { Check, Layers } from 'lucide-react'
import {
    type LeaderboardRow,
    providerColor,
    providerLabel,
    compareModels,
    modelFamilyGroup,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface ModelPickerProps {
    rows: LeaderboardRow[]
    selected: Set<string>
    onToggle: (model: string) => void
    onSetMany: (models: string[]) => void
}

/**
 * Multi-select over the models in the current run set. This is the page's
 * primary control — every chart, table and matrix column downstream reads the
 * same selection, so comparing three models is one click each rather than a
 * per-widget filter.
 *
 * Grouped by product line (`modelFamilyGroup`), not the raw `model_family`
 * column — six of the thirteen models are one exact family (gpt-oss-120b)
 * crossed over provider and reasoning effort, so a flat alphabetical list
 * would scatter those six and hide the structure worth comparing. Coarser
 * than that: every Gemini variant and every gpt-5.x variant also collapse
 * into one "gemini" / "gpt-5" group each, rather than showing as a pile of
 * one-model groups.
 */
export function ModelPicker({ rows, selected, onToggle, onSetMany }: ModelPickerProps) {
    const families = useMemo(() => {
        const byFamily = new Map<string, LeaderboardRow[]>()
        for (const row of rows) {
            const family = modelFamilyGroup(row.model_family)
            if (!byFamily.has(family)) byFamily.set(family, [])
            byFamily.get(family)!.push(row)
        }
        return [...byFamily.entries()]
            .map(([family, models]) => ({ family, models: models.sort(compareModels) }))
            .sort((a, b) => b.models.length - a.models.length || a.family.localeCompare(b.family))
    }, [rows])

    const allLabels = useMemo(() => rows.map((r) => r.model_label), [rows])

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                    <span className="text-[13px] font-medium text-[var(--foreground)]">Models</span>
                    <span className="text-[12px] text-[var(--muted-foreground)] tabular-nums">
                        {selected.size}/{rows.length}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onSetMany(allLabels)}
                        className="text-[12px] px-2 py-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                    >
                        All
                    </button>
                    <button
                        onClick={() => onSetMany([])}
                        className="text-[12px] px-2 py-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                    >
                        None
                    </button>
                </div>
            </div>

            <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar">
                {families.map(({ family, models }) => (
                    <div key={family}>
                        <div className="flex items-center justify-between mb-1.5 px-1">
                            <span className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                {family}
                            </span>
                            {models.length > 1 && (
                                <button
                                    onClick={() => {
                                        const labels = models.map((m) => m.model_label)
                                        const allOn = labels.every((l) => selected.has(l))
                                        const next = new Set(selected)
                                        labels.forEach((l) => (allOn ? next.delete(l) : next.add(l)))
                                        onSetMany([...next])
                                    }}
                                    className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
                                >
                                    {models.every((m) => selected.has(m.model_label)) ? 'clear' : 'select all'}
                                </button>
                            )}
                        </div>
                        <div className="space-y-0.5">
                            {models.map((model) => {
                                const on = selected.has(model.model_label)
                                return (
                                    <button
                                        key={model.model_label}
                                        onClick={() => onToggle(model.model_label)}
                                        className={cn(
                                            'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors',
                                            on ? 'bg-[var(--secondary)]' : 'hover:bg-[var(--secondary)]/60'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                                                on ? 'border-transparent' : 'border-[var(--border)]'
                                            )}
                                            style={on ? { backgroundColor: providerColor(model.provider) } : undefined}
                                        >
                                            {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                        </span>
                                        <span
                                            className={cn(
                                                'text-[13px] truncate flex-1 min-w-0',
                                                on ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                                            )}
                                        >
                                            {model.model_label}
                                        </span>
                                        {model.reasoning_effort && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] shrink-0">
                                                {model.reasoning_effort}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-[var(--muted-foreground)] shrink-0 w-14 text-right">
                                            {providerLabel(model.provider)}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
                {rows.length === 0 && (
                    <p className="px-2 py-6 text-center text-[13px] text-[var(--muted-foreground)]">
                        No runs found for this filter.
                    </p>
                )}
            </div>
        </div>
    )
}
