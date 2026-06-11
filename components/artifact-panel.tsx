'use client'

import { useState, useEffect } from 'react'
import { X, BarChart3, FileText, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { MarkdownMessage } from '@/components/markdown-message'
import type { ChartArtifact, ReportArtifact } from '@/lib/types'

const EChartsChart = dynamic(
  () => import('@/components/echarts-chart').then((m) => m.EChartsChart),
  { ssr: false }
)

interface PanelItem {
  id: string
  title: string
  kind: 'chart' | 'report'
  chart?: ChartArtifact
  report?: ReportArtifact
}

interface ArtifactPanelProps {
  artifacts: ChartArtifact[]
  reports: ReportArtifact[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  drafting?: boolean
}

export function ArtifactPanel({ artifacts, reports, activeId, onSelect, onClose, drafting }: ArtifactPanelProps) {
  const items: PanelItem[] = [
    ...reports.map((r) => ({ id: r.id, title: r.title, kind: 'report' as const, report: r })),
    ...artifacts.map((a) => ({ id: a.id, title: a.title, kind: 'chart' as const, chart: a })),
  ]
  const active = items.find((it) => it.id === activeId) ?? items[items.length - 1]
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
  }, [active?.id])

  // No artifact yet but the agent is writing one → show a writing placeholder.
  if (!active) {
    if (!drafting) return null
    return (
      <div className="flex flex-col h-full w-full bg-[var(--background)] border-l border-[var(--border)]">
        <div className="flex items-center justify-end h-14 px-3 border-b border-[var(--border)]">
          <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)]" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]">
          <FileText size={28} strokeWidth={1.5} className="animate-pulse text-[var(--accent)]" />
          <span className="omni-shimmer-text text-sm font-medium">Writing report…</span>
        </div>
      </div>
    )
  }

  const handleCopy = () => {
    const text = active.kind === 'report' ? active.report?.content ?? '' : JSON.stringify(active.chart?.spec ?? {}, null, 2)
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] border-l border-[var(--border)]">
      {/* Tabs header */}
      <div className="flex items-center gap-1 h-14 px-3 border-b border-[var(--border)] overflow-x-auto">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
              it.id === active.id
                ? 'bg-[var(--secondary)] text-foreground'
                : 'text-muted-foreground hover:bg-[var(--secondary)]/60'
            }`}
          >
            {it.kind === 'chart' ? <BarChart3 size={13} /> : <FileText size={13} />}
            <span className="max-w-[140px] truncate">{it.title}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={handleCopy} className="p-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)]" title="Copy">
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)]" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {active.kind === 'chart' && active.chart ? (
          <div className="h-full min-h-[360px]">
            <h2 className="text-sm font-semibold text-foreground mb-3">{active.chart.title}</h2>
            <EChartsChart option={active.chart.spec} />
          </div>
        ) : active.report ? (
          <article>
            <h1 className="text-xl font-semibold text-foreground mb-4">{active.report.title}</h1>
            <MarkdownMessage content={active.report.content} />
          </article>
        ) : null}
      </div>
    </div>
  )
}
