'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { Menu, ArrowUp, ArrowRight, Mic, Square, Paperclip, Plus, BarChart3, FileText, Copy, Maximize2, ChevronDown, Check, Lock, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
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
import { parseReports, type ParsedReport } from '@/lib/report-parser'
import { parseQuestion } from '@/lib/question-parser'
import { QuestionBlock } from '@/components/question-block'
import type { AgentMode, ChatMessage, ChartArtifact, ReportArtifact, Source, ToolStep, WidgetData } from '@/lib/types'

interface ChatViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
  initialMode?: AgentMode
  initialAttachedFileMeta?: { id: string; name: string; type: string }[]
  sidebarOpen?: boolean
  setSidebarOpen?: (v: boolean) => void
}

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// Gap left above a query when it's pinned to the top of the viewport (matches the
// `scroll-mt-20` on each message: 20 × 0.25rem = 80px).
const PIN_TOP_GAP = 80

// useLayoutEffect on the server warns; fall back to useEffect there.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function isUntitled(t?: string) {
  const n = (t || '').trim().toLowerCase()
  return !n || n === 'untitled' || n === 'untitled chat'
}

export function ChatView({
  query,
  threadId,
  onNewSearch,
  onToggleSidebar,
  isMobile = false,
  initialMode = 'fast',
  initialAttachedFileMeta,
  sidebarOpen,
  setSidebarOpen,
}: ChatViewProps) {
  const { fetchWithAuth } = useApi()
  const { attachedFiles, setAttachedFiles, removeFile, uploadFile } = useFileUpload()

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'user', content: query },
    { role: 'assistant', content: '' },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState<AgentMode>(initialMode)
  const [title, setTitle] = useState(query)
  const [isRecording, setIsRecording] = useState(false)
  // Index of the assistant message currently being streamed (typewriter).
  const [streamingIndex, setStreamingIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  // Inline edit state for user messages
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Artifact side panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState<string | null>(null)

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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const initialFilesSentRef = useRef(false)

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
        if (m.role !== 'assistant') return { text: m.content || '', reports: [] as ParsedReport[], question: null }
        const withReports = parseReports(m.content || '', `m${i}`)
        const { text, question } = parseQuestion(withReports.text)
        return { text, reports: withReports.reports, question }
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

  // Pre-populate attachment chips passed from the home composer.
  useEffect(() => {
    if (initialAttachedFileMeta && initialAttachedFileMeta.length > 0) {
      setAttachedFiles(
        initialAttachedFileMeta.map((f) => ({
          id: f.id,
          file: new File([], f.name),
          name: f.name,
          size: 0,
          type: f.type,
          status: 'ready' as const,
          progress: 100,
        }))
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const decoder = new TextDecoder()
      let buffer = ''

      const steps: ToolStep[] = []
      let text = ''
      const widgets: WidgetData[] = []
      const artifacts: ChartArtifact[] = []
      let sources: Source[] = []
      // Reports stream inline as text now; only charts are still tool-drafted.
      let drafting: 'chart' | null = null

      const patchAssistant = () => {
        setMessages([
          ...baseHistory,
          { role: 'assistant', content: text, steps: [...steps], widgets: [...widgets], artifacts: [...artifacts], sources, drafting, ...regenTag },
        ])
      }

      while (true) {
        const { done, value } = await reader.read()
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
              text += ev.content || ''
              patchAssistant()
              break
            case 'widget':
              console.log('[widget] received:', ev.widget, ev.data)
              widgets.push({ widget: ev.widget, data: ev.data })
              console.log('[widget] widgets array now:', widgets)
              patchAssistant()
              break
            case 'tool_call':
              steps.push({ tool: ev.tool, args: ev.args, timestamp: Date.now() })
              patchAssistant()
              break
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
            case 'error':
              text += (text ? '\n\n' : '') + (ev.content || 'Something went wrong.')
              patchAssistant()
              break
            case 'done': {
              // The agent narrates inline (report blocks included); fall back to a
              // friendly pointer only if it made a chart with no prose at all.
              const finalText =
                text || (artifacts.length ? "I've prepared a chart for you — see the panel on the right." : 'No response.')
              const finalMessages: ChatMessage[] = [
                ...baseHistory,
                { role: 'assistant', content: finalText, steps, widgets, artifacts, sources, drafting: null, ...regenTag },
              ]
              setMessages(finalMessages)
              syncToBackend(finalMessages, title)
              setIsLoading(false)
              // Stop animating so the finished answer (incl. its last line, which
              // has no trailing newline) renders in full rather than buffered.
              setStreamingIndex(-1)
              return
            }
          }
        }
      }
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
      try {
        const personalization = await buildPersonalization()
        const payload: any = { query: queryText, thread_id: threadId, mode }
        if (Object.keys(personalization).length) payload.personalization = personalization
        if (fileIds && fileIds.length) payload.attached_file_ids = fileIds
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
      }
    },
    [threadId, mode, buildPersonalization, fetchWithAuth, handleStream]
  )

  // ── initial load: backend history, else fire the first query ───────────
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const init = async () => {
      try {
        const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            setMessages(data.messages as ChatMessage[])
            if (data?.messages?.[0]?.mode) setMode(data.messages[0].mode)
            setIsLoading(false)
            setTimeout(() => requestPin(), 50) // pin to the last user message after DOM update
            return
          }
        }
      } catch {}

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
      requestPin() // pin the first query to the top
      await runQuery(query, [userMsg], fileIds)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // ── title ──────────────────────────────────────────────────────────────
  useEffect(() => {
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
        if (newTitle && !isUntitled(newTitle)) setTitle(newTitle)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [query])

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
    const readyFiles = attachedFiles.filter((f) => f.status === 'ready')
    if ((!input.trim() && readyFiles.length === 0) || isLoading) return
    const activeFiles = readyFiles.map((f) => ({ id: f.id!, name: f.name, type: f.type }))
    const userMsg: ChatMessage = {
      role: 'user',
      content: input,
      ...(activeFiles.length ? { attachedFiles: activeFiles } : {}),
    }
    const baseHistory = [...messages, userMsg]
    const queryText = input
    setInput('')
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

  useEffect(() => () => recognitionRef.current?.stop?.(), [])

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const f of files) await uploadFile(f, threadId)
    if (fileInputRef.current) fileInputRef.current.value = ''
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
                      <div className="rounded-2xl bg-[var(--secondary)] px-4 py-2.5 text-[15px] text-foreground whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    )}
                  </div>
                ) : (
                  (() => {
                    const parsed = parsedByIndex[i] ?? { text: msg.content || '', reports: [] as ParsedReport[] }
                    // Inline <report> blocks → reader; show only the narration in chat.
                    const msgReports: ReportArtifact[] = [...parsed.reports, ...(msg.reports ?? [])]
                    const reportDrafting = parsed.reports.some((r) => !r.complete)
                    return (
                      <div className="w-full" data-selection-scope="assistant-message">
                        <WidgetCards widgets={msg.widgets} />
                        <ToolActivity
                          steps={msg.steps}
                          isStreaming={i === streamingIndex && isLoading}
                          answered={!!parsed.text}
                          drafting={reportDrafting ? 'report' : msg.drafting}
                        />
                        {/* answer text (report + question blocks stripped out) */}
                        {parsed.text ? <StreamingText content={parsed.text} animate={i === streamingIndex} /> : null}

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

                        {/* report blocks */}
                        {msgReports.length > 0 && (
                          <div className="mt-4 flex flex-col gap-3 w-full">
                            {msgReports.map((r) => {
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
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          navigator.clipboard.writeText(`# ${r.title}\n\n${r.content}`)
                                          toast.success('Copied full text')
                                        }}
                                        className="flex items-center justify-center h-7 w-7 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        <Copy size={13} strokeWidth={2} />
                                      </button>
                                      <button 
                                        disabled={isReportStreaming}
                                        className="flex items-center justify-center h-7 w-7 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed"
                                      >
                                        <Maximize2 size={13} strokeWidth={2} />
                                      </button>
                                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                          disabled={isReportStreaming}
                                          onClick={() => setDownloadDropdownOpen(downloadDropdownOpen === r.id ? null : r.id)}
                                          className="flex items-center gap-1.5 px-2.5 py-1 h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--background)] text-[12px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                          Download <ChevronDown size={13} strokeWidth={2} className="text-[var(--muted-foreground)]" />
                                        </button>
                                        {downloadDropdownOpen === r.id && (
                                          <>
                                            <div className="fixed inset-0 z-40" onClick={() => setDownloadDropdownOpen(null)} />
                                            <div className="absolute right-0 top-full mt-1.5 w-36 bg-[var(--card)] border border-[var(--border-subtle)] rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.1)] z-50 py-1 overflow-hidden">
                                              <button 
                                                onClick={() => {
                                                  setDownloadDropdownOpen(null)
                                                  const blob = new Blob([`# ${r.title}\n\n${r.content}`], { type: 'text/markdown' })
                                                  const url = URL.createObjectURL(blob)
                                                  const a = document.createElement('a')
                                                  a.href = url
                                                  a.download = `${r.title || 'report'}.md`
                                                  a.click()
                                                  URL.revokeObjectURL(url)
                                                }}
                                                className="w-full text-left px-3 py-2 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                              >
                                                Markdown
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Body Preview */}
                                  <div className="relative p-5 sm:p-7 pb-10 max-h-[360px] overflow-hidden w-full bg-[var(--background)]">
                                    <h1 className="text-[24px] leading-tight font-semibold text-[var(--foreground)] mb-5 tracking-tight opacity-90">
                                      {r.title}
                                    </h1>
                                    
                                    <div className="text-[15px] leading-relaxed text-[var(--foreground)] opacity-90">
                                      <MarkdownMessage content={r.content || 'Drafting report...'} />
                                    </div>
                                    
                                    {/* Gradient Fade-out at the bottom */}
                                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/80 to-transparent pointer-events-none z-10" />
                                  </div>
                                </div>
                              )
                            })}
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
                        {/* footer: sources + actions, once the turn is complete */}
                        {parsed.text && !(i === streamingIndex && isLoading) ? (
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
                <div className="px-5 pt-4 pb-0">
                  <FileUploadArea files={attachedFiles} onRemove={removeFile} />
                </div>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 300)}px`
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? 'Listening...' : "Ask anything..."}
                className={`w-full resize-none bg-transparent px-6 ${attachedFiles.length > 0 ? 'pt-3 pb-2' : 'pt-5 pb-2'} text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar max-h-[300px]`}
                style={{ minHeight: '52px' }}
              />

              {/* Bottom bar */}
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                {/* Left side: Upload Button */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={`
                      flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                      ${!isLoading
                        ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }
                    `}
                    aria-label="Upload files"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={onPickFiles} />
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
                            { value: 'fast' as const, label: 'Fast', desc: 'Quick answers · unlimited' },
                            { value: 'pro' as const, label: 'Pro', desc: 'Deep agent with charts & reports' },
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
                          <div className="relative bg-[var(--background)] border-t border-[var(--border)] rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-base font-semibold text-[var(--foreground)]">Select Mode</h3>
                              <button
                                type="button"
                                onClick={() => setModelDropdownOpen(false)}
                                className="p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex flex-col gap-2.5">
                              {[
                                { value: 'fast' as const, label: 'Fast', desc: 'Quick answers · unlimited' },
                                { value: 'pro' as const, label: 'Pro', desc: 'Deep agent with charts & reports' },
                              ].map((opt) => {
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setMode(opt.value)
                                      setModelDropdownOpen(false)
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left transition-colors bg-[var(--secondary)]/30 active:bg-[var(--secondary)]/60 ${mode === opt.value ? 'ring-[1.5px] ring-[var(--accent)] text-[var(--accent)]' : 'border border-[var(--border-subtle)] text-[var(--foreground)]'}`}
                                  >
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-[15px] font-medium flex items-center gap-1.5">
                                        {opt.label}
                                      </span>
                                      <span className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                                        {opt.desc}
                                      </span>
                                    </div>
                                    <div className="ml-3 shrink-0 flex items-center gap-2">
                                      {mode === opt.value ? (
                                        <div className="h-5 w-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white">
                                          <Check className="h-3.5 w-3.5" />
                                        </div>
                                      ) : (
                                        <div className="h-5 w-5 rounded-full border border-[var(--border)]" />
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

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={(!input.trim() && attachedFiles.filter((f) => f.status === 'ready').length === 0) || isLoading}
                    className={`
                      flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                      ${(input.trim() || attachedFiles.filter((f) => f.status === 'ready').length > 0) && !isLoading
                          ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }
                    `}
                    aria-label="Submit message"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
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
