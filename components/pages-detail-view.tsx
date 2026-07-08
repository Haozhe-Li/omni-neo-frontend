'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  Link as LinkIcon,
  Share,
} from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownBlogView } from '@/components/markdown-blog-view'
import type { Source } from '@/lib/types'

interface PagesDetailViewProps {
  id: string
  title: string
  markdown: string
  author?: string
  publishedAt?: string
  tags?: string[]
  sources?: Source[]
}

/**
 * Toolbar + view/code switch + share/download menu around the published-page
 * markdown, matching the report artifact panel's share UI 1:1 so opening a
 * page from a direct link feels like the same product as the in-chat report.
 */
export function PagesDetailView({ id, title, markdown, author, publishedAt, tags, sources }: PagesDetailViewProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'view' | 'code'>('view')
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setShareOpen(false)
  }, [id])

  const normalizeFilename = (s: string) => s.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const fullText = `# ${title}\n\n${markdown}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      toast.success('Copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleCopyLink = async () => {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : `/pages/${id}`
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      toast.success('Link copied')
      setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleDownload = async (format: 'markdown' | 'pdf' | 'html') => {
    if (format === 'markdown') {
      try {
        const echartsRegex = /```echarts\s+([\s\S]*?)```/g
        if (echartsRegex.test(fullText)) {
          toast.loading('Preparing ZIP with images...', { id: 'download-zip' })
          const [JSZip, echarts] = await Promise.all([
            import('jszip').then((m) => m.default),
            import('echarts'),
          ])

          const zip = new JSZip()
          echartsRegex.lastIndex = 0

          let modifiedContent = fullText
          const matches = [...fullText.matchAll(echartsRegex)]
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
              spec.animation = false
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
      button, [role="menuitem"] { display: none !important; }
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
            <html lang="en">
              <head>
                <title>${title}</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1a1a18; padding: 20mm; }
                  button, [role="menuitem"] { display: none !important; }
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

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)] relative">
      {/* Toolbar */}
      <div className="flex items-center h-14 px-4 border-b border-[var(--border-subtle)] bg-[var(--background)] shrink-0 z-20 relative gap-3">
        <button
          onClick={() => router.push('/pages')}
          className="flex items-center gap-1.5 px-2 py-1.5 -ml-1.5 rounded-md text-[13px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors shrink-0"
        >
          <ArrowLeft size={14} />
          Pages
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText size={16} strokeWidth={1.5} className="text-[var(--foreground)] opacity-60 shrink-0" />
          <span className="text-[14px] font-medium text-[var(--foreground)] truncate opacity-90">{title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* View / Code Toggle */}
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
              <Share size={12} strokeWidth={2} />
              Share
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
                <button
                  onClick={() => { handleCopyLink(); setShareOpen(false) }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                >
                  {linkCopied ? <Check size={14} className="text-emerald-500" strokeWidth={2} /> : <LinkIcon size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />}
                  {linkCopied ? 'Link copied!' : 'Copy link'}
                </button>
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
                  <Code2 size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                  Download HTML
                </button>
                <button
                  onClick={() => { setShareOpen(false); handleDownload('pdf') }}
                  disabled={isPdfLoading}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left disabled:opacity-50"
                >
                  <FileText size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                  Download PDF
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
                sectionLabel="Pages"
                title={title}
                markdown={markdown}
                author={author}
                publishedAt={publishedAt}
                tags={tags}
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
  )
}
