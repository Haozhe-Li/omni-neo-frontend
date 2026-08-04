'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'

interface EChartsChartProps {
  option: Record<string, any>
  className?: string
  style?: React.CSSProperties
  /** ECharts event name -> handler, e.g. `{ click: p => … }`. */
  onEvent?: Record<string, (params: any) => void>
}

/**
 * Chart colours that follow the app theme.
 *
 * ECharts draws to a canvas, so a CSS custom property in an option object is
 * just an unparseable string — every colour has to be a literal. These are the
 * concrete values behind `--muted-foreground` / `--accent` in each theme, kept
 * here so a chart can stay theme-aware without every caller re-deriving them.
 */
export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return {
    dark,
    axis: dark ? '#8b8b8b' : '#6b6b6b',
    grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    accent: '#20B2AA',
    surface: dark ? '#222323' : '#ffffff',
  }
}

/**
 * Renders an Apache ECharts `option` object. ECharts is imported dynamically so
 * it never runs on the server and is only pulled into the bundle when a chart
 * is actually shown.
 */
export function EChartsChart({ option, className = '', style, onEvent }: EChartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const { resolvedTheme } = useTheme()

  // Same reasoning as optionRef below: handlers are bound once at init, so
  // reading them from the effect's closure would freeze whatever was passed on
  // the render that happened to win the race with the dynamic import.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  // The init effect below is async (it dynamically imports echarts) and re-runs
  // whenever the theme resolves or changes, which disposes and rebuilds the
  // chart. Reading `option` from its own closure would then replay whatever
  // option existed when that effect started — so a chart whose data changed
  // while the import was in flight, or which was rebuilt by a theme flip, would
  // silently render stale axes and stale series. A ref always holds the
  // current one.
  const optionRef = useRef(option)
  optionRef.current = option

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    import('echarts').then((echarts) => {
      if (disposed || !containerRef.current) return
      chartRef.current = echarts.init(
        containerRef.current,
        resolvedTheme === 'dark' ? 'dark' : undefined,
        { renderer: 'canvas' }
      )
      try {
        chartRef.current.setOption(optionRef.current, true)
      } catch (e) {
        console.error('Failed to render chart option', e)
      }
      for (const name of Object.keys(onEventRef.current ?? {})) {
        chartRef.current.on(name, (params: any) => onEventRef.current?.[name]?.(params))
      }
      resizeObserver = new ResizeObserver(() => chartRef.current?.resize())
      resizeObserver.observe(containerRef.current)
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      chartRef.current?.dispose?.()
      chartRef.current = null
    }
    // Re-init on theme change so the chart picks up the right palette.
  }, [resolvedTheme])

  // Update option in-place on data change without a full re-init.
  useEffect(() => {
    if (!chartRef.current) return
    try {
      chartRef.current.setOption(option, true)
    } catch (e) {
      console.error('Failed to update chart option', e)
    }
  }, [option])

  // An explicit `style` height opts out of the default min-height, so a caller
  // can render a short chart on a phone without fighting a 320px floor.
  return (
    <div
      ref={containerRef}
      className={`w-full ${style?.height ? '' : 'h-full min-h-[320px]'} ${className}`}
      style={style}
    />
  )
}
