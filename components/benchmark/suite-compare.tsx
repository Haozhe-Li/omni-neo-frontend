'use client'

import { useMemo, useState } from 'react'
import { EChartsChart } from '@/components/echarts-chart'
import { type EvalRun, fmtScore, seriesColor } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface SuiteCompareProps {
    runs: EvalRun[]
    selected: Set<string>
}

/**
 * Per-suite scores for the selected models, as radar or grouped bars.
 *
 * Radar answers "what is this model's shape" — which capabilities it is strong
 * and weak at — and is genuinely useful up to about five models before the
 * overlapping polygons stop being readable. Bars stay legible at thirteen but
 * make the shape harder to see, so both are offered rather than picking one.
 */
export function SuiteCompare({ runs, selected }: SuiteCompareProps) {
    const [mode, setMode] = useState<'radar' | 'bar'>('radar')

    const { suites, series } = useMemo(() => {
        const visible = runs.filter((r) => selected.has(r.model_label) && r.suite_scores)
        const suiteSet = new Set<string>()
        for (const run of visible) {
            Object.keys(run.suite_scores ?? {}).forEach((s) => suiteSet.add(s))
        }
        const suiteList = [...suiteSet].sort()
        return {
            suites: suiteList,
            series: visible.map((run) => ({
                name: run.model_label,
                values: suiteList.map((s) => run.suite_scores?.[s] ?? 0),
            })),
        }
    }, [runs, selected])

    const option = useMemo(() => {
        if (suites.length === 0 || series.length === 0) return null

        const common = {
            // See quality-scatter: the dark theme's opaque canvas would
            // otherwise punch a black rectangle into the card.
            backgroundColor: 'transparent',
            tooltip: {
                borderWidth: 0,
                padding: [8, 12],
                backgroundColor: 'rgba(26,26,26,0.94)',
                textStyle: { color: '#fff', fontSize: 12 },
            },
            legend: {
                type: 'scroll',
                bottom: 0,
                itemWidth: 8,
                itemHeight: 8,
                icon: 'circle',
                textStyle: { fontSize: 11, color: '#6b6b6b' },
            },
        }

        if (mode === 'radar') {
            return {
                ...common,
                tooltip: { ...common.tooltip, trigger: 'item' },
                radar: {
                    indicator: suites.map((s) => ({ name: s, max: 1 })),
                    radius: '64%',
                    center: ['50%', '46%'],
                    axisName: { fontSize: 10, color: '#6b6b6b' },
                    splitLine: { lineStyle: { color: 'rgba(128,128,128,0.16)' } },
                    splitArea: { show: false },
                    axisLine: { lineStyle: { color: 'rgba(128,128,128,0.16)' } },
                },
                series: [
                    {
                        type: 'radar',
                        symbolSize: 3,
                        data: series.map((s, i) => ({
                            name: s.name,
                            value: s.values,
                            lineStyle: { width: 1.5, color: seriesColor(i) },
                            itemStyle: { color: seriesColor(i) },
                            areaStyle: { opacity: 0.06, color: seriesColor(i) },
                        })),
                    },
                ],
            }
        }

        return {
            ...common,
            tooltip: { ...common.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: 44, right: 16, top: 16, bottom: 56 },
            xAxis: {
                type: 'category',
                data: suites,
                axisLine: { lineStyle: { color: 'rgba(128,128,128,0.2)' } },
                axisTick: { show: false },
                axisLabel: { fontSize: 10, color: '#6b6b6b', interval: 0, rotate: suites.length > 6 ? 30 : 0 },
            },
            yAxis: {
                type: 'value',
                max: 1,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { fontSize: 10, color: '#6b6b6b' },
                splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)' } },
            },
            series: series.map((s, i) => ({
                name: s.name,
                type: 'bar',
                data: s.values,
                itemStyle: { color: seriesColor(i), borderRadius: [3, 3, 0, 0] },
                barMaxWidth: 18,
            })),
        }
    }, [suites, series, mode])

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                <div>
                    <h3 className="text-[13px] font-medium text-[var(--foreground)]">Capability shape</h3>
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                        Score per suite — where each model is strong and where it isn&apos;t.
                    </p>
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--muted)]">
                    {(['radar', 'bar'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={cn(
                                'px-2.5 py-1 rounded-md text-[11px] capitalize transition-colors',
                                mode === m
                                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>
            {option ? (
                <EChartsChart option={option} className="h-[340px] w-full" />
            ) : (
                <p className="px-4 py-12 text-center text-[13px] text-[var(--muted-foreground)]">
                    Select models with completed runs to compare suites.
                </p>
            )}
            {series.length > 5 && mode === 'radar' && (
                <p className="px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
                    {series.length} overlapping polygons is a lot to read — the bar view stays legible.
                </p>
            )}
        </div>
    )
}

export { fmtScore }
