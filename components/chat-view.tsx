'use client'

import React, { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { Menu, ArrowUp, ArrowRight, Mic, Square, Paperclip, Plus, BarChart3, FileText, Copy, Maximize2, ChevronDown, Check, Lock, X, Pencil, Download, Code2, Loader2, Telescope, Plane, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useApi } from '@/hooks/useApi'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileUploadArea } from '@/components/file-upload-area'
import { WidgetCards } from '@/components/widget-cards'
import { ArtifactPanel } from '@/components/artifact-panel'
import { SourcesPanel } from '@/components/sources-panel'
import { ToolActivity } from '@/components/tool-activity'
import { AnswerFooter } from '@/components/answer-footer'
import { MarkdownMessage } from '@/components/markdown-message'
import { StreamingText } from '@/components/streaming-text'
import { getAiRequestErrorMessage, getLocalISOString } from '@/lib/utils'
import { getUserLocation } from '@/lib/location'
import { getMemories, appendQueryToMemoryQueue } from '@/lib/memories'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { parseReports, type ParsedReport, type ParsedSegment } from '@/lib/report-parser'
import { parseQuestion } from '@/lib/question-parser'
import { QuestionBlock, QuestionSkeleton } from '@/components/question-block'
import type { AgentMode, ChatMessage, ChartArtifact, MessageBlock, ReportArtifact, Source, ToolStep, WidgetData } from '@/lib/types'

interface ChatViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
  initialMode?: AgentMode
  initialAttachedFileMeta?: { id: string; name: string; type: string }[]
  initialSkill?: SkillId | null
  sidebarOpen?: boolean
  setSidebarOpen?: (v: boolean) => void
  // Already-fetched history for an existing thread (e.g. resumed via a /thread/{id}
  // link). When present, ChatView renders straight from it instead of firing its
  // own initial-load fetch, so there's no loading-placeholder flash.
  preloadedThread?: { messages: ChatMessage[]; is_generating?: boolean } | null
}

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// Temporarily disabled: the LLM-generated title made a follow-up round trip
// (and a title flip mid-conversation) that wasn't worth it. Threads are
// titled with the raw first query instead until this is revisited.
const ENABLE_LLM_TITLE_GENERATION = false

type SkillId = 'deep-research' | 'trip-advisor' | 'guided-learning'
const SKILLS: { id: SkillId; label: string; desc: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'deep-research',   label: 'Deep Research',   desc: 'Get a detailed report',        Icon: Telescope },
  { id: 'trip-advisor',    label: 'Trip Advisor',     desc: 'Plan your next trip',          Icon: Plane },
  { id: 'guided-learning', label: 'Guided Learning',  desc: 'Learn something step by step', Icon: GraduationCap },
]

// Gap left above a query when it's pinned to the top of the viewport (matches the
// `scroll-mt-20` on each message: 20 × 0.25rem = 80px).
const PIN_TOP_GAP = 80

// useLayoutEffect on the server warns; fall back to useEffect there.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function isUntitled(t?: string) {
  const n = (t || '').trim().toLowerCase()
  return !n || n === 'untitled' || n === 'untitled chat'
}

const TAB_TITLE_CHAR_LIMIT = 20

function toTabTitle(chatTitle: string) {
  const trimmed = chatTitle.trim()
  if (!trimmed) return 'Omni Knows'
  const truncated =
    trimmed.length > TAB_TITLE_CHAR_LIMIT ? `${trimmed.slice(0, TAB_TITLE_CHAR_LIMIT)}…` : trimmed
  return `${truncated} | Omni Knows`
}

const handleInlineDownload = async (r: ReportArtifact, format: 'markdown' | 'pdf' | 'html') => {
  const title = r.title || 'report'
  const content = `# ${title}\n\n${r.content || ''}`
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
  } else if (format === 'html' || format === 'pdf') {
    const toastId = toast.loading(format === 'pdf' ? 'Preparing PDF...' : 'Preparing HTML...')
    try {
      const containerNode = document.getElementById(`inline-report-${r.id}`)
      if (!containerNode) throw new Error('No content')
      const containerClone = containerNode.cloneNode(true) as HTMLElement
      // Remove cropping classes so the PDF prints the full report
      containerClone.classList.remove('max-h-[360px]', 'overflow-hidden')

      const originalCanvases = containerNode.querySelectorAll('canvas') || []
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
        toast.dismiss(toastId)
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
        toast.dismiss(toastId)
        toast.success('Print dialog opened. Choose "Save as PDF".')
      }
    } catch (e) {
      console.error('Export error:', e)
      toast.dismiss(toastId)
      toast.error(format === 'pdf' ? 'Failed to open print dialog' : 'Failed to download HTML')
    }
  }
}

function MessageAttachments({ files }: { files: { id: string; name: string; type: string }[] }) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!expanded) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setExpanded(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  if (files.length === 1) {
    return (
      <div className="mt-1.5 inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/40 px-2.5 py-1.5 text-[12px] text-[var(--muted-foreground)]">
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate min-w-0">{files[0].name}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${expanded
          ? 'border-[var(--border)] bg-[var(--secondary)]/70 text-[var(--foreground)]'
          : 'border-[var(--border-subtle)] bg-[var(--secondary)]/40 text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60'
          }`}
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        {files.length} attachments
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-1.5 w-[240px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-150">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground)]">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <span className="truncate min-w-0">{f.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatView({
  query,
  threadId,
  onNewSearch,
  onToggleSidebar,
  isMobile = false,
  initialMode = 'fast',
  initialAttachedFileMeta,
  initialSkill = null,
  sidebarOpen,
  setSidebarOpen,
  preloadedThread = null,
}: ChatViewProps) {
  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { attachedFiles, setAttachedFiles, removeFile, uploadFile } = useFileUpload()

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    preloadedThread?.messages?.length
      ? preloadedThread.messages
      : [
          { role: 'user', content: query, ...(initialAttachedFileMeta?.length ? { attachedFiles: initialAttachedFileMeta } : {}) },
          { role: 'assistant', content: '' },
        ]
  )
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(() => (preloadedThread ? !!preloadedThread.is_generating : true))
  const [mode, setMode] = useState<AgentMode>(() => preloadedThread?.messages?.[0]?.mode ?? initialMode)
  const [title, setTitle] = useState(query)
  const [isRecording, setIsRecording] = useState(false)
  // Index of the assistant message currently being streamed (typewriter).
  const [streamingIndex, setStreamingIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [activeSkill, setActiveSkill] = useState<SkillId | null>(initialSkill)
  const [awaitingSkill, setAwaitingSkill] = useState(false)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const skillPickerRef = useRef<HTMLDivElement>(null)
  // Inline edit state for user messages
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Artifact side panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  
  const [shareDropdownOpen, setShareDropdownOpen] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState<string | null>(null)

  // Sources drawer (small right-hand panel, opened from an answer's footer).
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [activeSources, setActiveSources] = useState<Source[]>([])
  const openSources = useCallback((s: Source[]) => {
    setActiveSources(s)
    setSourcesOpen(true)
  }, [])

  // Open the panel and collapse the app sidebar (they compete for width).
  const openPanel = useCallback(
    (id: string) => {
      setActiveArtifactId(id)
      setPanelOpen(true)
      setSidebarOpen?.(false)
    },
    [setSidebarOpen]
  )

  // Opening the app sidebar collapses the artifact panel.
  useEffect(() => {
    if (sidebarOpen) setPanelOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarOpen])

  // Close + menu when clicking outside
  useEffect(() => {
    if (!plusMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [plusMenuOpen])

  // Close skill picker when clicking outside or pressing Escape
  useEffect(() => {
    if (!awaitingSkill) return
    const onMouse = (e: MouseEvent) => {
      if (skillPickerRef.current && !skillPickerRef.current.contains(e.target as Node)) {
        setAwaitingSkill(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAwaitingSkill(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [awaitingSkill])

  // Strip interactive fenced blocks (map, echarts) from report preview content
  // so they don't render full Leaflet/ECharts instances inside the thumbnail.
  const stripInteractiveBlocks = (content: string) =>
    content.replace(/```(map|echarts)[\s\S]*?```/g, '')

  const renderReportCard = (r: ReportArtifact) => {
    const isReportStreaming = !r.complete
    return (
      <div
        key={r.id}
        onClick={() => {
          if (!isReportStreaming) openPanel(r.id)
        }}
        className={`group relative flex w-full max-w-[800px] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] text-left shadow-[0_1px_4px_rgba(0,0,0,0.02)] transition-all overflow-hidden ${isReportStreaming ? 'cursor-default' : 'cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]'}`}
      >
        {/* Hover Overlay */}
        {!isReportStreaming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--background)]/10 backdrop-blur-[1px] pointer-events-none">
            <div className="bg-[var(--foreground)] text-[var(--background)] px-5 py-2.5 rounded-full text-[14px] font-medium shadow-lg pointer-events-auto transition-transform scale-95 group-hover:scale-100 duration-200">
              {panelOpen && activeArtifactId === r.id ? 'Currently opened' : `Open ${r.title}`}
            </div>
          </div>
        )}

        {/* Top Action Bar (Perplexity style) */}
        <div className="flex w-full items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background)]/40 relative z-20">
          <div className="flex items-center gap-2.5 text-[var(--muted-foreground)] min-w-0 pr-4">
            <FileText size={15} strokeWidth={1.75} className="shrink-0" />
            <span className="text-[13px] font-medium truncate opacity-90">{r.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={isReportStreaming}
              className="flex items-center justify-center h-7 w-7 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed"
            >
              <Maximize2 size={13} strokeWidth={2} />
            </button>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              {isReportStreaming ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--background)] text-[12px] font-medium text-[var(--foreground)] opacity-70">
                  <Loader2 size={13} strokeWidth={2} className="animate-spin text-[var(--muted-foreground)]" />
                  Generating
                </div>
              ) : (
                <button
                  onClick={() => setShareDropdownOpen(shareDropdownOpen === r.id ? null : r.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--background)] text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                >
                  Share <ChevronDown size={13} strokeWidth={2} className="text-[var(--muted-foreground)]" />
                </button>
              )}
              {shareDropdownOpen === r.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShareDropdownOpen(null)} />
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-[var(--card)] border border-[var(--border-subtle)] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] z-50 py-1.5 overflow-hidden">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`# ${r.title}\n\n${r.content}`)
                        setShareCopied(r.id)
                        toast.success('Copied full text')
                        setTimeout(() => setShareCopied(null), 1500)
                        setShareDropdownOpen(null)
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                    >
                      {shareCopied === r.id ? <Check size={14} className="text-emerald-500" strokeWidth={2} /> : <Copy size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />}
                      {shareCopied === r.id ? 'Copied!' : 'Copy full text'}
                    </button>
                    <div className="h-px bg-[var(--border-subtle)]/50 my-1 mx-2" />
                    <button
                      onClick={() => {
                        setShareDropdownOpen(null)
                        handleInlineDownload(r, 'markdown')
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                    >
                      <Download size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                      Download Markdown
                    </button>
                    <button
                      onClick={() => {
                        setShareDropdownOpen(null)
                        handleInlineDownload(r, 'html')
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                    >
                      <Code2 size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                      Download HTML
                    </button>
                    <button
                      onClick={() => {
                        setShareDropdownOpen(null)
                        handleInlineDownload(r, 'pdf')
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left"
                    >
                      <FileText size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
                      Download PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body Preview. `isolate` pins this as its own stacking context so the
            gradient fade (z-10) always paints above the text below, even if a
            descendant inside the markdown (e.g. a table wrapper) sets its own
            z-index — without it, mobile browsers were rendering the text on
            top of the fade instead of fading under it. */}
        <div id={`inline-report-${r.id}`} className="relative isolate p-5 sm:p-7 pb-10 max-h-[360px] overflow-hidden w-full bg-[var(--background)]">
          <h1 className="relative z-0 text-[24px] leading-tight font-semibold text-[var(--foreground)] mb-5 tracking-tight opacity-90">
            {r.title}
          </h1>

          <div className="relative z-0 text-[15px] leading-relaxed text-[var(--foreground)] opacity-90">
            <MarkdownMessage content={stripInteractiveBlocks(r.content || 'Drafting report...')} />
          </div>

          {/* Gradient Fade-out at the bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/80 to-transparent pointer-events-none z-10" />
        </div>
      </div>
    )
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const activeReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const isStoppingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const initialFilesSentRef = useRef(false)
  // Always-current best display title for this thread (used when announcing
  // generation to the sidebar so it can optimistically show the thread).
  const titleRef = useRef(title)
  titleRef.current = title || query

  // Scroll: pin each new query near the top, then stop following while the answer
  // streams (no per-token autoscroll). A bottom spacer guarantees there's always
  // enough room below the latest query for it to reach the top.
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const spacerRef = useRef<HTMLDivElement>(null)
  const [spacerH, setSpacerH] = useState(0)
  const [pinTick, setPinTick] = useState(0)
  const requestPin = useCallback(() => setPinTick((t) => t + 1), [])

  // Reports stream inline as <report> blocks; questions appear as <question>
  // blocks. Both are stripped from the displayed text and rendered separately.
  const parsedByIndex = useMemo(
    () =>
      messages.map((m, i) => {
        if (m.role !== 'assistant')
          return { text: m.content || '', reports: [] as ParsedReport[], question: null, segments: [] as ParsedSegment[] }
        const withReports = parseReports(m.content || '', `m${i}`)
        const { text, question: textQuestion, questionPending: tqp } = parseQuestion(withReports.text)
        // <question> only ever appears in narration text, never inside a
        // report, so strip it out of whichever text segment holds it.
        let question = textQuestion
        let questionPending = tqp
        const segments: ParsedSegment[] = withReports.segments
          .map((seg) => {
            if (seg.type !== 'text') return seg
            const pq = parseQuestion(seg.content)
            if (pq.question) question = pq.question
            if (pq.questionPending) questionPending = true
            return { type: 'text' as const, content: pq.text }
          })
          .filter((seg) => seg.type !== 'text' || seg.content.trim())
        return { text, reports: withReports.reports, question, questionPending, segments }
      }),
    [messages]
  )

  // Flatten artifacts/reports across the whole conversation for the panel.
  const allArtifacts: ChartArtifact[] = messages.flatMap((m) => m.artifacts ?? [])
  const parsedReports: ParsedReport[] = parsedByIndex.flatMap((p) => p.reports)
  // Older threads stored reports as a separate array (pre inline-streaming);
  // keep rendering those so historical conversations don't lose their reports.
  const legacyReports: ReportArtifact[] = messages.flatMap((m) => m.reports ?? [])
  const allReports: ReportArtifact[] = [...parsedReports, ...legacyReports]
  const draftingReport = parsedReports.some((r) => !r.complete)
  const hasPanelContent = allArtifacts.length > 0 || allReports.length > 0 || draftingReport

  // When a report starts streaming inline, surface the reader and follow it.
  const openedReportsRef = useRef<Set<string>>(new Set())
  const reportIdsKey = parsedReports.map((r) => r.id).join('|')
  useEffect(() => {
    for (const r of parsedReports) {
      if (!openedReportsRef.current.has(r.id)) {
        openedReportsRef.current.add(r.id)
        // Auto-open only if it's actively drafting. Fully completed reports 
        // loaded from history should require a manual click to open.
        if (!r.complete) {
          openPanel(r.id)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportIdsKey, parsedReports])

  // ── persistence ────────────────────────────────────────────────────────
  const syncToBackend = useCallback(
    (msgs: ChatMessage[], syncTitle?: string) => {
      if (!threadId) return
      const payloadMessages = msgs.map((m, i) => (i === 0 ? { ...m, mode } : m))
      const body: Record<string, unknown> = { messages: payloadMessages }
      if (syncTitle && !isUntitled(syncTitle)) body.title = syncTitle
      fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/sync`, {
        method: 'POST',
        body: JSON.stringify(body),
      }).catch(() => {})
    },
    [threadId, mode, fetchWithAuth]
  )

  // ── build personalization payload ──────────────────────────────────────
  const buildPersonalization = useCallback(async () => {
    const p: any = {}
    if (typeof window !== 'undefined') {
      const lang = localStorage.getItem('omni_response_language')
      if (lang && lang !== 'auto') p.response_language = lang
      if (localStorage.getItem('omni_enable_memories') === 'true') {
        const m = getMemories()
        if (m) p.memories = m
      }
    }
    p.user_local_datetime = getLocalISOString()
    try {
      const loc = await getUserLocation(false)
      if (loc?.value) p.user_location = loc.value
    } catch {}
    return p
  }, [])

  // ── streaming handler (new wire protocol) ──────────────────────────────
  const handleStream = useCallback(
    async (response: Response, baseHistory: ChatMessage[], regenTag?: Pick<ChatMessage, 'regeneratedWith'>) => {
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream reader')
      activeReaderRef.current = reader
      isStoppingRef.current = false
      const decoder = new TextDecoder()
      let buffer = ''

      const clearSlowHint = () => {}

      const steps: ToolStep[] = []
      let text = ''
      const widgets: WidgetData[] = []
      const artifacts: ChartArtifact[] = []
      let sources: Source[] = []
      // Reports stream inline as text now; only charts are still tool-drafted.
      let drafting: 'chart' | null = null

      // Preserve arrival order of text vs. tool calls so the UI can render
      // them interleaved (text, then tools, then more text, etc.) instead of
      // always showing all tool activity before all text.
      const blocks: MessageBlock[] = []
      const appendText = (chunk: string) => {
        const last = blocks[blocks.length - 1]
        if (last && last.type === 'text') last.content += chunk
        else blocks.push({ type: 'text', content: chunk })
      }
      const appendToolStep = (step: ToolStep) => {
        const last = blocks[blocks.length - 1]
        if (last && last.type === 'tools') last.steps.push(step)
        else blocks.push({ type: 'tools', steps: [step] })
      }

      const patchAssistant = () => {
        setMessages([
          ...baseHistory,
          {
            role: 'assistant',
            content: text,
            steps: [...steps],
            blocks: blocks.map((b) => (b.type === 'text' ? { ...b } : { ...b, steps: [...b.steps] })),
            widgets: [...widgets],
            artifacts: [...artifacts],
            sources,
            drafting,
            ...regenTag,
          },
        ])
      }

      while (true) {
        let done: boolean, value: Uint8Array | undefined
        try {
          ;({ done, value } = await reader.read())
        } catch {
          break
        }
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data: ')) continue
          let ev: any
          try {
            ev = JSON.parse(t.slice(6))
          } catch {
            continue
          }
          switch (ev.type) {
            case 'text':
              if (ev.content) clearSlowHint()
              text += ev.content || ''
              if (ev.content) appendText(ev.content)
              patchAssistant()
              break
            case 'widget':
              console.log('[widget] received:', ev.widget, ev.data)
              widgets.push({ widget: ev.widget, data: ev.data })
              console.log('[widget] widgets array now:', widgets)
              patchAssistant()
              break
            case 'tool_call': {
              const step = { tool: ev.tool, args: ev.args, timestamp: Date.now() }
              steps.push(step)
              appendToolStep(step)
              patchAssistant()
              break
            }
            case 'drafting':
              // Only charts are tool-drafted; reports stream inline as text.
              drafting = 'chart'
              patchAssistant()
              break
            case 'sources': {
              const seen = new Set(sources.map((s) => s.url))
              for (const s of ev.sources || []) if (!seen.has(s.url)) sources = [...sources, s]
              patchAssistant()
              break
            }
            case 'artifact':
              artifacts.push({ id: ev.id, title: ev.title, kind: 'echarts', spec: ev.spec })
              drafting = null
              openPanel(ev.id)
              patchAssistant()
              break
            case 'error': {
              clearSlowHint()
              const chunk = (text ? '\n\n' : '') + (ev.content || 'Something went wrong.')
              text += chunk
              appendText(chunk)
              patchAssistant()
              break
            }
            case 'stopped': {
              clearSlowHint()
              const finalText = text || (artifacts.length ? "I've prepared a chart for you — see the panel on the right." : '')
              const finalMessages: ChatMessage[] = [
                ...baseHistory,
                { role: 'assistant', content: finalText, steps, blocks, widgets, artifacts, sources, drafting: null, stoppedByUser: true, ...regenTag },
              ]
              setMessages(finalMessages)
              syncToBackend(finalMessages, titleRef.current)
              activeReaderRef.current = null
              setIsLoading(false)
              setStreamingIndex(-1)
              return
            }
            case 'done': {
              clearSlowHint()
              const finalText =
                text || (artifacts.length ? "I've prepared a chart for you — see the panel on the right." : 'No response.')
              const finalMessages: ChatMessage[] = [
                ...baseHistory,
                { role: 'assistant', content: finalText, steps, blocks, widgets, artifacts, sources, drafting: null, ...regenTag },
              ]
              setMessages(finalMessages)
              syncToBackend(finalMessages, titleRef.current)
              activeReaderRef.current = null
              setIsLoading(false)
              setStreamingIndex(-1)
              return
            }
          }
        }
      }
      clearSlowHint()
      if (isStoppingRef.current) {
        const stoppedMessages: ChatMessage[] = [
          ...baseHistory,
          { role: 'assistant', content: text, steps, blocks, widgets, artifacts, sources, drafting: null, stoppedByUser: true, ...regenTag },
        ]
        setMessages(stoppedMessages)
        syncToBackend(stoppedMessages, titleRef.current)
      }
      activeReaderRef.current = null
      setIsLoading(false)
      setStreamingIndex(-1)
    },
    [syncToBackend, title, openPanel]
  )

  // ── send a turn ────────────────────────────────────────────────────────
  const runQuery = useCallback(
    async (queryText: string, baseHistory: ChatMessage[], fileIds?: Record<string, string>[]) => {
      setIsLoading(true)
      // The assistant reply will be appended right after baseHistory.
      setStreamingIndex(baseHistory.length)
      if (threadId) {
        localStorage.setItem(`omni:gen:${threadId}`, titleRef.current || '1')
        window.dispatchEvent(
          new CustomEvent('omni:gen:start', {
            detail: { threadId, title: titleRef.current, mode },
          })
        )
        // Persist the user's message immediately. If the user leaves before the
        // answer finishes, a reconnect rebuilds history from the backend — without
        // this early sync the just-asked question would be missing.
        syncToBackend(baseHistory, titleRef.current)
      }
      try {
        const personalization = await buildPersonalization()
        const payload: any = { query: queryText, thread_id: threadId, mode }
        if (Object.keys(personalization).length) payload.personalization = personalization
        if (fileIds && fileIds.length) payload.attached_file_ids = fileIds
        if (activeSkill) payload.skill = activeSkill
        appendQueryToMemoryQueue(queryText)

        const res = await fetchWithAuth(`${BACKEND_URL}/chat`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const msg = getAiRequestErrorMessage(res.status)
          toast.error(msg)
          throw new Error(msg)
        }
        await handleStream(res, baseHistory)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed.'
        setMessages([...baseHistory, { role: 'assistant', content: msg }])
        setIsLoading(false)
        setStreamingIndex(-1)
      } finally {
        if (threadId) {
          localStorage.removeItem(`omni:gen:${threadId}`)
          window.dispatchEvent(new CustomEvent('omni:gen:stop', { detail: { threadId } }))
        }
      }
    },
    [threadId, mode, buildPersonalization, fetchWithAuth, handleStream, syncToBackend]
  )

  // Applies an already-fetched /api/threads/{id} payload: reconnects to a
  // background generation if one is in flight, otherwise just settles the
  // loading state. Shared by the preloaded path and the fetch-on-mount path
  // below so the two don't drift apart.
  const applyLoadedThread = useCallback(
    async (data: { messages?: unknown; is_generating?: boolean }) => {
      if (!Array.isArray(data?.messages) || data.messages.length === 0) return false
      const loadedMessages = data.messages as ChatMessage[]
      setMessages(loadedMessages)
      if (loadedMessages[0]?.mode) setMode(loadedMessages[0].mode)

      if (data.is_generating) {
        // A background generation is in progress — reconnect to it.
        setIsLoading(true)
        setStreamingIndex(loadedMessages.length)
        requestPin()
        localStorage.setItem(`omni:gen:${threadId}`, titleRef.current || '1')
        window.dispatchEvent(
          new CustomEvent('omni:gen:start', {
            detail: { threadId, title: titleRef.current, mode },
          })
        )
        try {
          const streamRes = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/stream`)
          if (streamRes.ok) {
            await handleStream(streamRes, loadedMessages)
          } else {
            setIsLoading(false)
          }
        } catch {
          setIsLoading(false)
        } finally {
          localStorage.removeItem(`omni:gen:${threadId}`)
          window.dispatchEvent(new CustomEvent('omni:gen:stop', { detail: { threadId } }))
        }
      } else {
        // Clear any stale generating marker from a previous session.
        localStorage.removeItem(`omni:gen:${threadId}`)
        window.dispatchEvent(new CustomEvent('omni:gen:stop', { detail: { threadId } }))
        setIsLoading(false)
        setTimeout(() => requestPin(), 50)
      }
      return true
    },
    [threadId, mode, fetchWithAuth, handleStream, requestPin]
  )

  // ── initial load: preloaded/backend history, else fire the first query ─
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const init = async () => {
      if (preloadedThread) {
        if (await applyLoadedThread(preloadedThread)) return
      } else {
        try {
          const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}`)
          if (res.ok) {
            const data = await res.json()
            if (await applyLoadedThread(data)) return
          }
        } catch {}
      }

      const fileIds =
        initialAttachedFileMeta && initialAttachedFileMeta.length > 0 && !initialFilesSentRef.current
          ? (() => {
              initialFilesSentRef.current = true
              return initialAttachedFileMeta.map((m) => ({ [m.id]: m.name }))
            })()
          : undefined
      const userMsg: ChatMessage = {
        role: 'user',
        content: query,
        ...(initialAttachedFileMeta?.length ? { attachedFiles: initialAttachedFileMeta } : {}),
      }
      setAttachedFiles([])
      requestPin() // pin the first query to the top
      await runQuery(query, [userMsg], fileIds)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // ── title ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ENABLE_LLM_TITLE_GENERATION) return
    if (isUntitled(query)) return
    let cancelled = false
    fetch(`${BACKEND_URL}/get_title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const newTitle = typeof d === 'string' ? d : d?.title
        if (!newTitle || isUntitled(newTitle)) return
        setTitle(newTitle)
        // Persist the generated title directly. The answer may finish streaming
        // before /get_title returns, in which case the `done` sync already wrote
        // the raw query — so push the real title independently here, and tell the
        // sidebar to swap its live entry over from the query.
        if (threadId) {
          fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/title`, {
            method: 'PATCH',
            body: JSON.stringify({ title: newTitle }),
          }).catch(() => {})
          window.dispatchEvent(
            new CustomEvent('omni:title', { detail: { threadId, title: newTitle } })
          )
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [query, threadId, fetchWithAuth])

  // Mirror the chat title onto the browser tab so a copied /thread/{id} link
  // is recognizable at a glance. Reverts to the site default on unmount (new
  // chat / navigating away) rather than leaking a stale title.
  useEffect(() => {
    const chatTitle = title || query
    if (isUntitled(chatTitle)) return
    document.title = toTabTitle(chatTitle)
    return () => {
      document.title = 'Omni Knows'
    }
  }, [title, query])

  // ── scroll model ────────────────────────────────────────────────────────
  // No autoscroll while streaming. Instead: when a query is sent we pin it near
  // the top of the viewport and leave it there as the answer fills in below.
  //
  // `recomputeSpacer` sizes a bottom spacer so the latest query can always be
  // scrolled to the top (there's a full viewport of room beneath it), and shrinks
  // it as the answer grows so trailing whitespace stays minimal. It returns the
  // scrollTop that lands the query at `PIN_TOP_GAP` from the top.
  const recomputeSpacer = useCallback((): number | null => {
    const container = scrollRef.current
    if (!container) return null
    const msgs = messagesRef.current
    let idx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        idx = i
        break
      }
    }
    if (idx < 0) {
      setSpacerH(0)
      return null
    }
    const el = container.querySelector(`[data-message-index="${idx}"]`) as HTMLElement | null
    if (!el) {
      setSpacerH(0)
      return null
    }
    const curSpacer = spacerRef.current?.offsetHeight ?? 0
    const naturalBottom = container.scrollHeight - curSpacer // content height sans spacer
    const elTop =
      el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    const below = naturalBottom - elTop // content from the query's top to the end
    const room = container.clientHeight - PIN_TOP_GAP
    setSpacerH(Math.max(0, Math.round(room - below)))
    return Math.max(0, Math.round(elTop - PIN_TOP_GAP))
  }, [])

  // Keep the spacer correctly sized as the answer streams in (does not scroll).
  useIsoLayoutEffect(() => {
    recomputeSpacer()
  }, [messages, recomputeSpacer])

  // A new query was sent → size the spacer, then smooth-scroll it to the top.
  useIsoLayoutEffect(() => {
    if (pinTick === 0) return
    const container = scrollRef.current
    if (!container) return
    const target = recomputeSpacer()
    // The spacer state re-renders synchronously (layout effect); scroll on the
    // next frame once that taller spacer is in the DOM so the query can reach top.
    const raf = requestAnimationFrame(() => {
      container.scrollTo({ top: target ?? container.scrollHeight, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [pinTick, recomputeSpacer])

  // ── submit a question-block answer ────────────────────────────────────
  const handleQuestionSubmit = useCallback(
    async (formattedAnswer: string) => {
      const userMsg: ChatMessage = { role: 'user', content: formattedAnswer }
      const baseHistory = [...messages, userMsg]
      setMessages([...baseHistory, { role: 'assistant', content: '' }])
      setStreamingIndex(baseHistory.length)
      requestPin()
      await runQuery(formattedAnswer, baseHistory)
    },
    [messages, runQuery, requestPin]
  )

  // ── rewind: regenerate or edit-and-resend ─────────────────────────────
  const handleRewind = useCallback(
    async (newQuery?: string, rewindMode?: AgentMode) => {
      const effectiveMode = rewindMode ?? mode

      // Always close any open edit box first
      setEditingIndex(null)

      // Compute trimmed history for UI.
      // For regenerate: drop the last assistant message.
      // For edit: drop the last assistant + last user, then add new user message.
      let baseHistory: ChatMessage[]
      if (newQuery !== undefined) {
        let lastUserIdx = -1
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') { lastUserIdx = i; break }
        }
        baseHistory = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : []
        baseHistory = [...baseHistory, { role: 'user', content: newQuery }]
      } else {
        let lastAiIdx = -1
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') { lastAiIdx = i; break }
        }
        baseHistory = lastAiIdx >= 0 ? messages.slice(0, lastAiIdx) : messages
      }

      // Tag the incoming assistant message as regenerated so we can show the label
      const regenTag: Pick<ChatMessage, 'regeneratedWith'> = { regeneratedWith: effectiveMode }

      setMessages([...baseHistory, { role: 'assistant', content: '', ...regenTag }])
      setStreamingIndex(baseHistory.length)
      setIsLoading(true)
      requestPin()

      try {
        const personalization = await buildPersonalization()
        const payload: any = { mode: effectiveMode }
        if (newQuery !== undefined) payload.new_query = newQuery
        if (Object.keys(personalization).length) payload.personalization = personalization

        const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/rewind`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const msg = getAiRequestErrorMessage(res.status)
          toast.error(msg)
          throw new Error(msg)
        }
        // handleStream builds the final message from scratch; we need to carry
        // the regenTag into it. We wrap patchAssistant to merge the tag in.
        await handleStream(res, baseHistory, regenTag)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed.'
        setMessages([...baseHistory, { role: 'assistant', content: msg, ...regenTag }])
        setIsLoading(false)
        setStreamingIndex(-1)
      }
    },
    [messages, mode, threadId, buildPersonalization, fetchWithAuth, handleStream, requestPin]
  )

  // ── send from composer ─────────────────────────────────────────────────
  const handleSend = async () => {
    if (isLoading) return
    if (attachedFiles.some((f) => f.status === 'uploading')) {
      toast.info('Please wait for the file to finish uploading.')
      return
    }
    const readyFiles = attachedFiles.filter((f) => f.status === 'ready')
    if (!input.trim() && readyFiles.length === 0) return
    const activeFiles = readyFiles.map((f) => ({ id: f.id!, name: f.name, type: f.type }))
    const userMsg: ChatMessage = {
      role: 'user',
      content: input,
      ...(activeFiles.length ? { attachedFiles: activeFiles } : {}),
    }
    const baseHistory = [...messages, userMsg]
    const queryText = input
    setInput('')
    setAttachedFiles([])
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    // Optimistically render the user's message + an empty assistant bubble so
    // the UI updates instantly, before personalization/network work begins.
    setMessages([...baseHistory, { role: 'assistant', content: '' }])
    setStreamingIndex(baseHistory.length)
    requestPin() // pin this new query to the top
    const fileIds = activeFiles.map((f) => ({ [f.id]: f.name }))
    await runQuery(queryText, baseHistory, fileIds.length ? fileIds : undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (awaitingSkill && e.key === 'Enter') {
      const filter = input.startsWith('/') ? input.slice(1).toLowerCase().trim() : ''
      const matches = SKILLS.filter(s => !filter || s.label.toLowerCase().includes(filter) || s.id.includes(filter))
      if (matches.length > 0) {
        e.preventDefault()
        setActiveSkill(matches[0].id)
        setAwaitingSkill(false)
        setInput('')
        return
      }
    }
    if (!shouldSubmitOnEnter(e)) return
    e.preventDefault()
    handleSend()
  }

  // ── speech-to-text (Web Speech API) ────────────────────────────────────
  const handleSst = useCallback(() => {
    if (isLoading) return
    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null
    if (!Ctor) {
      toast.info('Speech-to-text is not supported in this browser.')
      return
    }
    let transcript = ''
    try {
      const rec = new Ctor()
      rec.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
      rec.interimResults = false
      rec.continuous = false
      rec.onstart = () => setIsRecording(true)
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const p = e.results[i]?.[0]?.transcript
          if (typeof p === 'string') transcript += p
        }
      }
      rec.onerror = () => {
        setIsRecording(false)
        toast.error('Speech recognition failed.')
      }
      rec.onend = () => {
        setIsRecording(false)
        recognitionRef.current = null
        const f = transcript.trim()
        if (f) setInput((prev) => (prev.trim() ? `${prev.trim()} ${f}` : f))
      }
      recognitionRef.current = rec
      rec.start()
    } catch {
      setIsRecording(false)
      toast.error('Unable to start speech recognition.')
    }
  }, [isLoading, isRecording])

  const handleStop = useCallback(() => {
    isStoppingRef.current = true
    if (threadId) {
      fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/stop`, { method: 'POST' }).catch(() => {})
    }
    activeReaderRef.current?.cancel().catch(() => {})
  }, [threadId, fetchWithAuth])

  useEffect(() => () => recognitionRef.current?.stop?.(), [])

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const f of files) await uploadFile(f, threadId)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length === 0) return
    e.preventDefault()
    for (const f of files) uploadFile(f, threadId).catch((err) => console.error('Paste upload failed', err))
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[var(--background)]">
      {/* Main column */}
      <div className="flex flex-col h-full relative min-w-0 flex-1 transition-all duration-300">
        {/* Header */}
        <header className="flex-shrink-0 h-14 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-between px-4 z-30 sticky top-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button onClick={onToggleSidebar} className="p-2 -ml-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)]">
                <Menu size={20} />
              </button>
            )}
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 max-w-[55%] truncate text-sm font-medium text-foreground/90">
            {title || query}
          </span>
          <div className="flex items-center gap-1">
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-8 pb-32">
            {(() => {
              // Index of the last user message (edit only applies to that one)
              let lastUserIdx = -1
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') { lastUserIdx = i; break }
              }
              return messages.map((msg, i) => (
              <div key={i} data-message-index={i} className={`flex flex-col scroll-mt-20 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'user' ? (
                  <>
                  <div className="group relative flex flex-row items-end gap-1 max-w-[85%]">
                    {/* Hover action row — left of bubble */}
                    {editingIndex !== i && (
                      <div className="flex items-center gap-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                        <button
                          title="Copy"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content)
                            toast.success('Copied')
                          }}
                          className="p-1.5 rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] transition-all duration-150 active:scale-95"
                        >
                          <Copy size={14} strokeWidth={1.75} />
                        </button>
                        {i === lastUserIdx && !isLoading && (
                          <button
                            title="Edit message"
                            onClick={() => { setEditingIndex(i); setEditText(msg.content); setTimeout(() => editRef.current?.focus(), 0) }}
                            className="p-1.5 rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] transition-all duration-150 active:scale-95"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    )}

                    {editingIndex === i ? (
                      /* Inline edit area */
                      <div className="w-full min-w-[260px] max-w-[560px] rounded-2xl bg-[var(--secondary)] px-4 py-3 flex flex-col gap-2">
                        <textarea
                          ref={editRef}
                          value={editText}
                          onChange={(e) => {
                            setEditText(e.target.value)
                            e.target.style.height = 'auto'
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingIndex(null)
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              if (editText.trim()) { setEditingIndex(null); handleRewind(editText.trim()) }
                            }
                          }}
                          rows={1}
                          className="w-full resize-none bg-transparent text-[15px] text-[var(--foreground)] leading-relaxed focus:outline-none custom-scrollbar"
                          style={{ minHeight: '28px' }}
                        />
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={!editText.trim()}
                            onClick={() => { if (editText.trim()) { setEditingIndex(null); handleRewind(editText.trim()) } }}
                            className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-[var(--accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-[var(--secondary)] px-4 py-2.5 text-[15px] text-foreground whitespace-pre-wrap break-words min-w-0 overflow-hidden">
                        {msg.content}
                      </div>
                    )}
                  </div>
                  {editingIndex !== i && !!msg.attachedFiles?.length && (
                    <MessageAttachments files={msg.attachedFiles} />
                  )}
                  </>
                ) : (
                  (() => {
                    const parsed = parsedByIndex[i] ?? { text: msg.content || '', reports: [] as ParsedReport[], segments: [] as ParsedSegment[] }
                    const reportDrafting = parsed.reports.some((r) => !r.complete)
                    return (
                      <div className="w-full" data-selection-scope="assistant-message">
                        <WidgetCards widgets={msg.widgets} />
                        {/* Text and tool activity can arrive interleaved (text, then
                            tools, then more text, ...). When we have ordered blocks,
                            render them in that order so a tool box that's followed by
                            more text collapses instead of always sitting above all text. */}
                        {msg.blocks && msg.blocks.length > 0 ? (
                          msg.blocks.map((block, bi) => {
                            const isLastBlock = bi === msg.blocks!.length - 1
                            const isCurrentlyStreaming = i === streamingIndex && isLoading
                            if (block.type === 'tools') {
                              const followedByText = msg.blocks!.slice(bi + 1).some((b) => b.type === 'text' && b.content.trim())
                              return (
                                <ToolActivity
                                  key={`tools-${i}-${bi}`}
                                  steps={block.steps}
                                  isStreaming={isCurrentlyStreaming && isLastBlock}
                                  answered={followedByText || !isCurrentlyStreaming}
                                  drafting={isLastBlock ? (reportDrafting ? 'report' : msg.drafting) : null}
                                />
                              )
                            }
                            // Render text and any inline <report> blocks in the order
                            // they appeared, so narration after a report's closing
                            // tag shows below the report card instead of above it.
                            const { segments: blockSeg } = parseReports(block.content, `m${i}-b${bi}`)
                            return (
                              <Fragment key={`block-${i}-${bi}`}>
                                {blockSeg.map((seg, si) =>
                                  seg.type === 'text' ? (
                                    parseQuestion(seg.content).text ? (
                                      <StreamingText
                                        key={`text-${i}-${bi}-${si}`}
                                        content={parseQuestion(seg.content).text}
                                        animate={isCurrentlyStreaming && isLastBlock}
                                      />
                                    ) : null
                                  ) : (
                                    <div key={`report-wrap-${i}-${bi}-${si}`} className="my-3 w-full">
                                      {renderReportCard(seg.report)}
                                    </div>
                                  )
                                )}
                              </Fragment>
                            )
                          })
                        ) : (
                          <>
                            <ToolActivity
                              steps={msg.steps}
                              isStreaming={i === streamingIndex && isLoading}
                              answered={!!parsed.text}
                              drafting={reportDrafting ? 'report' : msg.drafting}
                            />
                            {/* answer text and inline report cards, in source order */}
                            {parsed.segments.map((seg, si) =>
                              seg.type === 'text' ? (
                                <StreamingText key={`text-${i}-${si}`} content={seg.content} animate={i === streamingIndex} />
                              ) : (
                                <div key={`report-wrap-${i}-${si}`} className="my-3 w-full">
                                  {renderReportCard(seg.report)}
                                </div>
                              )
                            )}
                          </>
                        )}

                        {/* Skeleton shown while the <question> block is mid-stream */}
                        {!parsed.question && parsed.questionPending && i === streamingIndex && isLoading && (
                          <QuestionSkeleton />
                        )}

                        {/* question block
                            Guard: skip mount only while THIS message is still
                            streaming (avoids stale useState(answered) init).
                            Already-answered blocks on older messages remain
                            visible even while a later response is loading. */}
                        {parsed.question && !(i === streamingIndex && isLoading) && (() => {
                          const hasUserAfter = messages.slice(i + 1).some((m) => m.role === 'user')
                          const isLastAssistant = i === messages.length - 1
                          const isInteractive = isLastAssistant && !hasUserAfter && !isLoading
                          const answeredText = !isInteractive
                            ? messages.slice(i + 1).find((m) => m.role === 'user')?.content
                            : undefined
                          return (
                            <QuestionBlock
                              key={`q-${i}`}
                              question={parsed.question}
                              onSubmit={handleQuestionSubmit}
                              answered={!isInteractive}
                              answeredText={answeredText}
                            />
                          )
                        })()}

                        {/* Reports from older threads, stored as a separate array
                            rather than inline in the text (pre inline-streaming). */}
                        {(msg.reports?.length ?? 0) > 0 && (
                          <div className="mt-4 flex flex-col gap-3 w-full">
                            {msg.reports!.map((r) => renderReportCard(r))}
                          </div>
                        )}

                        {/* artifact chips */}
                        {msg.artifacts?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.artifacts.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => openPanel(a.id)}
                                className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                              >
                                <BarChart3 size={15} strokeWidth={1.75} className="text-[var(--muted-foreground)]" />
                                <span className="max-w-[200px] truncate">{a.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {/* stopped-by-user label */}
                        {msg.stoppedByUser && !(i === streamingIndex && isLoading) && (
                          <div className={`flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]/55 select-none${parsed.text ? ' mt-4' : ' mt-1'}`}>
                            <Square className="h-2.5 w-2.5 fill-current shrink-0" />
                            <span>Answer skipped by user</span>
                          </div>
                        )}

                        {/* footer: sources + actions, once the turn is complete */}
                        {(parsed.text || msg.stoppedByUser) && !(i === streamingIndex && isLoading) ? (
                          <AnswerFooter
                            content={parsed.text}
                            sources={msg.sources}
                            onOpenSources={openSources}
                            isLastMessage={i === messages.length - 1}
                            onRegenerate={(rewindMode) => handleRewind(undefined, rewindMode)}
                            regeneratedWith={msg.regeneratedWith}
                          />
                        ) : null}
                      </div>
                    )
                  })()
                )}
              </div>
            ))})()}
            {/* Bottom spacer: reserves room so the latest query can sit at the top. */}
            {spacerH > 0 && <div ref={spacerRef} style={{ height: spacerH }} aria-hidden className="shrink-0" />}
          </div>
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-[var(--border-subtle)] bg-[var(--background)] p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-[800px] mx-auto w-full">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files || []);
                for (const f of files) uploadFile(f, threadId);
              }}
              className={`
                relative rounded-2xl transition-all duration-300 flex flex-col
                ${isFocused || isDragging
                  ? 'shadow-[0_0_0_1px_var(--accent),0_4px_24px_rgba(32,178,170,0.08)] bg-[var(--card)]'
                  : 'shadow-[0_0_0_1px_var(--border),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_var(--border),0_4px_16px_rgba(0,0,0,0.06)] bg-card'
                }
                ${isDragging ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]' : ''}
              `}
            >
              {attachedFiles.length > 0 && (
                <div className="px-5 pt-4 pb-0 animate-in fade-in slide-in-from-top-1 duration-200">
                  <FileUploadArea files={attachedFiles} onRemove={removeFile} />
                </div>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  const val = e.target.value
                  if (!awaitingSkill && val === '/' && !isLoading && mode === 'pro' && !isMobile) {
                    setAwaitingSkill(true)
                    setInput('/')
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`
                    return
                  }
                  if (awaitingSkill) {
                    if (!val.startsWith('/')) {
                      setAwaitingSkill(false)
                    } else {
                      const filter = val.slice(1).toLowerCase().trim()
                      if (filter) {
                        const matches = SKILLS.filter(s => s.label.toLowerCase().includes(filter) || s.id.includes(filter))
                        if (matches.length === 0) setAwaitingSkill(false)
                      }
                    }
                  }
                  setInput(val)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                onPaste={onPaste}
                placeholder={isRecording ? 'Listening...' : "Ask anything..."}
                className={`w-full resize-none bg-transparent px-6 ${attachedFiles.length > 0 ? 'pt-3 pb-2' : 'pt-5 pb-2'} text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar max-h-[300px]`}
                style={{ minHeight: '52px' }}
              />

              {/* Bottom bar */}
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                {/* Left side: + menu + active skill pill */}
                <div ref={plusMenuRef} className="flex items-center gap-1.5">
                  {/* + button — intentionally not `relative`, so the dropdown anchors to the composer box above */}
                  <div>
                    <button
                      type="button"
                      onClick={() => { if (!isLoading) setPlusMenuOpen(p => !p) }}
                      disabled={isLoading}
                      className={`
                        flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                        ${!isLoading
                          ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                        }
                      `}
                      aria-label="Add"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    {/* The composer sits at the bottom of the viewport, so the menu always expands upward. */}
                    {plusMenuOpen && (
                      <div className="absolute inset-x-0 bottom-full mb-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-100 py-2">
                        {/* Add photos & files */}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isSignedIn) { clerk.openSignIn(); return }
                            fileInputRef.current?.click()
                            setPlusMenuOpen(false)
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--secondary)]/60 transition-colors rounded-lg"
                        >
                          <Paperclip className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[var(--foreground)]">Add photos & files</span>
                            <span className="block text-xs text-[var(--muted-foreground)]">Upload from computer</span>
                          </span>
                        </button>

                        {/* Divider */}
                        <div className="mx-3 my-1 border-t border-[var(--border)]" />

                        {/* Skills — Pro only */}
                        {SKILLS.map((skill) => {
                          const isActive = activeSkill === skill.id
                          if (mode !== 'pro') {
                            return (
                              <button
                                key={skill.id}
                                type="button"
                                title="Only available in Pro mode"
                                onClick={() => toast('Switch to Pro mode to use skills')}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left rounded-lg opacity-40 cursor-not-allowed"
                              >
                                <skill.Icon className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-[var(--foreground)]">{skill.label}</span>
                                  <span className="block text-xs text-[var(--muted-foreground)]">Only available in Pro mode</span>
                                </span>
                                <Lock className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
                              </button>
                            )
                          }
                          return (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => { setActiveSkill(isActive ? null : skill.id); setPlusMenuOpen(false) }}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg ${isActive ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--secondary)]/60'}`}
                            >
                              <skill.Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'}`} />
                              <span className="min-w-0 flex-1">
                                <span className={`block text-sm font-medium ${isActive ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>{skill.label}</span>
                                <span className="block text-xs text-[var(--muted-foreground)]">{skill.desc}</span>
                              </span>
                              {isActive && <Check className="h-4 w-4 text-[var(--accent)] shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={onPickFiles} />

                  {/* Active skill pill */}
                  {activeSkill && (() => {
                    const skill = SKILLS.find(s => s.id === activeSkill)!
                    return (
                      <>
                        {/* Mobile: X + icon only */}
                        <button type="button" onClick={() => setActiveSkill(null)}
                          className="md:hidden flex items-center gap-1.5 rounded-full border border-foreground/25 px-2.5 py-1.5 text-[var(--muted-foreground)]"
                          aria-label="Remove skill">
                          <X className="h-3.5 w-3.5 shrink-0" />
                          <skill.Icon className="h-3.5 w-3.5 shrink-0" />
                        </button>
                        {/* Desktop: hover icon swap + name */}
                        <button type="button" onClick={() => setActiveSkill(null)}
                          className="hidden md:flex group items-center gap-1.5 rounded-full border border-foreground/25 px-3 py-1.5 text-[13px] font-medium text-[var(--muted-foreground)]"
                          aria-label="Remove skill">
                          <span className="relative h-3.5 w-3.5 shrink-0">
                            <skill.Icon className="absolute inset-0 h-3.5 w-3.5 transition-opacity group-hover:opacity-0" />
                            <X className="absolute inset-0 h-3.5 w-3.5 transition-opacity opacity-0 group-hover:opacity-100" />
                          </span>
                          <span>{skill.label}</span>
                        </button>
                      </>
                    )
                  })()}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Mode dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setModelDropdownOpen(prev => !prev)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors select-none"
                    >
                      <span>{mode === 'pro' ? 'Pro' : 'Fast'}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {modelDropdownOpen && (
                      <>
                        {/* Desktop Dropdown */}
                        <div className="hidden md:block absolute bottom-full right-0 mb-2 w-[280px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                          {[
                            { value: 'fast' as const, label: 'Fast', desc: 'All-around answers' },
                            { value: 'pro' as const, label: 'Pro', desc: 'In-depth analysis on complex topics' },
                          ].map((opt) => {
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setMode(opt.value)
                                  setModelDropdownOpen(false)
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--secondary)]/50 ${mode === opt.value ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[14px] font-semibold leading-none">
                                      {opt.label}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-[var(--muted-foreground)] leading-snug line-clamp-2">
                                    {opt.desc}
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center justify-center w-5">
                                  {mode === opt.value && (
                                    <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>

                        {/* Mobile Modal/Drawer */}
                        <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setModelDropdownOpen(false)} />
                          <div className="relative bg-[var(--background)] rounded-t-3xl px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-full duration-300">
                            {/* grabber */}
                            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--border)]" />
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-base font-semibold text-[var(--foreground)]">Select Mode</h3>
                              <button
                                type="button"
                                onClick={() => setModelDropdownOpen(false)}
                                className="p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex flex-col gap-2">
                              {[
                                { value: 'fast' as const, label: 'Fast', desc: 'All-around answers' },
                                { value: 'pro' as const, label: 'Pro', desc: 'In-depth analysis on complex topics' },
                              ].map((opt) => {
                                const selected = mode === opt.value
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setMode(opt.value)
                                      setModelDropdownOpen(false)
                                    }}
                                    className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-left border transition-colors ${selected ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-[var(--border-subtle)] bg-[var(--secondary)]/30 active:bg-[var(--secondary)]/60'}`}
                                  >
                                    <div className="flex flex-col min-w-0">
                                      <span className={`text-[15px] font-medium ${selected ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>
                                        {opt.label}
                                      </span>
                                      <span className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                                        {opt.desc}
                                      </span>
                                    </div>
                                    <div className="ml-1 shrink-0">
                                      {selected ? (
                                        <div className="h-5 w-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white">
                                          <Check className="h-3.5 w-3.5" />
                                        </div>
                                      ) : (
                                        <div className="h-5 w-5 rounded-full border-2 border-[var(--border)]" />
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSst}
                    disabled={isLoading}
                    className={`
                      relative flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                      ${!isLoading
                        ? isRecording
                          ? 'bg-accent text-accent-foreground hover:opacity-90 shadow-[0_0_0_1px_var(--accent)]'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }
                    `}
                    aria-label={isRecording ? 'Stop speech to text' : 'Start speech to text'}
                  >
                    {isRecording && (
                      <span className="absolute inset-0 rounded-full border border-[var(--accent-foreground)]/35 animate-ping" aria-hidden="true" />
                    )}
                    <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />
                  </button>

                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200 bg-accent text-accent-foreground hover:opacity-90 active:scale-95 cursor-pointer"
                      aria-label="Stop generation"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={(!input.trim() && attachedFiles.filter((f) => f.status === 'ready').length === 0) || attachedFiles.some((f) => f.status === 'uploading')}
                      className={`
                        flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                        ${(input.trim() || attachedFiles.filter((f) => f.status === 'ready').length > 0) && !attachedFiles.some((f) => f.status === 'uploading')
                            ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer'
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                        }
                      `}
                      aria-label="Submit message"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* / skill picker */}
              {awaitingSkill && (() => {
                const filter = input.startsWith('/') ? input.slice(1).toLowerCase().trim() : ''
                const filtered = SKILLS.filter(s => !filter || s.label.toLowerCase().includes(filter) || s.id.includes(filter))
                if (filtered.length === 0) return null
                return (
                  <div
                    ref={skillPickerRef}
                    className="absolute bottom-full left-0 mb-2 w-[240px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150"
                  >
                    <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">Skills</p>
                    {filtered.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => {
                          setActiveSkill(skill.id)
                          setAwaitingSkill(false)
                          setInput('')
                          setTimeout(() => inputRef.current?.focus(), 0)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors rounded-lg"
                      >
                        <skill.Icon className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
                        {skill.label}
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Artifact side panel — kept mounted so it slides open AND closed (Desktop) */}
      {hasPanelContent && (
        <div
          className={`hidden sm:block h-full flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            panelOpen ? 'w-[62%] max-w-[1240px]' : 'w-0'
          }`}
        >
          <div className="h-full w-full">
            <ArtifactPanel
              artifacts={allArtifacts}
              reports={allReports}
              drafting={draftingReport}
              activeId={activeArtifactId}
              onSelect={setActiveArtifactId}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile Artifact Panel - Full Screen Overlay */}
      {hasPanelContent && panelOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--background)] flex flex-col sm:hidden animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div className="h-full w-full">
            <ArtifactPanel
              artifacts={allArtifacts}
              reports={allReports}
              drafting={draftingReport}
              activeId={activeArtifactId}
              onSelect={setActiveArtifactId}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Sources drawer — small overlay panel, slides in over the right edge */}
      <SourcesPanel sources={activeSources} open={sourcesOpen} onClose={() => setSourcesOpen(false)} />
    </div>
  )
}
