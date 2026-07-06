'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const containerRef = useRef<HTMLElement>(null)

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
        --background: #f3f3ee;
        --foreground: #1a1a1a;
        --card: #ffffff;
        --secondary: #eaeae5;
        --border: rgba(0,0,0,0.08);
        --border-subtle: rgba(0,0,0,0.05);
        --accent: #20B2AA;
        --muted: #eaeae5;
        --muted-foreground: #6b6b6b;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --background: #191A1A;
          --foreground: #ffffff;
          --card: #222323;
          --secondary: #2a2b2b;
          --border: rgba(255,255,255,0.08);
          --border-subtle: rgba(255,255,255,0.05);
          --muted: #2a2b2b;
          --muted-foreground: #8b8b8b;
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
      h1 { @apply text-3xl font-bold mb-4 mt-8; }
      h2 { @apply text-2xl font-semibold mt-8 mb-4 border-b border-[var(--border-subtle)] pb-2; }
      h3 { @apply text-xl font-semibold mt-6 mb-3; }
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
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1a1a18; padding: 20mm; }
                .sticky, button, [role="menuitem"], .DropdownMenuContent, [title="Close Report"] { display: none !important; }
                h1 { font-size: 24pt; margin-bottom: 10pt; color: #1a1a18; }
                h2 { font-size: 18pt; margin-top: 20pt; border-bottom: 1px solid #eee; padding-bottom: 5pt; }
                img { max-width: 100%; height: auto; border-radius: 8px; margin: 10pt 0; }
                pre { background: #f5f4ef; padding: 10pt; border-radius: 5pt; overflow-x: auto; font-family: monospace; font-size: 10pt; }
                blockquote { border-left: 4px solid #20B2AA; padding-left: 10pt; font-style: italic; color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
                th, td { border: 1px solid #eee; padding: 8pt; text-align: left; }
                a { color: #20B2AA; text-decoration: none; }
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
                    handleDownload('markdown')
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                >
                  <Download size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                  Download Markdown
                </button>
                <button 
                  onClick={() => { 
                    setShareOpen(false)
                    handleDownload('html')
                  }}
                  disabled={isPdfLoading}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left disabled:opacity-50"
                >
                  <Code2 size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                  Download HTML
                </button>
                <button 
                  onClick={() => { 
                    setShareOpen(false)
                    handleDownload('pdf')
                  }}
                  disabled={isPdfLoading}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left disabled:opacity-50"
                >
                  <FileText size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                  Download PDF
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
          <article ref={containerRef} className="max-w-3xl mx-auto">
            {viewMode === 'view' ? (
              <>
                <h1 className="text-[28px] leading-tight font-semibold text-[var(--foreground)] mb-8 tracking-tight opacity-90">{active.report.title}</h1>
                {active.report.content ? <MarkdownMessage content={active.report.content} /> : null}

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
