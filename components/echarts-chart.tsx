'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'

interface EChartsChartProps {
  option: Record<string, any>
  className?: string
}

/**
 * Renders an Apache ECharts `option` object. ECharts is imported dynamically so
 * it never runs on the server and is only pulled into the bundle when a chart
 * is actually shown.
 */
export function EChartsChart({ option, className = '' }: EChartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const { resolvedTheme } = useTheme()

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
        chartRef.current.setOption(option, true)
      } catch (e) {
        console.error('Failed to render chart option', e)
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

  return <div ref={containerRef} className={`w-full h-full min-h-[320px] ${className}`} />
}
