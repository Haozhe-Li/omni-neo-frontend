'use client'

import React, { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { Menu, ArrowUp, ArrowRight, Mic, Square, Paperclip, Link2, Plus, BarChart3, FileText, Copy, Maximize2, ChevronDown, Check, Lock, X, Pencil, Download, Code2, Loader2, Telescope, Plane, GraduationCap, MessageSquarePlus, ShieldAlert, AlertTriangle, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useApi } from '@/hooks/useApi'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileUploadArea } from '@/components/file-upload-area'
import { useSourceUrls, isFirstPartyUrl, MAX_SOURCE_URLS, extractUrls, lastCompletedUrlToken } from '@/hooks/useSourceUrls'
import { SourceUrlArea, hostAndPath } from '@/components/source-url-area'
import { AddUrlPopover } from '@/components/add-url-popover'
import { isAllowedUploadFile, UPLOAD_ACCEPT_ATTR } from '@/lib/upload-types'
import { resolveFirstPartyTitle, cachedFirstPartyTitle } from '@/lib/first-party-title'
import { WidgetCards } from '@/components/widget-cards'
import { ArtifactPanel } from '@/components/artifact-panel'
import { SourcesRail } from '@/components/source-rail'
import { useEdgeFade } from '@/hooks/useEdgeFade'
import { ToolActivity, scriptReportsFromSteps } from '@/components/tool-activity'
import { AnswerFooter } from '@/components/answer-footer'
import { MarkdownMessage } from '@/components/markdown-message'
import { ShareToPagesMenu } from '@/components/share-to-pages-menu'
import { StreamingText } from '@/components/streaming-text'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { getAiRequestErrorMessage, getLocalISOString, handleUsageLimitResponse, parseThreadLockedResponse } from '@/lib/utils'
import { getUserLocation } from '@/lib/location'
import { isMemoryEnabled } from '@/lib/memories'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { parseReports, type ParsedReport, type ParsedSegment } from '@/lib/report-parser'
import { parseQuestion } from '@/lib/question-parser'
import { parseTextBlocks, type ParsedTextBlock } from '@/lib/textblock-parser'
import { QuestionBlock, QuestionSkeleton } from '@/components/question-block'
import { TextBlockCard } from '@/components/text-block-card'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { ModelPicker } from '@/components/model-picker'
import { DEFAULT_MODEL, IMAGE_UNSUPPORTED_MESSAGE, getModel, normalizeModelId, type ChatModelId } from '@/lib/models'
import { extractCitedNumbers } from '@/lib/markdown'
import type { ChatMessage, CheckSourceMatch, CheckSourceState, ChartArtifact, MessageBlock, ReasoningStep, ReportArtifact, Source, TimelineStep, VerifiedClaim, WidgetData } from '@/lib/types'
import { extractClaimCandidates } from '@/lib/verify-claims'
import { canHighlightExcerpt } from '@/lib/highlight'

// A message's displayed content, in source order: narration text, inline
// <report> cards, and inline <textblock> cards (drafts/polish/email).
type RenderSegment = ParsedSegment | { type: 'textblock'; block: ParsedTextBlock }

interface ChatViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
  initialMode?: ChatModelId
  initialAttachedFileMeta?: { id: string; name: string; type: string }[]
  initialSourceUrls?: string[]
  initialSkill?: SkillId | null
  sidebarOpen?: boolean
  setSidebarOpen?: (v: boolean) => void
  // Already-fetched history for an existing thread (e.g. resumed via a /thread/{id}
  // link). When present, ChatView renders straight from it instead of firing its
  // own initial-load fetch, so there's no loading-placeholder flash.
  preloadedThread?: {
    messages: ChatMessage[]
    is_generating?: boolean
    title?: string
    is_locked?: boolean
    locked_reason?: string
    locked_at?: string
  } | null
}

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// Module-level so the array identity is stable across renders — passing a
// fresh `['...']` literal as a prop every render would re-run TextSelectionMenu's
// effect (tearing down and re-adding its document listeners) on every re-render.
const ASSISTANT_MESSAGE_SELECTORS = ['[data-selection-scope="assistant-message"]']

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

const TAB_TITLE_LIMIT = 50

function toTabTitle(chatTitle: string) {
  const trimmed = chatTitle.trim()
  if (!trimmed) return 'Omni Knows'
  return trimmed.length > TAB_TITLE_LIMIT ? `${trimmed.slice(0, TAB_TITLE_LIMIT)}…` : trimmed
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

// Shared "N things attached to this turn" chip — single item renders inline,
// multiple collapse behind a count button. Used for both uploaded files and
// external (non-omniknows.xyz) source URLs so a sent message reads as one
// visual family of "things attached to this turn" rather than two competing
// chip styles.
function MessageChipGroup({
  icon: Icon,
  items,
  noun,
}: {
  icon: React.ComponentType<{ className?: string }>
  items: { id: string; label: string }[]
  noun: string
}) {
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

  if (items.length === 0) return null

  if (items.length === 1) {
    return (
      <div className="mt-1.5 inline-flex max-w-[240px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/40 px-2.5 py-1.5 text-[12px] text-[var(--muted-foreground)]">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate min-w-0">{items[0].label}</span>
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
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {items.length} {noun}
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-1.5 w-[240px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-150">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--foreground)]">
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <span className="truncate min-w-0">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageAttachments({ files }: { files: { id: string; name: string; type: string }[] }) {
  return <MessageChipGroup icon={Paperclip} items={files.map((f) => ({ id: f.id, label: f.name }))} noun="attachments" />
}

// External source URLs align with attached-file chips (same MessageChipGroup
// look) — sent alongside the query, same "thing attached to this turn"
// treatment. First-party (omniknows.xyz) URLs are NOT included here — they
// get the full-width `ContinuedFromBanner` above the message instead (see
// below), since a small chip can't carry "you're continuing a conversation
// about this specific page" the way a banner can.
function MessageSourceUrls({ urls }: { urls: string[] }) {
  const external = urls.filter((u) => !isFirstPartyUrl(u))
  return (
    <MessageChipGroup
      icon={Link2}
      items={external.map((u) => ({ id: u, label: hostAndPath(u).host }))}
      noun="sources"
    />
  )
}

// Perplexity-style "Continued from X" banner for a first-party source_url —
// signals this turn is a follow-up on an existing Omni page rather than an
// external fetch. Title resolution is lazy/render-time (not baked into
// ChatMessage) so it works uniformly whether the URL came from the composer
// (hooks/useSourceUrls.ts, title usually already cached by send time), a
// benchmark/pages deep link, or a reloaded thread from history.
function useResolvedTitle(url: string): string | null {
  const [title, setTitle] = useState<string | null>(() => cachedFirstPartyTitle(url) ?? null)
  useEffect(() => {
    let cancelled = false
    resolveFirstPartyTitle(url).then((resolved) => {
      if (!cancelled && resolved) setTitle(resolved)
    })
    return () => { cancelled = true }
  }, [url])
  return title
}

function ContinuedFromCard({ url }: { url: string }) {
  const { host, path } = hostAndPath(url)
  const title = useResolvedTitle(url) ?? (path && path !== '/' ? path : host)
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <GitBranch className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Continued from
        </div>
        <div className="truncate text-[15px] font-semibold text-[var(--foreground)]">{title}</div>
      </div>
    </div>
  )
}

function ContinuedFromBanner({ urls }: { urls: string[] }) {
  const firstParty = urls.filter(isFirstPartyUrl)
  if (firstParty.length === 0) return null
  return (
    <div className="w-full mb-2 space-y-2">
      {firstParty.map((u) => (
        <ContinuedFromCard key={u} url={u} />
      ))}
    </div>
  )
}

/* ── Fallback follow-ups ───────────────────────────────────────────────────
   Real suggestions come from the backend, generated from the turn's own Q/A
   and in the user's own language (`follow_up` SSE event). This pool is what
   runs when that call fails, is skipped, or comes back short.

   Twenty of them, four drawn per turn, because a fixed four shown under every
   unlucky answer starts reading as chrome rather than as a suggestion. They
   are the moves that apply to almost any answer — go deeper, get concrete,
   get shorter, push back, go sideways, act on it.

   English-only, which is the known cost of this path: a fallback cannot know
   the user's language without the model call that just failed. It is a
   degraded state, not the design. */
const FALLBACK_FOLLOW_UPS = [
  'Can you explain this in more depth?',
  'Give me a concrete example.',
  'Summarize this in three bullet points.',
  'What are the strongest counterarguments?',
  'What should I read next on this?',
  'What am I still missing here?',
  'How confident are you in this?',
  'What would change your answer?',
  'Walk me through it step by step.',
  'Is there a simpler way to put it?',
  'What do the sources disagree on?',
  'How does this compare to the alternatives?',
  'What are the common mistakes here?',
  'Where does this break down?',
  'What should I do first?',
  'Can you show me the numbers?',
  'Who disagrees with this, and why?',
  'What has changed about this recently?',
  'Give me the one-sentence version.',
  'What question should I be asking instead?',
]

/**
 * Four fallback prompts, chosen by `seed` rather than by `Math.random()`.
 *
 * Random-per-render would reshuffle the list on every composer keystroke, and
 * random-per-mount would hand the same turn a different set after a reload.
 * Seeding on the turn's own identity fixes both: stable while you look at it,
 * stable when you come back to it, different from the turn above it.
 */
function fallbackFollowUps(seed: string): string[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const pool = [...FALLBACK_FOLLOW_UPS]
  const out: string[] = []
  for (let i = 0; i < 4 && pool.length; i++) {
    // Re-hash per draw so the four picks aren't a contiguous run of the pool.
    h = Math.imul(h ^ (h >>> 15), 2246822519)
    out.push(pool.splice(Math.abs(h) % pool.length, 1)[0])
  }
  return out
}

export function ChatView({
  query,
  threadId,
  onNewSearch,
  onToggleSidebar,
  isMobile = false,
  initialMode = DEFAULT_MODEL,
  initialAttachedFileMeta,
  initialSourceUrls,
  initialSkill = null,
  sidebarOpen,
  setSidebarOpen,
  preloadedThread = null,
}: ChatViewProps) {
  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { attachedFiles, setAttachedFiles, removeFile, uploadFile } = useFileUpload()
  const { sourceUrls, addUrls, removeUrl, clearUrls } = useSourceUrls()
  const sourceUrlsCountRef = useRef(0)
  sourceUrlsCountRef.current = sourceUrls.length

  // Auto-detect sweetener: a URL pasted or typed into the query box is queued
  // into source_url on its own, text left untouched — see hooks/useSourceUrls.ts
  // for the detection rules. Reads the live count via a ref (not the
  // `sourceUrls` closure) so rapid paste+type in the same tick can't both
  // read a stale pre-add count and blow past the cap.
  const autoDetectUrls = useCallback((candidates: string[]) => {
    if (candidates.length === 0) return
    if (sourceUrlsCountRef.current >= MAX_SOURCE_URLS) {
      toast.error(`You can only add up to ${MAX_SOURCE_URLS} sources per message.`)
      return
    }
    sourceUrlsCountRef.current += candidates.length
    addUrls(candidates)
  }, [addUrls])

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    preloadedThread?.messages?.length
      ? preloadedThread.messages
      : [
          {
            role: 'user',
            content: query,
            ...(initialAttachedFileMeta?.length ? { attachedFiles: initialAttachedFileMeta } : {}),
            ...(initialSourceUrls?.length ? { sourceUrls: initialSourceUrls } : {}),
          },
          { role: 'assistant', content: '' },
        ]
  )
  const [input, setInput] = useState('')
  // Text quoted via the "Ask Omni" text-selection action, shown as a chip above
  // the composer and attached to the next outgoing message as `follow_up_content`.
  const [followUpText, setFollowUpText] = useState('')
  const [isLoading, setIsLoading] = useState(() => (preloadedThread ? !!preloadedThread.is_generating : true))
  // A thread is not pinned to a model — every agent shares one checkpointer
  // and one prompt, so continuing an old thread on a new model is fine. The
  // stored value only seeds the picker, and needs normalizing because rows
  // written before this change hold 'fast' | 'pro'.
  const [mode, setMode] = useState<ChatModelId>(() =>
    preloadedThread?.messages?.[0]?.mode ? normalizeModelId(preloadedThread.messages[0].mode) : initialMode
  )
  // A user-set title (persisted backend-side) always wins over the raw first
  // query, so a rename survives a refresh / re-opening the /thread/{id} link.
  const [title, setTitle] = useState(() => preloadedThread?.title?.trim() || query)
  // Set once this conversation trips the backend's safety guard — no more
  // sends/regenerates, but the existing history stays fully visible/readable.
  const [isLocked, setIsLocked] = useState(() => !!preloadedThread?.is_locked)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titlePanelRef = useRef<HTMLDivElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  // Index of the assistant message currently being streamed (typewriter).
  const [streamingIndex, setStreamingIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [addUrlOpen, setAddUrlOpen] = useState(false)
  const [activeSkill, setActiveSkill] = useState<SkillId | null>(initialSkill)
  const [awaitingSkill, setAwaitingSkill] = useState(false)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const skillPickerRef = useRef<HTMLDivElement>(null)
  // Inline edit state for user messages
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  // Regenerating/editing a message earlier than the last one discards every
  // turn after it — confirm before doing that (redoing the last turn, the
  // common case, still goes through with no prompt).
  const [pendingRewind, setPendingRewind] = useState<{
    targetIndex: number
    newQuery?: string
    rewindMode?: ChatModelId
  } | null>(null)

  // Artifact side panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  
  const [shareDropdownOpen, setShareDropdownOpen] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState<string | null>(null)

  // "Check source" takes the sources rail over rather than opening a panel of
  // its own: which of these sources says that is a question about the list
  // already on screen, and answering it in a second surface made the reader
  // hold two copies of the same list in their head.
  const [checkSourceState, setCheckSourceState] = useState<CheckSourceState | null>(null)

  // "Check source" from the text-selection menu: `turn` is the assistant
  // message index the highlighted claim came from (see data-message-index
  // below) — the backend confines matches to sources introduced at or
  // before that turn so an early answer can't "see" a later turn's sources.
  const handleCheckSource = useCallback(
    async (claim: string, turn: number) => {
      if (!threadId) {
        toast.error('Check source is unavailable here')
        return
      }
      setCheckSourceState({ status: 'loading', claim, matches: [] })
      try {
        const response = await fetchWithAuth(`${BACKEND_URL}/check_source`, {
          method: 'POST',
          body: JSON.stringify({ thread_id: threadId, text_selection: claim, turn }),
        })
        const data = await response.json()
        if (!response.ok) {
          toast.error(data?.error || 'Failed to check source')
          setCheckSourceState(null)
          return
        }
        setCheckSourceState({ status: 'done', claim, matches: data?.matches ?? [] })
      } catch (error) {
        console.error('Check source error:', error)
        toast.error('Failed to check source')
        setCheckSourceState(null)
      }
    },
    [threadId, fetchWithAuth]
  )

  // "Verify claim" dashed underlines — a silent, best-effort background
  // sibling of the manual check-source flow above. See the block placed
  // after `syncToBackend` below (needs it in scope to persist hits).
  const verifyProcessedRef = useRef<Set<number>>(new Set())
  const prevStreamingIndexRef = useRef(-1)

  // "Ask Omni" from the text-selection menu: quote the selected passage above
  // the composer instead of sending immediately, so the user can add their
  // actual question before it goes out.
  const handleAskOmni = useCallback((text: string) => {
    setFollowUpText(text)
    setTimeout(() => inputRef.current?.focus(), 50)
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
        setAddUrlOpen(false)
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
        className={`group relative flex w-full flex-col overflow-hidden rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)] text-left transition-colors ${isReportStreaming ? 'cursor-default' : 'cursor-pointer hover:border-[var(--teal)]'}`}
      >
        {/* Hover Overlay */}
        {!isReportStreaming && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_srgb,var(--paper)_18%,transparent)] opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
            <div className="pointer-events-auto scale-95 rounded-full bg-[var(--teal)] px-5 py-2.5 text-[14px] text-[var(--accent-foreground)] shadow-lg transition-transform duration-200 group-hover:scale-100">
              {panelOpen && activeArtifactId === r.id ? 'Currently opened' : `Open ${r.title}`}
            </div>
          </div>
        )}

        {/* Top Action Bar (Perplexity style) */}
        <div className="relative z-20 flex w-full items-center justify-between border-b border-[var(--line-hair)] px-[18px] py-3">
          <div className="flex min-w-0 items-center gap-3 pr-4">
            <FileText size={16} strokeWidth={1.4} className="shrink-0 text-[var(--teal)]" />
            <span className="truncate text-[15px] leading-[1.35] text-[var(--ink)]">{r.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={isReportStreaming}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-faint)] opacity-0 transition-colors hover:bg-[var(--sand)] hover:text-[var(--teal)] group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
            >
              <Maximize2 size={13} strokeWidth={2} />
            </button>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              {isReportStreaming ? (
                <div className="flex h-7 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 text-[12.5px] text-[var(--ink-muted)]">
                  <Loader2 size={12} strokeWidth={2} className="animate-spin text-[var(--teal)]" />
                  Generating
                </div>
              ) : (
                <button
                  onClick={() => setShareDropdownOpen(shareDropdownOpen === r.id ? null : r.id)}
                  className="omni-pill h-7 gap-1.5 px-3 py-0 text-[12.5px]"
                >
                  Share <ChevronDown size={13} strokeWidth={2} className="text-[var(--muted-foreground)]" />
                </button>
              )}
              {shareDropdownOpen === r.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShareDropdownOpen(null)} />
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-[18px] border border-[var(--line-strong)] bg-[var(--paper-raised)] py-2 shadow-[0_22px_50px_-30px_color-mix(in_srgb,var(--ink)_60%,transparent)]">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`# ${r.title}\n\n${r.content}`)
                        setShareCopied(r.id)
                        toast.success('Copied full text')
                        setTimeout(() => setShareCopied(null), 1500)
                        setShareDropdownOpen(null)
                      }}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--sand)]"
                    >
                      {shareCopied === r.id ? <Check size={14} className="text-[var(--teal)]" strokeWidth={2} /> : <Copy size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />}
                      {shareCopied === r.id ? 'Copied!' : 'Copy full text'}
                    </button>
                    <div className="h-px bg-[var(--border-subtle)]/50 my-1 mx-2" />
                    <ShareToPagesMenu title={r.title || 'report'} content={r.content || ''} sources={r.sources} />
                    <div className="h-px bg-[var(--border-subtle)]/50 my-1 mx-2" />
                    <button
                      onClick={() => {
                        setShareDropdownOpen(null)
                        handleInlineDownload(r, 'markdown')
                      }}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--sand)]"
                    >
                      <Download size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />
                      Download Markdown
                    </button>
                    <button
                      onClick={() => {
                        setShareDropdownOpen(null)
                        handleInlineDownload(r, 'html')
                      }}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--sand)]"
                    >
                      <Code2 size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />
                      Download HTML
                    </button>
                    <button
                      onClick={() => {
                        setShareDropdownOpen(null)
                        handleInlineDownload(r, 'pdf')
                      }}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13.5px] text-[var(--ink)] transition-colors hover:bg-[var(--sand)]"
                    >
                      <FileText size={14} className="text-[var(--ink-faint)]" strokeWidth={2} />
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
        <div id={`inline-report-${r.id}`} className="relative isolate max-h-[320px] w-full overflow-hidden bg-[var(--paper-raised)] px-[18px] pb-10 pt-[18px] sm:px-7">
          <h1 className="omni-display relative z-0 mb-4 text-[22px] leading-[1.3] text-[var(--ink)]">
            {r.title}
          </h1>

          {/* A lede, not the whole report: the card exists to be opened. */}
          <div className="relative z-0">
            <MarkdownMessage content={stripInteractiveBlocks(r.content || 'Drafting report...')} sources={r.sources} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[92px] bg-[linear-gradient(to_top,var(--paper-raised)_30%,transparent)]" />
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

  // Source numbering is accumulated across the whole thread now (not reset
  // per turn), and the model can cite a source fetched in an earlier turn
  // without it appearing in the current message's own `sources` array. So
  // citation resolution needs a thread-wide `n -> source` map built from
  // every message's `sources`, not just the message being rendered.
  //
  // Identity matters as much as contents here: this array flows into every
  // `MarkdownMessage` in the thread as its `sources` prop. `messages` gets a
  // new identity on every streamed token, so a plain useMemo([messages])
  // would hand out a fresh array per token, breaking `memo(MarkdownMessage)`
  // for every already-finished message and re-parsing all their markdown on
  // each token. The individual `Source` objects are stable references
  // (streaming only ever appends), so an element-wise comparison against the
  // previous result lets us keep the old identity until a source is actually
  // added.
  // The thread's opening question gets the larger display size; every
  // follow-up sits a step down, so scrolling up always finds the top.
  const firstUserIndex = useMemo(() => messages.findIndex((m) => m.role === 'user'), [messages])
  const isFirstQuestion = useCallback((i: number) => i === firstUserIndex, [firstUserIndex])

  /**
   * The suggestions under the newest answer.
   *
   * The backend's, when it sent any — generated from this turn's own Q/A and
   * in the user's own language. Otherwise four drawn from the local pool,
   * seeded on the thread and turn so they hold still while you read and are
   * the same when you come back.
   */
  const activeFollowUps = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== 'assistant') continue
      if (m.followUps?.length) return m.followUps
      return fallbackFollowUps(`${threadId}:${i}`)
    }
    return fallbackFollowUps(threadId || 'omni')
  }, [messages, threadId])

  // The thread is idle when the last message is a completed assistant turn —
  // the only moment where offering a next question is help rather than noise.
  const threadIdle = useMemo(() => {
    if (isLoading || isLocked) return false
    const last = messages[messages.length - 1]
    return !!last && last.role === 'assistant' && !!last.content?.trim()
  }, [isLoading, isLocked, messages])

  // Turns, not messages: the header counts questions asked, which is what
  // "Thread · 3" means to someone scrolled halfway down it.
  const turnCount = useMemo(() => messages.filter((m) => m.role === 'user').length, [messages])

  const prevMergedSourcesRef = useRef<Source[]>([])
  const mergedSources = useMemo(() => {
    const byNumber = new Map<number, Source>()
    const unnumbered: Source[] = []
    for (const m of messages) {
      for (const s of m.sources ?? []) {
        if (typeof s.n === 'number') {
          if (!byNumber.has(s.n)) byNumber.set(s.n, s)
        } else {
          unnumbered.push(s)
        }
      }
    }
    const next = [...unnumbered, ...[...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s)]
    const prev = prevMergedSourcesRef.current
    if (prev.length === next.length && next.every((s, i) => s === prev[i])) return prev
    prevMergedSourcesRef.current = next
    return next
  }, [messages])

  // Reports stream inline as <report> blocks; questions appear as <question>
  // blocks; finished drafts (polish/translate/email) appear as <textblock>
  // blocks. All three are stripped from the displayed text and rendered separately.
  const parsedByIndex = useMemo(
    () =>
      messages.map((m, i) => {
        if (m.role !== 'assistant')
          return { text: m.content || '', reports: [] as ParsedReport[], question: null, segments: [] as RenderSegment[] }
        const withReports = parseReports(m.content || '', `m${i}`)
        const { text: questionStripped, question: textQuestion, questionPending: tqp } = parseQuestion(withReports.text)
        // <question> and <textblock> only ever appear in narration text,
        // never inside a report, so strip them out of whichever text
        // segment holds them.
        let question = textQuestion
        let questionPending = tqp
        // `text` (used for the copy/share footer) needs every tag stripped too,
        // not just the segments used for inline rendering.
        const text = parseTextBlocks(questionStripped, `m${i}`).text
        const segments: RenderSegment[] = withReports.segments
          .flatMap((seg, si): RenderSegment[] => {
            if (seg.type !== 'text') return [seg]
            const pq = parseQuestion(seg.content)
            if (pq.question) question = pq.question
            if (pq.questionPending) questionPending = true
            const { segments: tbSegs } = parseTextBlocks(pq.text, `m${i}-s${si}`)
            return tbSegs
          })
          .filter((seg) => seg.type !== 'text' || seg.content.trim())
        // A report's `[n]` citations can reach any source fetched so far in the
        // thread, so resolve against the thread-wide merged map, not just `m.sources`.
        // `verifiedClaims` is carried the same way — the panel that renders
        // this report gets it as a plain field instead of doing its own
        // lookup into `ChatMessage.reportVerifiedClaims`.
        const reports = withReports.reports.map((r) => ({ ...r, sources: mergedSources, verifiedClaims: m.reportVerifiedClaims?.[r.id] }))
        return { text, reports, question, questionPending, segments }
      }),
    [messages, mergedSources]
  )

  /**
   * Every turn's sources, keyed by the assistant message that produced them.
   *
   * Scoped per turn, never accumulated: a five-turn thread's merged list is
   * mostly sources that have nothing to do with the answer being read, and
   * stacking them turns the rail into a log. A turn's `cited` resolves
   * against the thread-wide map — a citation can legitimately reach back to a
   * source an earlier turn fetched, and turn 2 citing [2] from turn 1 should
   * show it — while `unused` stays scoped to that turn's own fetches, or
   * every earlier turn's leftovers would arrive by another route.
   */
  const sourcesByTurn = useMemo(() => {
    const out = new Map<number, { cited: Source[]; unused: Source[] }>()
    messages.forEach((m, i) => {
      if (m.role !== 'assistant') return
      const own = m.sources ?? []
      const text = parsedByIndex[i]?.text ?? m.content ?? ''
      const citedNumbers = extractCitedNumbers(text)
      const seen = new Set<number>()
      const cited: Source[] = []
      for (const n of citedNumbers) {
        if (seen.has(n)) continue
        seen.add(n)
        const src = mergedSources.find((s) => s.n === n)
        if (src) cited.push(src)
      }
      const unused = own.filter((s) => !(typeof s.n === 'number' && citedNumbers.has(s.n)))
      out.set(i, { cited, unused })
    })
    return out
  }, [messages, parsedByIndex, mergedSources])

  /**
   * Which turn the rail is describing — the one you are currently reading.
   *
   * The rail follows the scroll rather than pinning to the newest answer.
   * Scrolled back to the second question, the rail shows what the second
   * answer used; a turn that cited nothing shows nothing. Sources belong to
   * the answer in front of you, and a rail that keeps showing the last turn's
   * while you read an earlier one is actively misleading about which claims
   * rest on what.
   */
  /**
   * True between `done` and the `follow_up` that follows it.
   *
   * The section is rendered the moment the answer completes, but its contents
   * are still being generated for another half second — so it holds skeleton
   * rows for that window instead of popping fully-formed content in. Cleared
   * by the event, and again when the reader closes, so a turn whose backend
   * never sends one falls through to the local pool rather than pulsing
   * forever.
   */
  const [followUpsPending, setFollowUpsPending] = useState(false)

  const [activeTurn, setActiveTurn] = useState<number | null>(null)

  // The rail caps its height and hides its scrollbar, so without this a long
  // source list ends in a hard cut through whichever card the cap lands on.
  const railFade = useEdgeFade<HTMLElement>()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let frame = 0
    const measure = () => {
      frame = 0
      const containerTop = el.getBoundingClientRect().top
      // A third of the way down the viewport: high enough that the turn you
      // are reading has been chosen before its heading leaves the screen, low
      // enough that a heading scrolling in at the very bottom doesn't steal
      // the rail from the answer still filling it.
      const anchor = containerTop + el.clientHeight * 0.33
      let picked: number | null = null
      for (const node of el.querySelectorAll<HTMLElement>('[data-message-index]')) {
        const idx = Number(node.dataset.messageIndex)
        if (!Number.isFinite(idx)) continue
        if (node.getBoundingClientRect().top > anchor) break
        // A turn is a question and its answer; both map to the answer's
        // sources, so a user block hands the rail to the reply after it.
        if (messagesRef.current[idx]?.role === 'assistant') picked = idx
        else {
          for (let j = idx + 1; j < messagesRef.current.length; j++) {
            if (messagesRef.current[j]?.role === 'assistant') {
              picked = j
              break
            }
          }
        }
      }
      setActiveTurn(picked)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
    // Re-measure when the thread grows or the layout shifts under it.
  }, [messages.length, spacerH])

  const turnSources = useMemo(() => {
    // Default to the newest answer: on first paint, and any time the scroll
    // spy has nothing (a thread shorter than the anchor), the bottom of the
    // thread is what is on screen.
    let idx = activeTurn
    if (idx == null || !sourcesByTurn.has(idx)) {
      idx = null
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          idx = i
          break
        }
      }
    }
    if (idx == null) return { cited: [] as Source[], unused: [] as Source[], researching: false }
    // A turn still being written has cited nothing yet, so there is nothing to
    // split by — show everything it has fetched, flat.
    if (idx === streamingIndex && isLoading) {
      return { cited: messages[idx]?.sources ?? [], unused: [] as Source[], researching: true }
    }
    const entry = sourcesByTurn.get(idx)
    return { cited: entry?.cited ?? [], unused: entry?.unused ?? [], researching: false }
  }, [activeTurn, sourcesByTurn, messages, streamingIndex, isLoading])

  const hasTurnSources = turnSources.cited.length > 0 || turnSources.unused.length > 0

  // Flatten artifacts/reports across the whole conversation for the panel.
  const allArtifacts: ChartArtifact[] = messages.flatMap((m) => m.artifacts ?? [])
  const parsedReports: ParsedReport[] = useMemo(() => parsedByIndex.flatMap((p) => p.reports), [parsedByIndex])
  // Older threads stored reports as a separate array (pre inline-streaming);
  // keep rendering those so historical conversations don't lose their reports.
  // Memoized (unlike `allArtifacts`, whose consumers don't mind) because the
  // report objects flow into the panel's MarkdownMessage: a fresh object per
  // ChatView render — i.e. per composer keystroke — would swap the `sources`
  // array identity under MarkdownMessage, rebuilding its ReactMarkdown
  // component map and remounting every citation badge mid-view (replaying
  // their mount fade-in as a visible flicker while typing).
  const legacyReports: ReportArtifact[] = useMemo(
    () => messages.flatMap((m) => (m.reports ?? []).map((r) => ({ ...r, sources: r.sources ?? mergedSources, verifiedClaims: m.reportVerifiedClaims?.[r.id] }))),
    [messages, mergedSources]
  )
  // Synthetic "reports" for python_exec code steps so they can open in the same
  // artifact panel — id prefixes here must match what the two `<ToolActivity>`
  // call sites below pass as `idPrefix` for the very same steps array.
  const scriptReports: ReportArtifact[] = useMemo(
    () =>
      messages.flatMap((m, i) =>
        m.blocks && m.blocks.length > 0
          ? m.blocks.flatMap((block, bi) => (block.type === 'tools' ? scriptReportsFromSteps(block.steps, `m${i}-b${bi}`) : []))
          : scriptReportsFromSteps(m.steps, `m${i}`)
      ),
    [messages]
  )
  const allReports: ReportArtifact[] = useMemo(
    () => [...parsedReports, ...legacyReports, ...scriptReports],
    [parsedReports, legacyReports, scriptReports]
  )
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
      // Only the newest assistant turn keeps its suggestions. They are about
      // the answer in front of you and go stale the moment there is a newer
      // one, so stripping them here means older turns shed them on the next
      // sync — no migration, and the stored thread never accumulates dead
      // prompts.
      let lastAssistant = -1
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          lastAssistant = i
          break
        }
      }
      const payloadMessages = msgs.map((m, i) => {
        const withMode = i === 0 ? { ...m, mode } : m
        if (m.role !== 'assistant' || i === lastAssistant || !m.followUps) return withMode
        const { followUps: _drop, ...rest } = withMode
        return rest
      })
      const body: Record<string, unknown> = { messages: payloadMessages }
      if (syncTitle && !isUntitled(syncTitle)) body.title = syncTitle
      fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/sync`, {
        method: 'POST',
        body: JSON.stringify(body),
      }).catch(() => {})
    },
    [threadId, mode, fetchWithAuth]
  )

  // "Verify claim" dashed underlines — a silent, best-effort background
  // sibling of the manual check-source flow. Once a message finishes
  // streaming (never for history loaded from `preloadedThread` — see the
  // effect below), pick up to 5 sentences that look like checkable claims
  // and fire each through the same `/check_source` endpoint with no loading
  // state or error toast. A hit gets persisted onto `msg.verifiedClaims`
  // (span + cleaned claim text only, no match payload — that's re-fetched
  // from `/check_source` on click, which the backend caches, rather than
  // synced here too) via `setMessages` + `syncToBackend`, exactly like every
  // other field on `ChatMessage` — so the dashed underline survives a
  // refresh instead of living only in throwaway component state.
  const persistVerifiedClaim = useCallback(
    (messageIndex: number, claim: VerifiedClaim) => {
      // Read-modify-write against `messagesRef` with an EAGER ref update —
      // not a functional setMessages whose updater also fires the sync:
      // React treats updaters as pure and is allowed to re-invoke or discard
      // them (StrictMode re-runs them on purpose), so a network call inside
      // one can fire twice. Writing the ref immediately keeps two
      // confirmations landing in the same tick composing (the second read
      // already sees the first's append) instead of racing on a ref that
      // only catches up after the next render.
      const prev = messagesRef.current
      const msg = prev[messageIndex]
      if (!msg) return
      const next = prev.map((m, i) =>
        i === messageIndex ? { ...m, verifiedClaims: [...(m.verifiedClaims ?? []), claim] } : m
      )
      messagesRef.current = next
      setMessages(next)
      syncToBackend(next, titleRef.current)
    },
    [syncToBackend]
  )

  const runVerifyExtraction = useCallback(
    async (messageIndex: number, content: string) => {
      if (!threadId) return
      const candidates = extractClaimCandidates(content, 5)
      if (candidates.length === 0) return

      const CONCURRENCY = 3
      let cursor = 0
      const worker = async () => {
        while (cursor < candidates.length) {
          const candidate = candidates[cursor++]
          try {
            const response = await fetchWithAuth(`${BACKEND_URL}/check_source`, {
              method: 'POST',
              body: JSON.stringify({ thread_id: threadId, text_selection: candidate.query, turn: messageIndex }),
            })
            if (!response.ok) continue
            const data = await response.json()
            const matches: CheckSourceMatch[] = data?.matches ?? []
            // Only surface a dashed underline for an automatic (background)
            // hit when at least one match's excerpt actually locates inside
            // its chunk — an unhighlightable match here would render as a
            // mark with nothing to show. Manual checks (`handleCheckSource`)
            // are unaffected and always display every match, highlightable
            // or not.
            const hasHighlightableMatch = matches.some((m) => canHighlightExcerpt(m.chunk, m.excerpt, m.title, m.url))
            if (hasHighlightableMatch) {
              // Land each hit the moment it's confirmed rather than batching
              // behind the slowest candidate — an early sentence's dashed
              // underline shows up as soon as it's found, instead of every
              // badge in the message popping in together at the end.
              persistVerifiedClaim(messageIndex, {
                id: candidate.id,
                start: candidate.start,
                end: candidate.end,
                claim: candidate.query,
              })
            }
          } catch {
            // Silent — this is opportunistic background enrichment, not a
            // user-initiated action, so there's nothing to surface an error for.
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker))
    },
    [threadId, fetchWithAuth, persistVerifiedClaim]
  )

  // Fires once per message, right as it stops being the actively-streaming
  // one (`streamingIndex` flips away from it) — not on mount, so a thread
  // loaded from history never gets retroactively swept for claims to check
  // (whatever it already has in `verifiedClaims` from when it first streamed
  // in came along for free when the thread loaded).
  useEffect(() => {
    const prevIndex = prevStreamingIndexRef.current
    if (prevIndex !== -1 && streamingIndex === -1 && !isLoading && !verifyProcessedRef.current.has(prevIndex)) {
      verifyProcessedRef.current.add(prevIndex)
      const msg = messagesRef.current[prevIndex]
      if (msg?.role === 'assistant' && msg.content?.trim()) {
        runVerifyExtraction(prevIndex, msg.content)
      }
    }
    prevStreamingIndexRef.current = streamingIndex
  }, [streamingIndex, isLoading, runVerifyExtraction])

  // Clicking a dashed underline re-runs `/check_source` for its claim text
  // instead of relying on a cached match payload — the backend already
  // caches that lookup, so this is cheap, and it means we only ever have to
  // persist the tiny span + claim text, not the full match list too.
  const handleVerifiedClaimClick = useCallback(
    (messageIndex: number, id: string) => {
      const entry = messagesRef.current[messageIndex]?.verifiedClaims?.find((v) => v.id === id)
      if (!entry) return
      handleCheckSource(entry.claim, messageIndex)
    },
    [handleCheckSource]
  )

  // Same "verify claim" background check as above, scoped to `<report>`
  // content instead of a message's own prose. A report's `MarkdownMessage`
  // renders `report.content` (its own string), not the owning message's, so
  // its verify spans need their own offsets and their own persisted slot —
  // `ChatMessage.reportVerifiedClaims`, keyed by report id, rather than
  // reusing `verifiedClaims`. `id`s follow `parseReports`' deterministic
  // `m<messageIndex>[-b<n>]-report-<n>` scheme, so the owning message index
  // is recovered by parsing the id rather than needing it passed around.
  const reportMessageIndex = useCallback((reportId: string): number | null => {
    const m = reportId.match(/^m(\d+)/)
    return m ? Number(m[1]) : null
  }, [])

  // Same eager-ref pattern as persistVerifiedClaim above, and for the same
  // reasons (pure updaters, same-tick composition).
  const persistReportVerifiedClaim = useCallback(
    (messageIndex: number, reportId: string, claim: VerifiedClaim) => {
      const prev = messagesRef.current
      const msg = prev[messageIndex]
      if (!msg) return
      const nextForReport = [...(msg.reportVerifiedClaims?.[reportId] ?? []), claim]
      const next = prev.map((m, i) =>
        i === messageIndex
          ? { ...m, reportVerifiedClaims: { ...(m.reportVerifiedClaims ?? {}), [reportId]: nextForReport } }
          : m
      )
      messagesRef.current = next
      setMessages(next)
      syncToBackend(next, titleRef.current)
    },
    [syncToBackend]
  )

  const runReportVerifyExtraction = useCallback(
    async (messageIndex: number, reportId: string, content: string) => {
      if (!threadId) return
      const candidates = extractClaimCandidates(content, 5)
      if (candidates.length === 0) return
      const CONCURRENCY = 3
      let cursor = 0
      const worker = async () => {
        while (cursor < candidates.length) {
          const candidate = candidates[cursor++]
          try {
            const response = await fetchWithAuth(`${BACKEND_URL}/check_source`, {
              method: 'POST',
              body: JSON.stringify({ thread_id: threadId, text_selection: candidate.query, turn: messageIndex }),
            })
            if (!response.ok) continue
            const data = await response.json()
            const matches: CheckSourceMatch[] = data?.matches ?? []
            // Same highlightability gate as the message-level sweep above.
            const hasHighlightableMatch = matches.some((m) => canHighlightExcerpt(m.chunk, m.excerpt, m.title, m.url))
            if (hasHighlightableMatch) {
              persistReportVerifiedClaim(messageIndex, reportId, {
                id: candidate.id,
                start: candidate.start,
                end: candidate.end,
                claim: candidate.query,
              })
            }
          } catch {
            // Silent, same as the message-level version — opportunistic
            // background enrichment, nothing to surface an error for.
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker))
    },
    [threadId, fetchWithAuth, persistReportVerifiedClaim]
  )

  // A report can finish streaming independently of its owning message (the
  // model keeps narrating after `</report>` closes), so there's no single
  // "streamingIndex flipped away" moment to hook the way the message-level
  // effect does — instead, scan every report and fire once per report id.
  // The `verifyProcessedRef.has(messageIndex)` gate scopes the sweep to
  // turns that finished streaming *this session* (that set is only ever
  // added to by the message-level effect above, which runs earlier in the
  // same commit since effects fire in definition order): a thread opened
  // from history has complete reports everywhere, and sweeping those would
  // re-fire /check_source for content whose hits were already persisted to
  // `reportVerifiedClaims` when it originally streamed. Reports with an
  // unparseable id (the legacy `msg.reports` format predates the
  // deterministic id scheme) are skipped rather than guessed at.
  const reportVerifyProcessedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const r of allReports) {
      if (r.complete === false) continue
      if (reportVerifyProcessedRef.current.has(r.id)) continue
      const messageIndex = reportMessageIndex(r.id)
      if (messageIndex === null || !verifyProcessedRef.current.has(messageIndex)) continue
      reportVerifyProcessedRef.current.add(r.id)
      if (!r.content?.trim()) continue
      runReportVerifyExtraction(messageIndex, r.id, r.content)
    }
  }, [allReports, reportMessageIndex, runReportVerifyExtraction])

  const handleReportVerifiedClaimClick = useCallback(
    (reportId: string, id: string) => {
      const messageIndex = reportMessageIndex(reportId)
      if (messageIndex === null) return
      const entry = messagesRef.current[messageIndex]?.reportVerifiedClaims?.[reportId]?.find((v) => v.id === id)
      if (!entry) return
      handleCheckSource(entry.claim, messageIndex)
    },
    [handleCheckSource, reportMessageIndex]
  )

  // One stable callback per message index, handed to `MarkdownMessage` as
  // `onVerifiedClaimClick` below. Binding `i` inline at the render site
  // (`(id) => handleVerifiedClaimClick(i, id)`) would create a fresh
  // function every render of `ChatView` — including ones with nothing to do
  // with this message, like every keystroke in the composer — and since
  // `MarkdownMessage` folds that callback into the `components.span`
  // function it hands to `ReactMarkdown`, a new reference there makes React
  // treat the verified-claim mark as a different component type at that
  // spot and remount it: its reveal animation resets and the DOM node itself
  // gets torn down and rebuilt, which is what shows up as a flicker while
  // typing. Only rebuild the array when the message count actually changes
  // (not on every content update mid-stream, which doesn't change `.length`).
  const verifiedClaimClickHandlers = useMemo(
    () => Array.from({ length: messages.length }, (_, i) => (id: string) => handleVerifiedClaimClick(i, id)),
    [messages.length, handleVerifiedClaimClick]
  )

  // ── build personalization payload ──────────────────────────────────────
  const buildPersonalization = useCallback(async () => {
    const p: any = {}
    if (typeof window !== 'undefined') {
      const lang = localStorage.getItem('omni_response_language')
      if (lang && lang !== 'auto') p.response_language = lang
      if (isMemoryEnabled()) p.memory_enabled = true
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

      const steps: TimelineStep[] = []
      let text = ''
      // The message list as of `done`. Held because `follow_up` lands after
      // it and needs something to attach to — reading `messages` there would
      // see a stale closure from the render that started this turn.
      let settledMessages: ChatMessage[] | null = null
      // The reasoning run currently receiving tokens. A tool call (or answer
      // text) closes it, so the next reasoning token starts a NEW timeline
      // entry — that's what keeps think → tool → think chronological instead
      // of merging into one blob.
      let openReasoning: ReasoningStep | null = null
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
      const appendToolStep = (step: TimelineStep) => {
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
              openReasoning = null
              text += ev.content || ''
              if (ev.content) appendText(ev.content)
              patchAssistant()
              break
            case 'reasoning': {
              if (!ev.content) break
              if (openReasoning) {
                openReasoning.content += ev.content
              } else {
                openReasoning = { type: 'reasoning', content: ev.content, timestamp: Date.now() }
                steps.push(openReasoning)
                appendToolStep(openReasoning)
              }
              patchAssistant()
              break
            }
            case 'widget':
              console.log('[widget] received:', ev.widget, ev.data)
              widgets.push({ widget: ev.widget, data: ev.data })
              console.log('[widget] widgets array now:', widgets)
              patchAssistant()
              break
            case 'tool_call': {
              openReasoning = null
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
              // Structured cutoff (see backend core/utils/errors.py) — never
              // folded into `text` as if the assistant said it; the banner
              // communicates what happened separately (see the `msg.error`
              // render block below). Finalizes and returns immediately, same
              // as 'stopped'/'done' below — a backend error event isn't
              // always followed by a 'done' (e.g. the harmful-query gate
              // fires before generation even starts), so waiting for one
              // here would hang the turn.
              //
              // `safety_terminated` specifically means whatever streamed
              // before the cutoff (partial answer text, reasoning, tool
              // steps) is exactly the content that tripped the guard or led
              // up to it — the whole reason this turn is being cut off. Drop
              // all of it here rather than leaving it half-displayed: a
              // guard catching the leak "most of the way through" isn't a
              // partial success worth keeping half of. `generation_failed`/
              // `no_output` aren't a disclosure risk the same way, so those
              // keep whatever legitimate partial answer streamed.
              clearSlowHint()
              const isSafetyCutoff = ev.code === 'safety_terminated'
              // The backend locks the conversation server-side the instant it
              // emits this event (core/stream.py) — mirror that immediately
              // rather than waiting for the next thread fetch, so the composer
              // disables itself the moment this turn ends.
              if (isSafetyCutoff) setIsLocked(true)
              const finalMessages: ChatMessage[] = [
                ...baseHistory,
                {
                  role: 'assistant',
                  content: isSafetyCutoff ? '' : text,
                  steps: isSafetyCutoff ? [] : steps,
                  blocks: isSafetyCutoff ? [] : blocks,
                  widgets: isSafetyCutoff ? [] : widgets,
                  artifacts: isSafetyCutoff ? [] : artifacts,
                  sources: isSafetyCutoff ? [] : sources,
                  drafting: null,
                  error: {
                    code: ev.code || 'generation_failed',
                    message: ev.message || 'Something went wrong.',
                    requestId: ev.request_id,
                  },
                  ...regenTag,
                },
              ]
              setMessages(finalMessages)
              syncToBackend(finalMessages, titleRef.current)
              activeReaderRef.current = null
              setIsLoading(false)
              setStreamingIndex(-1)
              return
            }
            case 'stopped': {
              clearSlowHint()
              // NEVER rewrite `text`/`blocks` here (e.g. to normalize citation
              // placement): the backend records this turn itself server-side
              // and reconciles /sync payloads against that record by content.
              // Syncing a mutated copy fails that match and the whole turn
              // comes back DUPLICATED on the next load — one copy ours, one
              // the backend's raw record. Display cleanup belongs in
              // preprocessMarkdown (render-time), not in stored content.
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
              // Same content-immutability rule as 'stopped' above.
              const finalText =
                text || (artifacts.length ? "I've prepared a chart for you — see the panel on the right." : 'No response.')
              const finalMessages: ChatMessage[] = [
                ...baseHistory,
                { role: 'assistant', content: finalText, steps, blocks, widgets, artifacts, sources, drafting: null, ...regenTag },
              ]
              settledMessages = finalMessages
              setMessages(finalMessages)
              syncToBackend(finalMessages, titleRef.current)
              // The backend skips generation for stopped/errored turns, so
              // only wait on it when there is an answer to follow up on.
              setFollowUpsPending(!!text && !isStoppingRef.current)
              setIsLoading(false)
              setStreamingIndex(-1)
              // Deliberately NOT returning. `done` means the answer is
              // complete, not that the stream is: the backend emits
              // `follow_up` after it (see core/routers/chat.py) precisely so
              // the answer never waits on a second model call. The loop ends
              // when the reader actually closes, a beat later.
              break
            }

            case 'follow_up': {
              // Arrives after `done`, so the turn is already rendered and
              // synced — attach the suggestions to it and sync once more.
              // One extra upsert per turn, off the critical path.
              const questions: string[] = Array.isArray(ev.questions) ? ev.questions : []
              if (!questions.length || !settledMessages) break
              const settled = settledMessages
              const withFollowUps: ChatMessage[] = settled.map((m, i) =>
                i === settled.length - 1 && m.role === 'assistant'
                  ? { ...m, followUps: questions }
                  : m
              )
              settledMessages = withFollowUps
              setMessages(withFollowUps)
              syncToBackend(withFollowUps, titleRef.current)
              setFollowUpsPending(false)
              break
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
      setFollowUpsPending(false)
      setIsLoading(false)
      setStreamingIndex(-1)
    },
    [syncToBackend, title, openPanel]
  )

  // ── send a turn ────────────────────────────────────────────────────────
  const runQuery = useCallback(
    async (queryText: string, baseHistory: ChatMessage[], fileIds?: Record<string, string>[], followUpContent?: string, sourceUrls?: string[]) => {
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
        // `turn`: the array index the new assistant message will land at —
        // same value used for `setStreamingIndex` above. Every citation this
        // exchange produces is stamped with it (see core/utils/citations.py),
        // so `/check_source` can later confine a claim to sources visible by
        // its turn.
        const payload: any = { query: queryText, thread_id: threadId, model: mode, turn: baseHistory.length }
        if (Object.keys(personalization).length) payload.personalization = personalization
        if (fileIds && fileIds.length) payload.attached_file_ids = fileIds
        if (activeSkill) payload.skill = activeSkill
        if (followUpContent) payload.follow_up_content = followUpContent
        if (sourceUrls && sourceUrls.length) payload.source_url = sourceUrls

        const res = await fetchWithAuth(`${BACKEND_URL}/chat`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const lockInfo = await parseThreadLockedResponse(res)
          if (lockInfo) {
            setIsLocked(true)
            toast.error(lockInfo.message)
            throw new Error(lockInfo.message)
          }
          const handled = await handleUsageLimitResponse(res)
          const msg = handled ? 'Usage limit reached.' : getAiRequestErrorMessage(res.status)
          if (!handled) toast.error(msg)
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
    async (data: { messages?: unknown; is_generating?: boolean; title?: string; is_locked?: boolean }) => {
      if (!Array.isArray(data?.messages) || data.messages.length === 0) return false
      const loadedMessages = data.messages as ChatMessage[]
      setMessages(loadedMessages)
      if (loadedMessages[0]?.mode) setMode(normalizeModelId(loadedMessages[0].mode))
      if (data.title?.trim()) setTitle(data.title.trim())
      setIsLocked(!!data.is_locked)

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
        ...(initialSourceUrls?.length ? { sourceUrls: initialSourceUrls } : {}),
      }
      setAttachedFiles([])
      requestPin() // pin the first query to the top
      await runQuery(query, [userMsg], fileIds, undefined, initialSourceUrls?.length ? initialSourceUrls : undefined)
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

  // ── manual title editing ────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditingTitle) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isEditingTitle])

  // Close the title editor when clicking outside it or pressing Escape.
  useEffect(() => {
    if (!isEditingTitle) return
    const onMouse = (e: MouseEvent) => {
      if (titlePanelRef.current && !titlePanelRef.current.contains(e.target as Node)) {
        setIsEditingTitle(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsEditingTitle(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [isEditingTitle])

  const startEditingTitle = useCallback(() => {
    setTitleDraft(title || query)
    setIsEditingTitle(true)
  }, [title, query])

  const cancelEditingTitle = useCallback(() => {
    setIsEditingTitle(false)
  }, [])

  const commitEditingTitle = useCallback(() => {
    const trimmed = titleDraft.trim()
    const current = title || query
    if (trimmed && trimmed !== current) {
      setTitle(trimmed)
      if (threadId) {
        fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/title`, {
          method: 'PATCH',
          body: JSON.stringify({ title: trimmed }),
        }).catch(() => {})
        window.dispatchEvent(new CustomEvent('omni:title', { detail: { threadId, title: trimmed } }))
      }
    }
    setIsEditingTitle(false)
  }, [titleDraft, title, query, threadId, fetchWithAuth])

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

  /**
   * Send one of the follow-up prompts offered under a finished answer.
   *
   * Same path as `handleQuestionSubmit` rather than typing into the composer
   * and calling `handleSend`: the composer's state is the user's own draft,
   * and a suggestion should not overwrite half-typed text.
   */
  const askFollowUp = useCallback(
    async (text: string) => {
      if (isLoading || isLocked) return
      const userMsg: ChatMessage = { role: 'user', content: text }
      const baseHistory = [...messages, userMsg]
      setMessages([...baseHistory, { role: 'assistant', content: '' }])
      setStreamingIndex(baseHistory.length)
      requestPin()
      await runQuery(text, baseHistory)
    },
    [isLoading, isLocked, messages, runQuery, requestPin]
  )

  // ── rewind: regenerate or edit-and-resend ─────────────────────────────
  // `targetIndex` is the index (in `messages`) of the message being redone —
  // an assistant message for regenerate, the user message being replaced for
  // edit. Everything from that point onward is discarded and replaced, on
  // any message now, not just the last one.
  const performRewind = useCallback(
    async (targetIndex: number, newQuery?: string, rewindMode?: ChatModelId) => {
      const effectiveMode = rewindMode ?? mode

      // Always close any open edit box first
      setEditingIndex(null)

      // For regenerate: drop the target assistant message onward.
      // For edit: drop the target user message onward, then add the edited one.
      let baseHistory: ChatMessage[] = messages.slice(0, targetIndex)
      if (newQuery !== undefined) {
        baseHistory = [...baseHistory, { role: 'user', content: newQuery }]
      }

      // Tag the incoming assistant message as regenerated so we can show the label
      const regenTag: Pick<ChatMessage, 'regeneratedWith'> = { regeneratedWith: effectiveMode }

      setMessages([...baseHistory, { role: 'assistant', content: '', ...regenTag }])
      setStreamingIndex(baseHistory.length)
      setIsLoading(true)
      requestPin()

      try {
        const personalization = await buildPersonalization()
        // `turn`: same convention as a fresh /chat send — the array index the
        // now-current message will land at. The backend resolves the actual
        // rewind target from this (see core/routers/chat.py's
        // _find_rewind_target), so it works for any earlier turn, not just
        // the most recent one.
        const payload: any = { model: effectiveMode, turn: baseHistory.length }
        if (newQuery !== undefined) payload.new_query = newQuery
        if (Object.keys(personalization).length) payload.personalization = personalization

        const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/rewind`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const lockInfo = await parseThreadLockedResponse(res)
          if (lockInfo) {
            setIsLocked(true)
            toast.error(lockInfo.message)
            throw new Error(lockInfo.message)
          }
          const handled = await handleUsageLimitResponse(res)
          const msg = handled ? 'Usage limit reached.' : getAiRequestErrorMessage(res.status)
          if (!handled) toast.error(msg)
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

  const handleRewind = useCallback(
    (targetIndex: number, newQuery?: string, rewindMode?: ChatModelId) => {
      if (isLocked) return
      // Redoing the very last turn (regenerate the latest answer, or edit the
      // message you just sent) is the common case — no prompt, matches prior
      // behavior. Anything earlier also discards every turn after it, which
      // is surprising enough to confirm first.
      const isLastTurn = !messages.slice(targetIndex + 1).some((m) => m.role === 'user')
      if (isLastTurn) {
        void performRewind(targetIndex, newQuery, rewindMode)
      } else {
        setPendingRewind({ targetIndex, newQuery, rewindMode })
      }
    },
    [messages, performRewind, isLocked]
  )

  // ── send from composer ─────────────────────────────────────────────────
  const handleSend = async () => {
    if (isLoading || isLocked) return
    if (attachedFiles.some((f) => f.status === 'uploading')) {
      toast.info('Please wait for the file to finish uploading.')
      return
    }
    const readyFiles = attachedFiles.filter((f) => f.status === 'ready')
    if (!input.trim() && readyFiles.length === 0) return
    const activeFiles = readyFiles.map((f) => ({ id: f.id!, name: f.name, type: f.type }))
    const followUpAtSend = followUpText.trim()
    const sourceUrlsAtSend = sourceUrls.map((e) => e.url)
    const userMsg: ChatMessage = {
      role: 'user',
      content: input,
      ...(activeFiles.length ? { attachedFiles: activeFiles } : {}),
      ...(followUpAtSend ? { follow_up_content: followUpAtSend } : {}),
      ...(sourceUrlsAtSend.length ? { sourceUrls: sourceUrlsAtSend } : {}),
    }
    const baseHistory = [...messages, userMsg]
    const queryText = input
    setInput('')
    setAttachedFiles([])
    setFollowUpText('')
    clearUrls()
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    // Optimistically render the user's message + an empty assistant bubble so
    // the UI updates instantly, before personalization/network work begins.
    setMessages([...baseHistory, { role: 'assistant', content: '' }])
    setStreamingIndex(baseHistory.length)
    requestPin() // pin this new query to the top
    const fileIds = activeFiles.map((f) => ({ [f.id]: f.name }))
    await runQuery(queryText, baseHistory, fileIds.length ? fileIds : undefined, followUpAtSend || undefined, sourceUrlsAtSend.length ? sourceUrlsAtSend : undefined)
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

  // Shared validation before handing files to uploadFile — mirrors
  // search-home.tsx's uploadFilesFromList so a file rejected on the home
  // screen isn't silently accepted here only to 400 from the backend.
  const uploadFilesFromList = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    if (attachedFiles.length + files.length > 5) {
      toast.error('You can only attach up to 5 files per message.')
      return
    }
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Maximum size is 20MB.`)
        continue
      }
      if (!isAllowedUploadFile(file)) {
        toast.error(`${file.name} is not a supported file type.`)
        continue
      }
      // Documents are fine on every model — only images are refused, and only
      // by Omni SFT. Blocked before upload so the user finds out immediately;
      // the backend rejects it again for clients that skip this.
      if (!getModel(mode).acceptsImages && file.type.startsWith('image/')) {
        toast.error(IMAGE_UNSUPPORTED_MESSAGE)
        continue
      }
      uploadFile(file, threadId).catch((err) => console.error('Failed to upload file in UI', err))
    }
  }, [attachedFiles.length, uploadFile, threadId, mode])

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) uploadFilesFromList(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length > 0) {
      e.preventDefault()
      uploadFilesFromList(files)
      return
    }
    const text = e.clipboardData?.getData('text')
    if (text) autoDetectUrls(extractUrls(text))
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[var(--background)]">
      {/* Main column */}
      <div className="flex flex-col h-full relative min-w-0 flex-1 transition-all duration-300">
        <TextSelectionMenu
          containerRef={scrollRef}
          onFollowUp={handleAskOmni}
          onCheckSource={handleCheckSource}
          allowedSelectors={ASSISTANT_MESSAGE_SELECTORS}
        />
        {/* Header */}
        {/* ── Thread bar ───────────────────────────────────────────────────
            A left-aligned rail rather than a centered title: the mono turn
            count anchors the left edge, the thread's own question runs beside
            it as the one line of context you need while scrolled deep into an
            answer, and the title stays editable in place on hover. */}
        <header className="sticky top-0 z-30 flex h-[52px] flex-shrink-0 items-center gap-4 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_93%,transparent)] px-4 backdrop-blur-[8px] sm:px-10">
          {isMobile && (
            <button onClick={onToggleSidebar} className="-ml-2 rounded-full p-2 text-[var(--ink-muted)] hover:bg-[var(--sand)]">
              <Menu size={20} />
            </button>
          )}
          <span className="omni-eyebrow shrink-0 hidden sm:block">
            Thread · {turnCount}
          </span>
          <div className="group flex min-w-0 flex-1 items-center gap-1.5">
            <span className="min-w-0 truncate text-[14px] text-[var(--ink-muted)]">{title || query}</span>
            <button
              title="Edit title"
              onClick={startEditingTitle}
              className="shrink-0 rounded-full p-1 text-[var(--ink-fainter)] opacity-0 transition-all duration-150 hover:text-[var(--teal)] group-hover:opacity-100 active:scale-95"
            >
              <Pencil size={12} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        {/* Title editor — drops down below the header instead of editing
            in place, so typing never reflows the centered header row. Same
            width as the answer column and the same Cancel/Done affordance
            used when editing a query. */}
        {isEditingTitle && (
          <div className="absolute left-1/2 -translate-x-1/2 top-14 z-40 w-full max-w-2xl px-4 sm:px-6">
            <div
              ref={titlePanelRef}
              className="mt-3 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] shadow-lg p-3 flex flex-col gap-3"
            >
              <div className="w-full rounded-2xl bg-[var(--secondary)] px-4 py-3">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEditingTitle() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEditingTitle() }
                  }}
                  className="w-full bg-transparent text-[15px] text-[var(--foreground)] outline-none"
                />
              </div>
              <div className="flex justify-end items-center gap-2">
                <button
                  onClick={cancelEditingTitle}
                  className="px-5 py-2 text-[14px] font-medium rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!titleDraft.trim()}
                  onClick={commitEditingTitle}
                  className="px-5 py-2 text-[14px] font-medium rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="omni-thread-scroll custom-scrollbar flex-1 overflow-y-auto px-4 pt-6 sm:px-10">
          {/* ── Reading column + sources rail ─────────────────────────────
              One column, wider than a chat's: the answer body is set at 17px
              and wants ~68 characters a line, and the question headings above
              it need room to stay two lines rather than four. Past 1180px the
              thread's sources move out of the drawer and into a sticky rail
              beside the answer, where they can be read while reading. Below
              that width the rail is gone entirely rather than squeezed — a
              120px column of truncated titles is worse than the drawer. */}
          <div className="omni-thread-grid mx-auto w-full max-w-[1120px]">
          <div className="omni-thread-col mx-auto w-full min-w-0 max-w-[760px] pb-10">
            {(() => {
              return messages.map((msg, i) => (
              <div
                key={i}
                data-message-index={i}
                className={`flex flex-col items-stretch scroll-mt-20 ${
                  msg.role === 'user'
                    ? `pb-6 ${isFirstQuestion(i) ? 'pt-1' : 'pt-14'}`
                    : 'pb-8'
                }`}
              >
                {msg.role === 'user' ? (
                  <>
                  {!!msg.sourceUrls?.length && <ContinuedFromBanner urls={msg.sourceUrls} />}
                  <div className="group relative w-full">
                    {editingIndex === i ? (
                      /* Inline edit area — full width to match the answer column, with
                         Cancel/Done sitting below the box (Perplexity-style) rather than
                         crammed inside it. */
                      /* Editing keeps the serif — you are rewriting a
                         heading, and switching to 15px UI text mid-edit makes
                         the line jump. The consequence of rewriting (every
                         later turn is discarded) is stated next to the button
                         that does it, not after the fact. */
                      <div className="w-full rounded-[24px] border border-[var(--teal)] bg-[var(--paper-raised)] px-[18px] py-4">
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
                              if (editText.trim()) { setEditingIndex(null); handleRewind(i, editText.trim()) }
                            }
                          }}
                          rows={1}
                          className="omni-display w-full resize-none bg-transparent pb-3 text-[26px] leading-[1.25] text-[var(--ink)] focus:outline-none custom-scrollbar"
                          style={{ minHeight: '34px' }}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-[13px] text-[var(--ink-faint)]">
                            Rewriting this question discards the turns after it.
                          </span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setEditingIndex(null)} className="omni-pill py-[7px]">
                              Cancel
                            </button>
                            <button
                              disabled={!editText.trim()}
                              onClick={() => { if (editText.trim()) { setEditingIndex(null); handleRewind(i, editText.trim()) } }}
                              className="omni-pill omni-pill-solid py-2 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Ask again
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ── The question, as a heading ────────────────────
                         An answer engine's turn opens with the question set
                         in display serif, not a chat bubble on the right: the
                         question is the title of everything under it, and a
                         right-aligned bubble makes the eye cross the column
                         twice per turn. The first question in a thread is set
                         a size larger than its follow-ups so the thread has a
                         visible top. Copy and Edit live in pills that fade in
                         on hover, keeping the resting state pure text. */
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          {msg.follow_up_content && (
                            <div className="mb-3 flex items-start gap-1.5 border-l-2 border-[var(--line-strong)] pl-3 text-[13.5px] italic leading-snug text-[var(--ink-muted)]">
                              <MessageSquarePlus size={13} className="mt-0.5 shrink-0 opacity-70" />
                              <span className="line-clamp-3">{msg.follow_up_content}</span>
                            </div>
                          )}
                          <h2
                            className={`omni-display leading-[1.18] tracking-[-0.015em] text-[var(--ink)] [overflow-wrap:anywhere] ${
                              isFirstQuestion(i) ? 'text-[clamp(26px,3.2vw,34px)]' : 'text-[clamp(22px,2.4vw,27px)]'
                            }`}
                          >
                            {msg.content}
                          </h2>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pt-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            title="Copy question"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content)
                              toast.success('Copied')
                            }}
                            className="omni-pill px-2.5 py-1.5"
                          >
                            <Copy size={13} strokeWidth={1.6} />
                          </button>
                          {!isLoading && (
                            <button
                              title="Edit and ask again"
                              onClick={() => { setEditingIndex(i); setEditText(msg.content); setTimeout(() => editRef.current?.focus(), 0) }}
                              className="omni-pill py-1.5"
                            >
                              <Pencil size={13} strokeWidth={1.6} />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {editingIndex !== i && !!msg.attachedFiles?.length && (
                    <MessageAttachments files={msg.attachedFiles} />
                  )}
                  {editingIndex !== i && !!msg.sourceUrls?.length && (
                    <MessageSourceUrls urls={msg.sourceUrls} />
                  )}
                  </>
                ) : (
                  (() => {
                    const parsed = parsedByIndex[i] ?? { text: msg.content || '', reports: [] as ParsedReport[], segments: [] as RenderSegment[] }
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
                                  idPrefix={`m${i}-b${bi}`}
                                  onOpenScript={openPanel}
                                />
                              )
                            }
                            // Render text and any inline <report> blocks in the order
                            // they appeared, so narration after a report's closing
                            // tag shows below the report card instead of above it.
                            const { segments: blockSeg } = parseReports(block.content, `m${i}-b${bi}`)
                            return (
                              <Fragment key={`block-${i}-${bi}`}>
                                {blockSeg.map((seg, si) => {
                                  if (seg.type !== 'text') {
                                    return (
                                      <div key={`report-wrap-${i}-${bi}-${si}`} className="my-3 w-full">
                                        {renderReportCard(seg.report)}
                                      </div>
                                    )
                                  }
                                  const qText = parseQuestion(seg.content).text
                                  if (!qText) return null
                                  const { segments: tbSeg } = parseTextBlocks(qText, `m${i}-b${bi}-${si}`)
                                  return (
                                    <Fragment key={`text-${i}-${bi}-${si}`}>
                                      {tbSeg.map((tseg, ti) =>
                                        tseg.type === 'text' ? (
                                          <StreamingText
                                            key={`text-${i}-${bi}-${si}-${ti}`}
                                            content={tseg.content}
                                            animate={isCurrentlyStreaming && isLastBlock}
                                            sources={mergedSources}
                                            // `msg.verifiedClaims`' offsets are computed against the
                                            // full `msg.content` — only safe to splice into a segment
                                            // that IS the full content verbatim (no report/question/
                                            // textblock stripped it down), otherwise offsets wouldn't line up.
                                            verifiedClaims={qText === msg.content ? msg.verifiedClaims : undefined}
                                            onVerifiedClaimClick={qText === msg.content ? verifiedClaimClickHandlers[i] : undefined}
                                          />
                                        ) : (
                                          <div key={`textblock-wrap-${i}-${bi}-${si}-${ti}`} className="my-3 w-full">
                                            <TextBlockCard block={tseg.block} />
                                          </div>
                                        )
                                      )}
                                    </Fragment>
                                  )
                                })}
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
                              idPrefix={`m${i}`}
                              onOpenScript={openPanel}
                            />
                            {/* answer text and inline report/textblock cards, in source order */}
                            {parsed.segments.map((seg, si) =>
                              seg.type === 'text' ? (
                                <StreamingText
                                  key={`text-${i}-${si}`}
                                  content={seg.content}
                                  animate={i === streamingIndex}
                                  sources={mergedSources}
                                  verifiedClaims={seg.content === msg.content ? msg.verifiedClaims : undefined}
                                  onVerifiedClaimClick={seg.content === msg.content ? verifiedClaimClickHandlers[i] : undefined}
                                />
                              ) : seg.type === 'report' ? (
                                <div key={`report-wrap-${i}-${si}`} className="my-3 w-full">
                                  {renderReportCard(seg.report)}
                                </div>
                              ) : (
                                <div key={`textblock-wrap-${i}-${si}`} className="my-3 w-full">
                                  <TextBlockCard block={seg.block} />
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

                        {/* structured error banner — a turn the backend cut short
                            (safety cutoff or a generation failure), never rendered
                            as if the assistant said it. Always the destructive/red
                            treatment, whether it's a safety cutoff or a retryable
                            failure — both read as "this didn't go through". */}
                        {msg.error && !(i === streamingIndex && isLoading) && (
                          <div
                            className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] select-none border-destructive/20 bg-destructive/8 text-destructive-foreground ${parsed.text ? 'mt-4' : 'mt-1'}`}
                          >
                            {msg.error.code === 'safety_terminated' ? (
                              <ShieldAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 opacity-80" />
                            ) : (
                              <AlertTriangle size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 opacity-80" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium leading-snug">{msg.error.message}</p>
                              {msg.error.requestId && (
                                <p className="mt-1 text-[11px] opacity-60 font-mono select-text">Ref: {msg.error.requestId}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* footer: sources + actions, once the turn is complete */}
                        {(parsed.text || msg.stoppedByUser) && !(i === streamingIndex && isLoading) ? (
                          <AnswerFooter
                            content={parsed.text}
                            onRegenerate={isLocked ? undefined : (rewindMode) => handleRewind(i, undefined, rewindMode)}
                            regeneratedWith={msg.regeneratedWith}
                            isSignedIn={!!isSignedIn}
                          />
                        ) : null}
                      </div>
                    )
                  })()
                )}
              </div>
            ))})()}
            {/* ── Keep pulling the thread ────────────────────────────────
                Offered only when the thread is genuinely idle — a finished
                assistant turn, nothing streaming, nothing locked. A list of
                next questions under a half-written answer is an interruption,
                not a suggestion. Hairline rows rather than chips: these are
                sentences, and five pills of prose wrap into a mess. */}
            {threadIdle && (
              <div className="mt-10">
                <div className="omni-eyebrow mb-2.5">Keep pulling the thread</div>
                {/* The one rule that stays: it sits under the label and
                    opens the list. The rows below it are separated by their
                    own spacing — a line between every prompt turned five
                    short sentences into a table. */}
                <div className="flex flex-col border-t border-[var(--line)]">
                  {followUpsPending
                    ? /* The suggestions are generated after the answer, so
                         there is a real half-second where the section exists
                         and its contents do not. Four skeleton rows hold the
                         space at the exact row height, so nothing below jumps
                         when the questions land — and the reader can see that
                         something is coming rather than watching a block
                         appear out of nowhere. Widths vary because four
                         identical bars read as a loading bar, not as a list
                         of questions. */
                      [62, 78, 54, 70].map((w, i) => (
                        <div key={i} className="flex items-center py-3.5" aria-hidden>
                          <span
                            className="h-[11px] rounded-full bg-[var(--line-strong)]"
                            style={{
                              width: `${w}%`,
                              animation: `omni-soft-pulse 1300ms ease-in-out ${i * 130}ms infinite`,
                            }}
                          />
                        </div>
                      ))
                    : activeFollowUps.map((prompt, i) => (
                        <button
                          key={prompt}
                          onClick={() => askFollowUp(prompt)}
                          className="omni-followup-in group flex items-center justify-between gap-4 py-3.5 text-left text-[16px] text-[var(--ink-body)] transition-colors hover:text-[var(--teal)]"
                          // Staggered so the list resolves top-to-bottom the
                          // way it would be read, rather than all four
                          // arriving on the same frame.
                          style={{ animationDelay: `${i * 55}ms` }}
                        >
                          <span>{prompt}</span>
                          <span className="shrink-0 text-[var(--ink-fainter)] transition-colors group-hover:text-[var(--teal)]">
                            +
                          </span>
                        </button>
                      ))}
                </div>
              </div>
            )}

            {/* Bottom spacer: reserves room so the latest query can sit at the top. */}
            {spacerH > 0 && <div ref={spacerRef} style={{ height: spacerH }} aria-hidden className="shrink-0" />}
          </div>

          {/* ── Sources rail ─────────────────────────────────────────────
              The thread's one and only sources surface at this width, scoped
              to the turn on screen and carrying the detail the old drawer
              had: host, credibility, and the passage the answer drew on. */}
          {(hasTurnSources || checkSourceState) && (
            <aside
              ref={railFade.ref}
              style={railFade.style}
              className="omni-thread-rail omni-hide-scrollbar omni-edge-fade sticky top-6 max-h-[calc(100dvh-170px)] flex-col gap-2.5 overflow-y-auto pb-6"
            >
              <SourcesRail
                cited={turnSources.cited}
                unused={turnSources.unused}
                researching={turnSources.researching}
                checkSource={checkSourceState}
                onDismissCheck={() => setCheckSourceState(null)}
                compact
              />
            </aside>
          )}
          </div>

          {/* Below the rail's breakpoint the same list runs under the answer
              at full width, so sources are never unreachable — they just stop
              being something you read alongside the text. */}
          {(hasTurnSources || checkSourceState) && (
            <div className="omni-thread-inline-sources mx-auto w-full max-w-[760px] flex-col gap-3">
              <SourcesRail
                cited={turnSources.cited}
                unused={turnSources.unused}
                researching={turnSources.researching}
                checkSource={checkSourceState}
                onDismissCheck={() => setCheckSourceState(null)}
              />
            </div>
          )}

          {/* Clearance for the floating composer. A single spacer at the end
              of the scroll area rather than bottom padding on each block, so
              the gap stays the same whether or not the inline source list is
              the last thing in the column. */}
          <div className="h-40 shrink-0" aria-hidden />
        </div>

        {/* ── Follow-up composer ───────────────────────────────────────────
            Floating over a scrim rather than sitting behind a hard rule: the
            answer text should look like it continues under the composer, not
            like it stops at a bar. The gradient does the separating, so the
            column keeps its full measure. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-8 sm:px-10">
          {/* Left-aligned inside the same 1120px container the thread uses, so
              the composer sits under the answer column rather than drifting
              toward the middle of column-plus-rail. */}
          <div className="mx-auto w-full max-w-[1120px]">
          <div className="relative w-full max-w-[760px]">
            {/* The scrim is scoped to the reading column, not the full width.
                Spanning everything meant it also faded out the bottom of the
                sources rail sitting to the right of it — including the "read
                but not used" toggle, which is the one control down there. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[-28px] -top-8 bottom-[-40px] bg-[linear-gradient(to_top,var(--paper)_52%,transparent)]"
            />
            <div className="pointer-events-auto relative">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                uploadFilesFromList(e.dataTransfer.files);
              }}
              className={`
                relative flex flex-col rounded-[26px] bg-[var(--paper-raised)] transition-all duration-300
                ${isFocused || isDragging
                  ? 'shadow-[0_0_0_1px_var(--teal),0_14px_34px_-24px_color-mix(in_srgb,var(--ink)_50%,transparent)]'
                  : 'shadow-[0_0_0_1px_var(--line-strong),0_14px_34px_-26px_color-mix(in_srgb,var(--ink)_40%,transparent)] hover:shadow-[0_0_0_1px_var(--line-strong),0_16px_38px_-24px_color-mix(in_srgb,var(--ink)_46%,transparent)]'
                }
              `}
            >
              {(attachedFiles.length > 0 || sourceUrls.length > 0) && (
                <div className="px-5 pt-4 pb-0 animate-in fade-in slide-in-from-top-1 duration-200 space-y-2">
                  <FileUploadArea files={attachedFiles} onRemove={removeFile} />
                  <SourceUrlArea urls={sourceUrls} onRemove={removeUrl} />
                </div>
              )}
              {followUpText && (
                <div className="px-5 pt-4 pb-0 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--secondary)]/50 px-3 py-2">
                    <MessageSquarePlus size={14} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
                    <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--muted-foreground)] line-clamp-2">
                      {followUpText}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFollowUpText('')}
                      title="Remove quoted text"
                      className="shrink-0 p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  const val = e.target.value
                  if (!awaitingSkill && val === '/' && !isLoading && !isMobile) {
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
                  const completedUrl = lastCompletedUrlToken(val)
                  if (completedUrl) autoDetectUrls([completedUrl])
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                onPaste={onPaste}
                readOnly={isLocked}
                placeholder={isLocked ? 'This conversation has been locked and can no longer be continued.' : isRecording ? 'Listening...' : "Ask anything..."}
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
                      onClick={() => { if (!isLoading && !isLocked) setPlusMenuOpen(p => !p) }}
                      disabled={isLoading || isLocked}
                      className={`
                        flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                        ${!isLoading && !isLocked
                          ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                        }
                      `}
                      aria-label="Add"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    {/* Desktop: dropdown spans the full composer width (no fixed width, so
                        inset-x-0 stretches it to match the `relative` composer box above it).
                        Mobile: full-width bottom sheet, same pattern as "Select Mode". */}
                    {plusMenuOpen && (() => {
                      const menuItems = addUrlOpen ? (
                        <AddUrlPopover
                          existingCount={sourceUrls.length}
                          onAdd={addUrls}
                          onClose={() => { setAddUrlOpen(false); setPlusMenuOpen(false) }}
                        />
                      ) : (
                        <>
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

                          {/* Add URL */}
                          <button
                            type="button"
                            onClick={() => setAddUrlOpen(true)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--secondary)]/60 transition-colors rounded-lg"
                          >
                            <Link2 className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-[var(--foreground)]">Add URL</span>
                              <span className="block text-xs text-[var(--muted-foreground)]">Pages Omni should prioritize reading</span>
                            </span>
                          </button>

                          {/* Divider */}
                          <div className="mx-3 my-1 border-t border-[var(--border)]" />

                          {/* Skills — available on every model. They used to be
                              Pro-only because the Fast profile was built with a
                              two-skill roster; there is one roster now and all
                              nine skills ship with it. */}
                          {SKILLS.map((skill) => {
                            const isActive = activeSkill === skill.id
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
                        </>
                      )

                      return (
                        <>
                          {/* Desktop dropdown — expands upward, composer is pinned to the bottom of the viewport */}
                          <div className={`hidden md:block absolute inset-x-0 bottom-full mb-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-100 ${addUrlOpen ? '' : 'py-2'}`}>
                            {menuItems}
                          </div>

                          {/* Mobile bottom sheet */}
                          <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
                            <div
                              className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm animate-in fade-in duration-200"
                              onClick={() => { setPlusMenuOpen(false); setAddUrlOpen(false) }}
                            />
                            <div className="relative bg-[var(--background)] border-t border-[var(--border)] rounded-t-3xl px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-full duration-300">
                              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--border)]" />
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-[var(--foreground)]">
                                  {addUrlOpen ? '' : 'Add to your message'}
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => { setPlusMenuOpen(false); setAddUrlOpen(false) }}
                                  className="p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="flex flex-col gap-1">
                                {menuItems}
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                  <input ref={fileInputRef} type="file" multiple hidden accept={UPLOAD_ACCEPT_ATTR} onChange={onPickFiles} />

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
                  <ModelPicker
                    model={mode}
                    onChange={setMode}
                    open={modelDropdownOpen}
                    setOpen={setModelDropdownOpen}
                    isSignedIn={!!isSignedIn}
                    placement="up"
                  />

                  <button
                    type="button"
                    onClick={handleSst}
                    disabled={isLoading || isLocked}
                    className={`
                      relative flex h-9 w-9 items-center justify-center rounded-full transition-colors
                      ${!isLoading && !isLocked
                        ? isRecording
                          ? 'border border-transparent bg-[var(--teal)] text-[var(--accent-foreground)]'
                          : 'border border-[var(--line-strong)] text-[var(--ink-muted)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                        : 'border border-[var(--line)] text-[var(--ink-faint)] cursor-not-allowed'
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
                      className="omni-send h-9 w-9"
                      aria-label="Stop generation"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={isLocked || (!input.trim() && attachedFiles.filter((f) => f.status === 'ready').length === 0) || attachedFiles.some((f) => f.status === 'uploading')}
                      className="omni-send h-9 w-9"
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
              onFollowUp={handleAskOmni}
              onCheckSource={handleCheckSource}
              onVerifiedClaimClick={handleReportVerifiedClaimClick}
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
              onFollowUp={handleAskOmni}
              onCheckSource={handleCheckSource}
              onVerifiedClaimClick={handleReportVerifiedClaimClick}
            />
          </div>
        </div>
      )}

      {/* Confirm before regenerating/editing an earlier message — it discards
          every turn after it, not just the one being redone. */}
      <AlertDialog open={!!pendingRewind} onOpenChange={(open) => { if (!open) setPendingRewind(null) }}>
        <AlertDialogContent className="bg-[var(--background)] border border-[var(--border-subtle)] rounded-xl shadow-lg max-w-sm p-6">
          <AlertDialogHeader className="gap-3">
            <AlertDialogTitle className="text-[var(--foreground)] text-base font-medium flex items-center justify-center mb-1">
              Redo this message?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--muted-foreground)] text-sm text-center leading-relaxed">
              Everything after this point in the conversation will be discarded and replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 flex flex-row w-full gap-2">
            <AlertDialogCancel className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors h-10 mt-0">
              Cancel
            </AlertDialogCancel>
            <button
              onClick={() => {
                if (pendingRewind) void performRewind(pendingRewind.targetIndex, pendingRewind.newQuery, pendingRewind.rewindMode)
                setPendingRewind(null)
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg h-10 text-sm font-medium transition-colors
                bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
            >
              Continue
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
