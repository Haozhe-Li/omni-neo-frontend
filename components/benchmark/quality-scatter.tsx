'use client'

import { useMemo } from 'react'
import { EChartsChart } from '@/components/echarts-chart'
import {
    METRICS,
    X_AXIS_METRICS,
    type LeaderboardRow,
    metricValue,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'
import { cn } from '@/lib/utils'

interface QualityScatterProps {
    rows: LeaderboardRow[]
    selected: Set<string>
    xMetric: string
    yMetric: string
    onXMetricChange: (key: string) => void
    onYMetricChange: (key: string) => void
    onSelectModel: (model: string) => void
}

/**
 * Quality against cost / speed — the page's headline chart.
 *
 * A scatter rather than a bar ranking because the decision this page exists to
 * support is a trade-off, not an ordering: the best model is the one on the
 * frontier for the budget you have, and a sorted bar chart of scores hides
 * that a model two places down costs a tenth as much.
 *
 * Both axes are switchable, and the x axis defaults to log scale for cost and
 * latency — those span more than an order of magnitude across thirteen models,
 * and on a linear axis every cheap model collapses onto the y axis.
 */
export function QualityScatter({
    rows,
    selected,
    xMetric,
    yMetric,
    onXMetricChange,
    onYMetricChange,
    onSelectModel,
}: QualityScatterProps) {
    const xDef = METRICS[xMetric]
    const yDef = METRICS[yMetric]

    const { option, missing } = useMemo(() => {
        const visible = rows.filter((r) => selected.has(r.model_label))
        const points: { row: LeaderboardRow; x: number; y: number }[] = []
        const missingModels: string[] = []

        for (const row of visible) {
            const x = metricValue(row as unknown as Record<string, unknown>, xMetric)
            const y = metricValue(row as unknown as Record<string, unknown>, yMetric)
            if (x === null || y === null || (xDef?.log && x <= 0)) {
                // Almost always an unpriced model: cost is NULL, not 0, by
                // design. Naming them below the chart is better than silently
                // dropping a model the user explicitly selected.
                missingModels.push(row.model_label)
                continue
            }
            points.push({ row, x, y })
        }

        const byProvider = new Map<string, typeof points>()
        for (const p of points) {
            const key = p.row.provider ?? 'unknown'
            if (!byProvider.has(key)) byProvider.set(key, [])
            byProvider.get(key)!.push(p)
        }

        const useLog = Boolean(xDef?.log) && points.every((p) => p.x > 0)

        return {
            missing: missingModels,
            option: {
                // ECharts' built-in dark theme paints an opaque near-black canvas,
                // which shows up as a hole inside the card. Let the card show through.
                backgroundColor: 'transparent',
                grid: { left: 60, right: 28, top: 24, bottom: 56 },
                tooltip: {
                    trigger: 'item',
                    borderWidth: 0,
                    padding: [8, 12],
                    backgroundColor: 'rgba(26,26,26,0.94)',
                    textStyle: { color: '#fff', fontSize: 12 },
                    formatter: (params: any) => {
                        const row: LeaderboardRow = params.data.row
                        const lines = [
                            `<div style="font-weight:600;margin-bottom:4px">${row.model_label}</div>`,
                            `<div style="opacity:.75">${providerLabel(row.provider)}${row.reasoning_effort ? ` · ${row.reasoning_effort}` : ''}</div>`,
                            `<div style="margin-top:6px">${yDef.label}: <b>${yDef.format(params.data.value[1])}</b></div>`,
                            `<div>${xDef.label}: <b>${xDef.format(params.data.value[0])}</b></div>`,
                        ]
                        if (row.error_rate) {
                            lines.push(`<div style="opacity:.75">error rate: ${(row.error_rate * 100).toFixed(0)}%</div>`)
                        }
                        return lines.join('')
                    },
                },
                xAxis: {
                    type: useLog ? 'log' : 'value',
                    name: `${xDef.label}${useLog ? ' (log)' : ''}`,
                    nameLocation: 'middle',
                    nameGap: 32,
                    nameTextStyle: { fontSize: 11, color: '#6b6b6b' },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        fontSize: 11,
                        color: '#6b6b6b',
                        formatter: (v: number) => xDef.format(v),
                    },
                    splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)' } },
                },
                yAxis: {
                    type: 'value',
                    name: yDef.label,
                    nameLocation: 'middle',
                    nameGap: 42,
                    nameTextStyle: { fontSize: 11, color: '#6b6b6b' },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { fontSize: 11, color: '#6b6b6b', formatter: (v: number) => yDef.format(v) },
                    splitLine: { lineStyle: { color: 'rgba(128,128,128,0.12)' } },
                },
                series: [...byProvider.entries()].map(([provider, pts]) => ({
                    name: providerLabel(provider),
                    type: 'scatter',
                    symbolSize: 13,
                    itemStyle: {
                        color: providerColor(provider),
                        borderColor: 'rgba(255,255,255,0.7)',
                        borderWidth: 1,
                    },
                    emphasis: { scale: 1.5, focus: 'series' },
                    label: {
                        show: true,
                        position: 'top',
                        distance: 6,
                        fontSize: 10,
                        color: '#6b6b6b',
                        formatter: (p: any) => p.data.row.model_label,
                    },
                    labelLayout: { hideOverlap: true },
                    data: pts.map((p) => ({ value: [p.x, p.y], row: p.row })),
                })),
                legend: {
                    bottom: 0,
                    itemWidth: 8,
                    itemHeight: 8,
                    icon: 'circle',
                    textStyle: { fontSize: 11, color: '#6b6b6b' },
                },
            },
        }
    }, [rows, selected, xMetric, yMetric, xDef, yDef])

    return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                <div>
                    <h3 className="text-[13px] font-medium text-[var(--foreground)]">
                        {yDef.label} vs {xDef.label}
                    </h3>
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                        {yDef.higherIsBetter ? 'Up' : 'Down'} and{' '}
                        {xDef.higherIsBetter ? 'right' : 'left'} is better — the frontier is what matters, not the ranking.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <MetricSelect
                        label="X"
                        value={xMetric}
                        options={[...X_AXIS_METRICS]}
                        onChange={onXMetricChange}
                    />
                    <MetricSelect
                        label="Y"
                        value={yMetric}
                        options={['score', 'omni_index', 'pass_rate', 'error_rate']}
                        onChange={onYMetricChange}
                    />
                </div>
            </div>

            <EChartsChart option={option} className="h-[380px] w-full" />

            {missing.length > 0 && (
                <p className="px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
                    Not plotted (no {xDef.label.toLowerCase()} recorded): {missing.join(', ')}
                    {xMetric === 'cost_usd_per_case' && ' — add a row to eval_pricing for these models.'}
                </p>
            )}
        </div>
    )
}

function MetricSelect({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: string
    options: string[]
    onChange: (v: string) => void
}) {
    return (
        <label className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--muted-foreground)]">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    'text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--background)]',
                    'px-2 py-1 text-[var(--foreground)] outline-none',
                    'focus:border-[var(--accent)] transition-colors cursor-pointer'
                )}
            >
                {options.map((key) => (
                    <option key={key} value={key}>
                        {METRICS[key]?.label ?? key}
                    </option>
                ))}
            </select>
        </label>
    )
}
