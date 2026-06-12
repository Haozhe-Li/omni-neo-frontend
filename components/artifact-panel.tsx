'use client'

import { useState, useEffect } from 'react'
import { X, BarChart3, FileText, Copy, Check, Share, Download, ExternalLink, Code2, Eye } from 'lucide-react'
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
  const [shareOpen, setShareOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'view' | 'code'>('view')

  useEffect(() => {
    setCopied(false)
    setShareOpen(false)
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
    <div className="flex flex-col h-full w-full bg-[var(--background)] border-l border-[var(--border)] relative">
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-[var(--border-subtle)] bg-[var(--background)] shrink-0 z-20 relative gap-3">
        {/* Title — takes all remaining space, truncates */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {active.kind === 'chart' ? (
            <BarChart3 size={16} strokeWidth={1.5} className="text-[var(--foreground)] opacity-60 shrink-0" />
          ) : (
            <FileText size={16} strokeWidth={1.5} className="text-[var(--foreground)] opacity-60 shrink-0" />
          )}
          <span className="text-[14px] font-medium text-[var(--foreground)] truncate opacity-90">
            {active.title}
          </span>
        </div>
        
        {/* Controls — fixed width, never wrap */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View / Code Toggle */}
          <div className="hidden sm:flex items-center p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/50">
            <button 
              disabled={drafting}
              onClick={() => setViewMode('view')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${viewMode === 'view' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--border-subtle)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'}`}
            >
              <Eye size={13} strokeWidth={2} />
              View
            </button>
            <button 
              disabled={drafting}
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${viewMode === 'code' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--border-subtle)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'}`}
            >
              <Code2 size={13} strokeWidth={2} />
              Code
            </button>
          </div>

          {/* Share */}
          <div className="relative">
            {/* Share backdrop */}
            {shareOpen && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShareOpen(false)}
              />
            )}
            <button 
              disabled={drafting}
              onClick={() => setShareOpen(!shareOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-[var(--background)] bg-[var(--foreground)] hover:opacity-90 transition-all relative z-50 shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Share size={12} strokeWidth={2} />
              Share
            </button>
            {/* Share dropdown */}
            {shareOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in-95">
                <button 
                  onClick={() => { handleCopy(); setShareOpen(false); }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                >
                  {copied ? <Check size={14} className="text-emerald-500" strokeWidth={2} /> : <Copy size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />}
                  {copied ? 'Copied!' : 'Copy full text'}
                </button>
                <div className="h-px bg-[var(--border-subtle)]/50 my-1 mx-2" />
                <button 
                  onClick={() => { 
                    setShareOpen(false)
                    if (active.kind === 'report') {
                      const blob = new Blob([`# ${active.report?.title}\n\n${active.report?.content}`], { type: 'text/markdown' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${active.report?.title || 'report'}.md`
                      a.click()
                      URL.revokeObjectURL(url)
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                >
                  <Download size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                  Download Markdown
                </button>
              </div>
            )}
          </div>

          {/* Close */}
          <button onClick={onClose} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors" title="Close panel">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Optional sub-header for multiple items (tabs) */}
      {items.length > 1 && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--secondary)]/20 overflow-x-auto shrink-0 custom-scrollbar">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onSelect(it.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all ${
                it.id === active.id
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-[var(--border-subtle)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60 border border-transparent hover:text-[var(--foreground)]'
              }`}
            >
              {it.kind === 'chart' ? <BarChart3 size={12} strokeWidth={1.5} /> : <FileText size={12} strokeWidth={1.5} />}
              <span className="max-w-[140px] truncate">{it.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
        {active.kind === 'chart' && active.chart ? (
          <div className="h-full min-h-[360px] max-w-4xl mx-auto">
            <h2 className="text-[18px] font-semibold text-[var(--foreground)] mb-6 opacity-90">{active.chart.title}</h2>
            <EChartsChart option={active.chart.spec} />
          </div>
        ) : active.report ? (
          <article className="max-w-3xl mx-auto">
            {viewMode === 'view' ? (
              <>
                <h1 className="text-[28px] leading-tight font-semibold text-[var(--foreground)] mb-8 tracking-tight opacity-90">{active.report.title}</h1>
                {active.report.content ? <MarkdownMessage content={active.report.content} /> : null}
                {active.report.complete === false ? (
                  <span className="omni-shimmer-text text-[15px] font-medium mt-4 block">Writing…</span>
                ) : null}
              </>
            ) : (
              <div className="w-full">
                <pre className="text-[14px] leading-relaxed text-[var(--foreground)] opacity-90 whitespace-pre-wrap font-mono pb-12">
                  {`# ${active.report.title}\n\n${active.report.content || ''}`}
                </pre>
              </div>
            )}
          </article>
        ) : null}
      </div>
    </div>
  )
}
