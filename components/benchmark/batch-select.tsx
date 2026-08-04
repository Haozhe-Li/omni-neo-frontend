'use client'

import { useMemo } from 'react'
import { Layers } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { SelectMenu, type SelectOption } from '@/components/benchmark/select-menu'
import { fmtDate } from '@/lib/benchmark'

/**
 * Which run batch the page is showing.
 *
 * The hint line is the reason this is not a native select: a label like
 * `nightly-2026-08` does not say whether that batch was a full matrix run or a
 * two-model smoke test, and that is exactly what you are deciding between.
 */
export function BatchSelect() {
    const { batches, label, setLabel } = useBenchmarkData()

    const options = useMemo((): SelectOption[] => {
        return [
            {
                value: '',
                label: 'All run batches',
                hint: 'Every run ever recorded — the newest per model wins',
            },
            ...batches.map((b) => ({
                value: b.label,
                label: b.label,
                hint: `${b.runs} run${b.runs === 1 ? '' : 's'} · ${fmtDate(b.latest)}`,
            })),
        ]
    }, [batches])

    // Nothing to filter by — one batch is the same as no batches.
    if (batches.length === 0) return null

    return (
        <SelectMenu
            value={label}
            onChange={setLabel}
            options={options}
            ariaLabel="Run batch"
            leading={
                <Layers
                    className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]"
                    strokeWidth={1.5}
                />
            }
            className="max-w-[70vw] sm:max-w-none"
        />
    )
}
