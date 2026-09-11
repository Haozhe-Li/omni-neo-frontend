'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { X, BarChart3, FileText, Copy, Check, Share, Download, ExternalLink, Code2, Eye, Link2, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useClerk } from '@clerk/nextjs'
import dynamic from 'next/dynamic'
import { MarkdownMessage } from '@/components/markdown-message'
import { ShareToPagesMenu } from '@/components/share-to-pages-menu'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import type { ChartArtifact, ReportArtifact } from '@/lib/types'

// Report ids follow `parseReports`' deterministic `m<messageIndex>[-b<n>]-
// report-<n>` scheme (see `lib/report-parser.ts`) — recovering the owning
// message's index from the id is how `TextSelectionMenu`'s "Check source"
// and the verify-claim click handler know which turn's sources to scope to,
// without this panel needing its own copy of the full message list.
function reportMessageIndex(reportId: string): number | null {
  const m = reportId.match(/^m(\d+)/)
  return m ? Number(m[1]) : null
}

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
  /** "Ask Omni" from the report body's text-selection menu — same handler
   * chat messages use, quotes the selection into the composer. */
  onFollowUp?: (text: string) => void
  /** "Check source" from the report body's text-selection menu. */
  onCheckSource?: (text: string, turn: number) => void
  /** Called with (reportId, claimId) when a verify-claim dashed underline
   * inside the active report is clicked. */
  onVerifiedClaimClick?: (reportId: string, id: string) => void
}

export function ArtifactPanel({ artifacts, reports, activeId, onSelect, onClose, drafting, onFollowUp, onCheckSource, onVerifiedClaimClick }: ArtifactPanelProps) {
  const items: PanelItem[] = [
    ...reports.map((r) => ({ id: r.id, title: r.title, kind: 'report' as const, report: r })),
    ...artifacts.map((a) => ({ id: a.id, title: a.title, kind: 'chart' as const, chart: a })),
  ]
  const active = items.find((it) => it.id === activeId) ?? items[items.length - 1]
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [quickSharing, setQuickSharing] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'view' | 'code'>('view')
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const containerRef = useRef<HTMLElement>(null)

  const activeReportId = active?.report?.id
  // Stable per-report-id callback, not a fresh closure at the render site —
  // this panel re-renders on every keystroke in the composer (it's a child
  // of the same ChatView that owns the input box), and MarkdownMessage folds
  // this callback into the component it hands ReactMarkdown for verify-claim
  // marks; a new reference on every render would remount every mark on every
  // keystroke, resetting its reveal animation (the same bug fixed for the
  // main chat view's citations — see chat-view.tsx's verifiedClaimClickHandlers).
  const handleVerifiedClaimClick = useMemo(
    () => (activeReportId && onVerifiedClaimClick ? (id: string) => onVerifiedClaimClick(activeReportId, id) : undefined),
    [activeReportId, onVerifiedClaimClick]
  )

  const handleDownload = async (format: 'markdown' | 'pdf' | 'html') => {
    if (active.kind !== 'report' || !active.report) return
    const title = active.report.title || 'report'
    const content = `# ${title}\n\n${active.report.content || ''}`
    const normalizeFilename = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase()

    if (format === 'markdown') {
      try {
        const echartsRegex = /```echarts\s+([\s\S]*?)```/g
        if (echartsRegex.test(content)) {
          toast.loading('Preparing ZIP with images...', { id: 'download-zip' })
          const [JSZip, echarts] = await Promise.all([
            import('jszip').then(m => m.default),
            import('echarts')
          ])

          const zip = new JSZip()
          echartsRegex.lastIndex = 0
          
          let modifiedContent = content
          const matches = [...content.matchAll(echartsRegex)]
          let chartIndex = 1

          for (const m of matches) {
            const specStr = m[1]
            try {
              const spec = JSON.parse(specStr)
              const div = document.createElement('div')
              div.style.width = '800px'
              div.style.height = '600px'
              div.style.position = 'absolute'
              div.style.left = '-9999px'
              document.body.appendChild(div)

              const chart = echarts.init(div)
              if (spec.animation !== undefined) {
                spec.animation = false
              } else {
                spec.animation = false
              }
              chart.setOption(spec)

              const dataUrl = chart.getDataURL({ type: 'png', backgroundColor: '#fff' })
              const base64Data = dataUrl.split(',')[1]
              const imageName = `chart-${chartIndex}.png`
              zip.file(imageName, base64Data, { base64: true })

              modifiedContent = modifiedContent.replace(m[0], `![Chart ${chartIndex}](./${imageName})`)

              chart.dispose()
              document.body.removeChild(div)
              chartIndex++
            } catch (err) {
              console.error('Failed to parse or render chart', err)
            }
          }

          zip.file(`${normalizeFilename(title)}.md`, modifiedContent)

          const blob = await zip.generateAsync({ type: 'blob' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${normalizeFilename(title)}.zip`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          
          toast.dismiss('download-zip')
          toast.success('Downloaded as ZIP')
        } else {
          const blob = new Blob([content], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${normalizeFilename(title)}.md`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          toast.success('Downloaded as Markdown')
        }
      } catch (err) {
        console.error('Download error:', err)
        toast.dismiss('download-zip')
        toast.error('Failed to download markdown')
      }
    } else if (format === 'pdf' || format === 'html') {
      setIsPdfLoading(true)
      try {
        const containerClone = containerRef.current?.cloneNode(true) as HTMLElement
        if (!containerClone) throw new Error('No content')

        const originalCanvases = containerRef.current?.querySelectorAll('canvas') || []
        const clonedCanvases = containerClone.querySelectorAll('canvas')

        originalCanvases.forEach((canvas, index) => {
          try {
            const dataUrl = canvas.toDataURL('image/png')
            const img = document.createElement('img')
            img.src = dataUrl
            img.style.width = canvas.style.width || `${canvas.width}px`
            img.style.height = canvas.style.height || `${canvas.height}px`
            img.style.maxWidth = '100%'
            const clonedCanvas = clonedCanvases[index]
            clonedCanvas?.parentNode?.replaceChild(img, clonedCanvas)
          } catch (e) {
            console.error('Error extracting canvas data', e)
          }
        })

        const contentHtml = containerClone.innerHTML

        if (format === 'html') {
          const htmlOutput = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'media',
      theme: {
        extend: {
          colors: {
            background: 'var(--background)',
            foreground: 'var(--foreground)',
            card: 'var(--card)',
            secondary: 'var(--secondary)',
            border: 'var(--border)',
            accent: 'var(--accent)',
          }
        }
      }
    }
  </script>
  <style type="text/tailwindcss">
    @layer base {
      :root {
        --background: #FAF6EF;
        --foreground: #2B2724;
        --card: #FFFDF9;
        --secondary: #F1EADC;
        --border: #E8DFD2;
        --border-subtle: #E8DFD2;
        --accent: #26696B;
        --muted: #F1EADC;
        --muted-foreground: #6C6357;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --background: #191614;
          --foreground: #F2EBE0;
          --card: #201C19;
          --secondary: #262119;
          --border: #332D26;
          --border-subtle: #332D26;
          --accent: #6FB4AF;
          --muted: #262119;
          --muted-foreground: #9E9382;
        }
      }
      body {
        background-color: theme('colors.background');
        color: theme('colors.foreground');
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        padding: 2rem;
        line-height: 1.6;
      }
      .report-content {
        max-width: 48rem;
        margin: 0 auto;
      }
      .sticky, button, [role="menuitem"], .DropdownMenuContent, [title="Close Report"] { display: none !important; }
      h1, h2, h3 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; letter-spacing: -0.01em; }
      h1 { @apply text-4xl mb-4 mt-8; }
      h2 { @apply text-3xl mt-9 mb-4; }
      h3 { @apply text-2xl mt-6 mb-3; }
      p { @apply mb-4 leading-relaxed; }
      ul { @apply list-disc pl-6 mb-4; }
      ol { @apply list-decimal pl-6 mb-4; }
      li { @apply mb-1; }
      blockquote { @apply border-l-4 border-accent pl-4 italic text-[var(--muted-foreground)] my-4; }
      pre { @apply bg-secondary p-4 rounded-lg overflow-x-auto mb-4; }
      code { @apply font-mono text-sm; }
      table { @apply w-full mb-4 border-collapse; }
      th, td { @apply border border-border p-2 text-left; }
      th { @apply bg-secondary; }
      img { @apply rounded-lg my-4 max-w-full h-auto; }
      a { @apply text-accent hover:underline; }
    }
  </style>
</head>
<body>
  <div class="report-content">
    ${contentHtml}
  </div>
</body>
</html>
`.trim()

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
        } else {
          const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        document.body.appendChild(iframe)

        const doc = iframe.contentWindow?.document
        if (!doc) throw new Error('Could not create print document')

        doc.write(`
          <html lang="zh-CN">
            <head>
              <title>${title}</title>
              <style>
                /* Print is always the light palette — dark ink on dark paper is
                   not a thing, and a reader's printer would fight it. */
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.7; color: #3A342E; padding: 20mm; }
                .sticky, button, [role="menuitem"], .DropdownMenuContent, [title="Close Report"] { display: none !important; }
                h1, h2, h3 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; color: #2B2724; }
                h1 { font-size: 26pt; margin-bottom: 10pt; }
                h2 { font-size: 19pt; margin-top: 20pt; }
                h3 { font-size: 15pt; margin-top: 14pt; }
                img { max-width: 100%; height: auto; border-radius: 8px; margin: 10pt 0; }
                pre { background: #F1EADC; padding: 10pt; border-radius: 6pt; overflow-x: auto; font-family: monospace; font-size: 10pt; color: #3A342E; }
                blockquote { border-left: 2px solid #C0673C; padding-left: 10pt; font-style: italic; color: #6C6357; }
                table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
                th, td { border: 1px solid #E8DFD2; padding: 8pt; text-align: left; }
                th { background: #F6F1E8; font-weight: 500; }
                a { color: #26696B; text-decoration: none; }
                @page { size: A4; margin: 0; }
                @media print { body { padding: 15mm; } .page-break { page-break-before: always; } }
              </style>
            </head>
            <body>
              <div class="report-content">${contentHtml}</div>
              <script>
                window.onload = () => {
                  window.print();
                  setTimeout(() => { window.frameElement.remove(); }, 100);
                }
              </script>
            </body>
          </html>
        `)
        doc.close()
        toast.success('Print dialog opened. Choose "Save as PDF".')
      }
    } catch (e) {
      console.error('Export error:', e)
      toast.error(format === 'pdf' ? 'Failed to open print dialog' : 'Failed to download HTML')
      } finally {
        setIsPdfLoading(false)
      }
    }
  }

  useEffect(() => {
    setCopied(false)
    setLinkCopied(false)
    setShareOpen(false)
    setExportOpen(false)
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

  // "Copy share link" — a quick, unlisted publish: the same `/api/publish`
  // call `ShareToPagesMenu` makes for its own "Publish & Copy Link" button,
  // just with `publishToPages: false` and no duration prompt, so tapping one
  // row gets a working link without walking through the fuller publish flow
  // (that flow is still there, right below, for anyone who wants the listing
  // toggle or an expiry).
  const handleQuickShare = async () => {
    if (active.kind !== 'report' || !active.report || quickSharing) return
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setQuickSharing(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: active.report.title || 'report',
          answer: active.report.content || '',
          duration: 'permanent',
          publishToPages: false,
          sources: active.report.sources,
        }),
      })
      if (!res.ok) throw new Error('publish failed')
      const { id } = await res.json()
      await navigator.clipboard.writeText(`${window.location.origin}/pages/${id}`)
      setLinkCopied(true)
      toast.success('Link copied')
      setTimeout(() => setLinkCopied(false), 1500)
    } catch (e) {
      console.error('Quick share failed', e)
      toast.error('Failed to create share link')
    } finally {
      setQuickSharing(false)
    }
  }

  return (
    /* ── The report reader ────────────────────────────────────────────────
        Raised paper, not the page ground: a report is a document handed to
        you, and lifting its surface above the thread it came from is what
        makes the slide-over read as "opened" rather than "another column". */
    <div className="relative flex h-full w-full flex-col border-l border-[var(--line-strong)] bg-[var(--paper-raised)] shadow-[-30px_0_60px_-40px_color-mix(in_srgb,var(--ink)_45%,transparent)]">
      {/* Header */}
      <div className="relative z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line-hair)] px-5">
        {/* Title — takes all remaining space, truncates */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {active.kind === 'chart' ? (
            <BarChart3 size={15} strokeWidth={1.4} className="shrink-0 text-[var(--teal)]" />
          ) : (
            <FileText size={15} strokeWidth={1.4} className="shrink-0 text-[var(--teal)]" />
          )}
          <span className="truncate text-[14px] text-[var(--ink)]">
            {active.title}
          </span>
        </div>
        
        {/* Controls — fixed width, never wrap */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View / Code Toggle */}
          <div className="hidden items-center rounded-full border border-[var(--line-strong)] p-0.5 sm:flex">
            <button 
              disabled={drafting}
              onClick={() => setViewMode('view')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${viewMode === 'view' ? 'bg-[var(--teal-tint)] text-[var(--teal)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}
            >
              <Eye size={13} strokeWidth={2} />
              View
            </button>
            <button 
              disabled={drafting}
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${viewMode === 'code' ? 'bg-[var(--teal-tint)] text-[var(--teal)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}
            >
              <Code2 size={13} strokeWidth={2} />
              Code
            </button>
          </div>

          {/* Share — outline pill, own dropdown: a share link (quick,
              unlisted) and the fuller publish-to-Pages flow below it. */}
          <div className="relative">
            {shareOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />
            )}
            <button
              disabled={drafting}
              onClick={() => { setShareOpen(!shareOpen); setExportOpen(false) }}
              className="omni-pill relative z-50 gap-1.5 px-3.5 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Share size={12} strokeWidth={2} />
              Share
            </button>
            {shareOpen && active.kind === 'report' && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[272px] overflow-hidden rounded-[18px] border border-[var(--line-strong)] bg-[var(--paper-raised)] p-1.5 shadow-[0_22px_50px_-30px_color-mix(in_srgb,var(--ink)_60%,transparent)] origin-top-right animate-in fade-in zoom-in-95">
                <button
                  onClick={handleQuickShare}
                  disabled={quickSharing}
                  className="flex w-full items-start gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sand)] disabled:opacity-50"
                >
                  {linkCopied ? (
                    <Check size={15} className="mt-0.5 shrink-0 text-[var(--teal)]" strokeWidth={2} />
                  ) : (
                    <Link2 size={15} className="mt-0.5 shrink-0 text-[var(--teal)]" strokeWidth={2} />
                  )}
                  <span>
                    <span className="block text-[13.5px] text-[var(--ink)]">
                      {linkCopied ? 'Link copied' : 'Copy share link'}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[var(--ink-faint)]">
                      Anyone with the link can read it
                    </span>
                  </span>
                </button>
                <div className="my-1 h-px bg-[var(--border-subtle)]/50" />
                <ShareToPagesMenu title={active.report?.title || 'report'} content={active.report?.content || ''} sources={active.report?.sources} />
              </div>
            )}
          </div>

          {/* Export — its own outline pill: copy-as-text plus every
              download format, each row naming its file extension the way
              the design does. */}
          <div className="relative">
            {exportOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
            )}
            <button
              disabled={drafting}
              onClick={() => { setExportOpen(!exportOpen); setShareOpen(false) }}
              className="omni-pill relative z-50 gap-1.5 px-3.5 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={12} strokeWidth={2} />
              Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-[18px] border border-[var(--line-strong)] bg-[var(--paper-raised)] p-1.5 shadow-[0_22px_50px_-30px_color-mix(in_srgb,var(--ink)_60%,transparent)] origin-top-right animate-in fade-in zoom-in-95">
                <button
                  onClick={() => { handleCopy(); setExportOpen(false) }}
                  className="flex w-full items-center justify-between gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sand)]"
                >
                  <span className="flex items-center gap-3 text-[13.5px] text-[var(--ink)]">
                    {copied ? <Check size={14} className="text-[var(--teal)]" strokeWidth={2} /> : <Copy size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />}
                    {copied ? 'Copied!' : active.kind === 'report' ? 'Copy as Markdown' : 'Copy chart data'}
                  </span>
                  {active.kind === 'report' && <span className="omni-mono text-[10.5px] text-[var(--ink-faint)]">MD</span>}
                </button>
                {active.kind === 'report' && (
                  <>
                    <button
                      onClick={() => { setExportOpen(false); handleDownload('markdown') }}
                      className="flex w-full items-center justify-between gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sand)]"
                    >
                      <span className="flex items-center gap-3 text-[13.5px] text-[var(--ink)]">
                        <Download size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />
                        Download Markdown
                      </span>
                      <span className="omni-mono text-[10.5px] text-[var(--ink-faint)]">MD</span>
                    </button>
                    <button
                      onClick={() => { setExportOpen(false); handleDownload('html') }}
                      disabled={isPdfLoading}
                      className="flex w-full items-center justify-between gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sand)] disabled:opacity-50"
                    >
                      <span className="flex items-center gap-3 text-[13.5px] text-[var(--ink)]">
                        <Code2 size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />
                        Download HTML
                      </span>
                      <span className="omni-mono text-[10.5px] text-[var(--ink-faint)]">HTML</span>
                    </button>
                    <button
                      onClick={() => { setExportOpen(false); handleDownload('pdf') }}
                      disabled={isPdfLoading}
                      className="flex w-full items-center justify-between gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sand)] disabled:opacity-50"
                    >
                      <span className="flex items-center gap-3 text-[13.5px] text-[var(--ink)]">
                        <FileText size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />
                        Download PDF
                      </span>
                      <span className="omni-mono text-[10.5px] text-[var(--ink-faint)]">PDF</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--ink-muted)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
            title="Close panel"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Optional sub-header for multiple items (tabs) */}
      {items.length > 1 && (
        <div className="custom-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--line-hair)] px-5 py-2.5">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onSelect(it.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                it.id === active.id
                  ? 'border-[var(--teal-line)] bg-[var(--teal-tint)] text-[var(--teal)]'
                  : 'border-transparent text-[var(--ink-muted)] hover:bg-[var(--sand)] hover:text-[var(--ink)]'
              }`}
            >
              {it.kind === 'chart' ? <BarChart3 size={12} strokeWidth={1.5} /> : <FileText size={12} strokeWidth={1.5} />}
              <span className="max-w-[140px] truncate">{it.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 pb-16 pt-9 md:px-11">
        {active.kind === 'chart' && active.chart ? (
          <div className="h-full min-h-[360px] max-w-4xl mx-auto">
            <h2 className="omni-display mb-6 text-[22px] leading-[1.25] text-[var(--ink)]">{active.chart.title}</h2>
            <EChartsChart option={active.chart.spec} />
          </div>
        ) : active.report ? (
          <article
            ref={containerRef}
            className="mx-auto max-w-[68ch]"
            data-message-index={viewMode === 'view' ? reportMessageIndex(active.report.id) ?? undefined : undefined}
          >
            {viewMode === 'view' ? (
              <>
                <h1 className="omni-display mb-7 text-[38px] leading-[1.1] text-[var(--ink)]">{active.report.title}</h1>
                {active.report.content ? (
                  <MarkdownMessage
                    content={active.report.content}
                    sources={active.report.sources}
                    verifiedClaims={active.report.verifiedClaims}
                    onVerifiedClaimClick={handleVerifiedClaimClick}
                    // Only once the report body stops streaming — candidate
                    // offsets against a still-growing content string would be
                    // stale by the time the background check confirms them.
                    wrapClaimCandidates={active.report.complete !== false && !!handleVerifiedClaimClick}
                  />
                ) : null}

              </>
            ) : (
              <div className="w-full">
                <pre className="whitespace-pre-wrap pb-12 font-mono text-[13px] leading-[1.7] text-[var(--ink-body)]">
                  {`# ${active.report.title}\n\n${active.report.content || ''}`}
                </pre>
              </div>
            )}
          </article>
        ) : null}
      </div>
      {active.kind === 'report' && viewMode === 'view' && (
        <TextSelectionMenu containerRef={containerRef} onFollowUp={onFollowUp} onCheckSource={onCheckSource} />
      )}
    </div>
  )
}
