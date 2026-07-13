'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  Menu,
} from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownBlogView } from '@/components/markdown-blog-view'
import { SourcesPanel } from '@/components/sources-panel'
import { ShareToPagesMenu } from '@/components/share-to-pages-menu'
import { extractCitedNumbers } from '@/lib/markdown'
import type { Source } from '@/lib/types'

interface ScheduleReportViewProps {
  runId: string
  taskName: string
  title: string
  markdown: string
  sources?: Source[]
  publishedAt?: string
  isMobile?: boolean
  onToggleSidebar?: () => void
}

/**
 * Detail view for a private /schedule/{run_id} report. Mirrors
 * PagesDetailView's toolbar, but the Share menu reuses ShareToPagesMenu (the
 * same "copy this out to Pages" flow used from chat) instead of a
 * copy-link/manage panel — this report has no public link of its own to
 * manage; publishing IS the only way to get one, and it produces an
 * independent Pages record rather than exposing this page itself.
 */
export function ScheduleReportView({ runId, taskName, title, markdown, sources, publishedAt, isMobile, onToggleSidebar }: ScheduleReportViewProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'view' | 'code'>('view')
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const validSources = useMemo(() => (sources || []).filter((s) => s?.url), [sources])
  const citedNumbers = useMemo(() => extractCitedNumbers(markdown), [markdown])

  const normalizeFilename = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const fullText = `# ${title}\n\n${markdown}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText)
      setCopied(true)
      toast.success('Copied full text')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDownload = (format: 'markdown' | 'html') => {
    if (format === 'markdown') {
      try {
        const blob = new Blob([fullText], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${normalizeFilename(title)}.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Downloaded as Markdown')
      } catch (err) {
        console.error('Download error:', err)
        toast.error('Failed to download markdown')
      }
      return
    }

    setIsPdfLoading(true)
    try {
      const contentHtml = containerRef.current?.innerHTML || ''
      const htmlOutput = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1a1a18; padding: 2rem; max-width: 48rem; margin: 0 auto; }
  button, [role="menuitem"] { display: none !important; }
  h1 { font-size: 1.8rem; margin-bottom: 0.6rem; }
  h2 { font-size: 1.4rem; margin-top: 1.6rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
  img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.6rem 0; }
  pre { background: #f5f4ef; padding: 0.6rem; border-radius: 5px; overflow-x: auto; font-family: monospace; font-size: 0.85rem; }
  blockquote { border-left: 4px solid #20B2AA; padding-left: 0.6rem; font-style: italic; color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 0.6rem 0; }
  th, td { border: 1px solid #eee; padding: 0.5rem; text-align: left; }
  a { color: #20B2AA; text-decoration: none; }
</style>
</head>
<body>${contentHtml}</body>
</html>`
      const blob = new Blob([htmlOutput], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${normalizeFilename(title)}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Downloaded as HTML')
    } catch (err) {
      console.error('Download error:', err)
      toast.error('Failed to download HTML')
    } finally {
      setIsPdfLoading(false)
    }
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[var(--background)]">
      <div className="flex flex-col h-full min-w-0 flex-1 relative">
        {/* Toolbar */}
        <div className="flex items-center h-14 px-4 border-b border-[var(--border-subtle)] bg-[var(--background)] shrink-0 z-20 relative gap-3">
          {isMobile && (
            <button
              onClick={onToggleSidebar}
              className="p-2 -ml-2 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors shrink-0"
              title="Menu"
            >
              <Menu size={20} />
            </button>
          )}
          <button
            onClick={() => router.push('/settings/scheduled-research')}
            className="flex items-center gap-1.5 px-2 py-1.5 -ml-1.5 rounded-md text-[13px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors shrink-0 min-w-0"
          >
            <ArrowLeft size={14} className="shrink-0" />
            <span className="truncate">{taskName || 'Scheduled Research'}</span>
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 shrink-0">
            {validSources.length > 0 && (
              <button
                onClick={() => setSourcesOpen(true)}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-all"
              >
                <span className="hidden sm:inline">
                  {validSources.length} source{validSources.length > 1 ? 's' : ''}
                </span>
              </button>
            )}

            <div className="hidden sm:flex items-center p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/50">
              <button
                onClick={() => setViewMode('view')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium transition-all ${viewMode === 'view' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--border-subtle)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'}`}
              >
                <Eye size={13} strokeWidth={2} />
                View
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium transition-all ${viewMode === 'code' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--border-subtle)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent'}`}
              >
                <Code2 size={13} strokeWidth={2} />
                Code
              </button>
            </div>

            {/* Share */}
            <div className="relative">
              {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
              <button
                onClick={() => setShareOpen(!shareOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-[var(--background)] bg-[var(--foreground)] hover:opacity-90 transition-all relative z-50 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              >
                Share
                <ChevronDown size={13} strokeWidth={2} className="opacity-70" />
              </button>
              {shareOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => { handleCopy(); setShareOpen(false) }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" strokeWidth={2} /> : <Copy size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />}
                    {copied ? 'Copied!' : 'Copy full text'}
                  </button>
                  <div className="h-px bg-[var(--border-subtle)]/50 my-1 mx-2" />
                  <ShareToPagesMenu title={title} content={markdown} sources={sources} idSeed={`schedule:${runId}`} />
                  <div className="h-px bg-[var(--border-subtle)]/50 my-1 mx-2" />
                  <button
                    onClick={() => { setShareOpen(false); handleDownload('markdown') }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                  >
                    <Download size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                    Download Markdown
                  </button>
                  <button
                    onClick={() => { setShareOpen(false); handleDownload('html') }}
                    disabled={isPdfLoading}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left disabled:opacity-50"
                  >
                    <FileText size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                    Download HTML
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div ref={containerRef}>
            {viewMode === 'view' ? (
              <div className="px-4 py-8 sm:px-6 sm:py-10">
                <MarkdownBlogView
                  embedded
                  showMeta={false}
                  showReferences={false}
                  title={title}
                  markdown={markdown}
                  publishedAt={publishedAt}
                  sources={sources}
                />
              </div>
            ) : (
              <div className="max-w-3xl mx-auto px-6 py-8 md:px-8">
                <pre className="text-[14px] leading-relaxed text-[var(--foreground)] opacity-90 whitespace-pre-wrap font-mono pb-12">
                  {fullText}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      <SourcesPanel
        sources={validSources}
        citedNumbers={citedNumbers}
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
      />
    </div>
  )
}
