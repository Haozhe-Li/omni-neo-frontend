'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EChartsChart, useChartTheme } from '@/components/echarts-chart'
import { SelectMenu, type SelectOption } from '@/components/benchmark/select-menu'
import {
    METRICS,
    X_AXIS_METRICS,
    Y_AXIS_METRICS,
    type LeaderboardRowWithIndex,
    metricValue,
    benchRoutes,
    paretoFrontier,
    providerColor,
    providerLabel,
} from '@/lib/benchmark'

interface TradeoffScatterProps {
    rows: LeaderboardRowWithIndex[]
    xMetric: string
    yMetric: string
    onXMetricChange: (key: string) => void
    onYMetricChange: (key: string) => void
    /** Draw everything else faded; used by the compare page. */
    highlight?: Set<string>
    height?: number
}

/**
 * Quality against cost or speed — the one chart on this page that is not a
 * ranking, because the decision it supports is not an ordering.
 *
 * A sorted bar chart answers "which model is best on X". This answers the
 * question that actually gets asked: for the budget or latency I can live
 * with, what is the best I can get? A model two places down a leaderboard
 * costing a tenth as much is invisible in a ranking and obvious here.
 *
 * The frontier is drawn, not left to the eye. Every point on that line is a
 * defensible pick; every point above/behind it is beaten outright by something
 * on it. Cost and latency default to a log axis — they span orders of
 * magnitude across the roster, and on a linear axis every cheap model collapses
 * into the y axis.
 */
export function TradeoffScatter({
    rows,
    xMetric,
    yMetric,
    onXMetricChange,
    onYMetricChange,
    highlight,
    height = 380,
}: TradeoffScatterProps) {
    const router = useRouter()
    const theme = useChartTheme()
    const xDef = METRICS[xMetric]
    const yDef = METRICS[yMetric]

    const { option, missing } = useMemo(() => {
        const points: { row: LeaderboardRowWithIndex; x: number; y: number }[] = []
        const missingModels: string[] = []

        for (const row of rows) {
            const x = metricValue(row as unknown as Record<string, unknown>, xMetric)
            const y = metricValue(row as unknown as Record<string, unknown>, yMetric)
            if (x === null || y === null || (xDef?.log && x <= 0)) {
                // Almost always an unpriced model: cost is NULL, not 0, by
                // design. Naming them under the chart beats silently dropping
                // a model the reader can see in every other card.
                missingModels.push(row.model_label)
                continue
            }
            points.push({ row, x, y })
        }

        const front = paretoFrontier(
            points,
            (p) => p.x,
            (p) => p.y,
            xDef?.higherIsBetter ?? true,
            yDef?.higherIsBetter ?? true
        )
        const onFront = new Set(front.map((p) => p.row.model_label))
        const dimmed = (label: string) => Boolean(highlight && !highlight.has(label))

        const byProvider = new Map<string, typeof points>()
        for (const p of points) {
            const key = p.row.provider ?? 'unknown'
            if (!byProvider.has(key)) byProvider.set(key, [])
            byProvider.get(key)!.push(p)
        }

        const useLog = Boolean(xDef?.log) && points.every((p) => p.x > 0)
        const axisText = theme.axis

        return {
            missing: missingModels,
            option: {
                // ECharts' dark theme paints an opaque near-black canvas, which
                // shows up as a hole inside the card. Let the card show through.
                backgroundColor: 'transparent',
                animationDuration: 520,
                animationEasing: 'cubicOut',
                grid: { left: 58, right: 20, top: 20, bottom: 54, containLabel: false },
                tooltip: {
                    trigger: 'item',
                    borderWidth: 0,
                    padding: [8, 12],
                    confine: true,
                    backgroundColor: 'rgba(26,26,26,0.94)',
                    textStyle: { color: '#fff', fontSize: 12 },
                    formatter: (params: any) => {
                        const row: LeaderboardRowWithIndex | undefined = params.data?.row
                        if (!row) return ''
                        return [
                            `<div style="font-weight:600;margin-bottom:4px">${row.model_label}</div>`,
                            `<div style="opacity:.75">${providerLabel(row.provider)}${row.reasoning_effort ? ` · ${row.reasoning_effort}` : ''}</div>`,
                            `<div style="margin-top:6px">${yDef.label}: <b>${yDef.format(params.data.value[1])}</b></div>`,
                            `<div>${xDef.label}: <b>${xDef.format(params.data.value[0])}</b></div>`,
                            onFront.has(row.model_label)
                                ? '<div style="margin-top:6px;opacity:.75">on the frontier</div>'
                                : '',
                            '<div style="margin-top:6px;opacity:.6">tap to open this model</div>',
                        ].join('')
                    },
                },
                xAxis: {
                    type: useLog ? 'log' : 'value',
                    // Fit the axis to the data instead of anchoring at zero:
                    // quality scores cluster near the top of 0..1, and a
                    // zero-anchored axis spends its height on empty space while
                    // squashing every real difference into a few pixels.
                    scale: true,
                    name: `${xDef.label}${useLog ? ' (log)' : ''}`,
                    nameLocation: 'middle',
                    nameGap: 32,
                    nameTextStyle: { fontSize: 11, color: axisText },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { fontSize: 10, color: axisText, formatter: (v: number) => xDef.format(v) },
                    splitLine: { lineStyle: { color: theme.grid } },
                },
                yAxis: {
                    type: 'value',
                    scale: true,
                    name: yDef.label,
                    nameLocation: 'middle',
                    nameGap: 44,
                    nameTextStyle: { fontSize: 11, color: axisText },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { fontSize: 10, color: axisText, formatter: (v: number) => yDef.format(v) },
                    splitLine: { lineStyle: { color: theme.grid } },
                },
                series: [
                    {
                        name: 'frontier',
                        type: 'line',
                        silent: true,
                        symbol: 'none',
                        z: 1,
                        lineStyle: { color: theme.accent, width: 1.5, type: 'dashed', opacity: 0.65 },
                        data: front.map((p) => [p.x, p.y]),
                        tooltip: { show: false },
                    },
                    ...[...byProvider.entries()].map(([provider, pts]) => ({
                        name: providerLabel(provider),
                        type: 'scatter',
                        z: 2,
                        itemStyle: {
                            color: providerColor(provider),
                            borderColor: theme.dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.7)',
                            borderWidth: 1,
                        },
                        emphasis: { scale: 1.45, focus: 'series' },
                        label: {
                            show: true,
                            position: 'top',
                            distance: 6,
                            fontSize: 10,
                            color: axisText,
                            formatter: (p: any) => p.data.row.model_label,
                        },
                        // minMargin stops hideOverlap counting labels as clear
                        // when they are adjacent but visually touching.
                        labelLayout: { hideOverlap: true, minMargin: 4 },
                        // Size and opacity ride on the data items rather than on
                        // the series: ECharts only accepts callbacks for some
                        // series-level style fields, and per-item values work
                        // everywhere without depending on which ones those are.
                        data: pts.map((p) => ({
                            value: [p.x, p.y],
                            row: p.row,
                            symbolSize: onFront.has(p.row.model_label) ? 15 : 11,
                            itemStyle: dimmed(p.row.model_label) ? { opacity: 0.2 } : undefined,
                            label: dimmed(p.row.model_label) ? { show: false } : undefined,
                        })),
                    })),
                ],
                legend: {
                    type: 'scroll',
                    bottom: 0,
                    itemWidth: 8,
                    itemHeight: 8,
                    icon: 'circle',
                    textStyle: { fontSize: 11, color: axisText },
                    data: [...byProvider.keys()].map((p) => providerLabel(p)),
                },
            },
        }
    }, [rows, xMetric, yMetric, xDef, yDef, highlight, theme])

    return (
        <section className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)]">
            <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
                        {yDef.label} vs {xDef.label}
                    </h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                        {yDef.higherIsBetter ? 'Up' : 'Down'} and {xDef.higherIsBetter ? 'right' : 'left'}{' '}
                        is better. The dashed line is the frontier — nothing beats those models on both
                        axes at once.
                    </p>
                </div>
                {/* Wraps rather than scrolls: an overflow-x-auto row would clip
                    the dropdown panel, which is absolutely positioned inside it.
                    Two fixed-width triggers fit side by side down to 320px. */}
                <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-nowrap">
                    <AxisSelect axis="X" value={xMetric} options={[...X_AXIS_METRICS]} onChange={onXMetricChange} />
                    <AxisSelect axis="Y" value={yMetric} options={[...Y_AXIS_METRICS]} onChange={onYMetricChange} />
                </div>
            </div>

            <EChartsChart
                option={option}
                className="w-full"
                onEvent={{
                    click: (params: any) => {
                        const label = params?.data?.row?.model_label
                        if (label) router.push(benchRoutes.model(label))
                    },
                }}
                style={{ height }}
            />

            {missing.length > 0 && (
                <p className="px-4 pb-3 text-[11px] leading-relaxed text-[var(--muted-foreground)] sm:px-5">
                    Not plotted (no {xDef.label.toLowerCase()} recorded): {missing.join(', ')}
                    {xMetric === 'cost_usd_per_case' && ' — add a row to eval_pricing for these models.'}
                </p>
            )}
        </section>
    )
}

function AxisSelect({
    axis,
    value,
    options,
    onChange,
}: {
    axis: 'X' | 'Y'
    value: string
    options: string[]
    onChange: (v: string) => void
}) {
    const items = useMemo(
        (): SelectOption[] =>
            options.map((key) => {
                const def = METRICS[key]
                return {
                    value: key,
                    label: def?.label ?? key,
                    // Which way is good is the thing a reader has to hold in
                    // their head to read this chart, and it differs per option —
                    // cost down is good, quality up is good. Saying it on the
                    // option means they never have to.
                    hint: def
                        ? `${def.higherIsBetter ? 'higher' : 'lower'} is better${def.log ? ' · log axis' : ''}`
                        : undefined,
                }
            }),
        [options]
    )

    return (
        <SelectMenu
            value={value}
            onChange={onChange}
            options={items}
            prefix={axis}
            ariaLabel={`${axis} axis metric`}
            // Half the row each on a phone, so the two triggers stay side by
            // side at any width instead of wrapping onto separate lines.
            className="w-[calc(50%-0.25rem)] shrink-0 sm:w-[11rem]"
        />
    )
}
