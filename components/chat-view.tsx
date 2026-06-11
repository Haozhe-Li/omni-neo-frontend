'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Menu, ArrowUp, Mic, Square, Paperclip, BarChart3, FileText, PanelRight } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileUploadArea } from '@/components/file-upload-area'
import { WidgetCards } from '@/components/widget-cards'
import { ArtifactPanel } from '@/components/artifact-panel'
import { ToolActivity } from '@/components/tool-activity'
import { AnswerFooter } from '@/components/answer-footer'
import { StreamingText } from '@/components/streaming-text'
import { getAiRequestErrorMessage, getLocalISOString } from '@/lib/utils'
import { getUserLocation } from '@/lib/location'
import { getMemories, appendQueryToMemoryQueue } from '@/lib/memories'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
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

  // Artifact side panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)

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

  // Flatten artifacts/reports across the whole conversation for the panel.
  const allArtifacts: ChartArtifact[] = messages.flatMap((m) => m.artifacts ?? [])
  const allReports: ReportArtifact[] = messages.flatMap((m) => m.reports ?? [])
  const draftingReport = messages.some((m) => m.drafting === 'report')
  const hasPanelContent = allArtifacts.length > 0 || allReports.length > 0 || draftingReport

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
    async (response: Response, baseHistory: ChatMessage[]) => {
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream reader')
      const decoder = new TextDecoder()
      let buffer = ''

      const steps: ToolStep[] = []
      let text = ''
      const widgets: WidgetData[] = []
      const artifacts: ChartArtifact[] = []
      const reports: ReportArtifact[] = []
      let sources: Source[] = []
      let drafting: 'report' | 'chart' | null = null

      const patchAssistant = () => {
        setMessages([
          ...baseHistory,
          { role: 'assistant', content: text, steps: [...steps], widgets: [...widgets], artifacts: [...artifacts], reports: [...reports], sources, drafting },
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
              widgets.push({ widget: ev.widget, data: ev.data })
              patchAssistant()
              break
            case 'tool_call':
              steps.push({ tool: ev.tool, args: ev.args, timestamp: Date.now() })
              patchAssistant()
              break
            case 'drafting':
              drafting = ev.tool === 'render_chart' ? 'chart' : 'report'
              if (drafting === 'report') {
                // Reveal the panel immediately so the user sees the report is
                // being written (content arrives whole once the model finishes).
                setPanelOpen(true)
                setSidebarOpen?.(false)
              }
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
            case 'report':
              reports.push({ id: ev.id, title: ev.title, content: ev.content })
              drafting = null
              openPanel(ev.id)
              patchAssistant()
              break
            case 'error':
              text += (text ? '\n\n' : '') + (ev.content || 'Something went wrong.')
              patchAssistant()
              break
            case 'done': {
              // The agent should narrate; if it didn't, fall back to a friendly
              // pointer to whatever it produced in the panel.
              const finalText =
                text ||
                (reports.length
                  ? `I've put together **${reports[reports.length - 1].title}** for you — open it in the panel on the right.`
                  : artifacts.length
                    ? "I've prepared a chart for you — see the panel on the right."
                    : 'No response.')
              const finalMessages: ChatMessage[] = [
                ...baseHistory,
                { role: 'assistant', content: finalText, steps, widgets, artifacts, reports, sources, drafting: null },
              ]
              setMessages(finalMessages)
              syncToBackend(finalMessages, title)
              setIsLoading(false)
              return
            }
          }
        }
      }
      setIsLoading(false)
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

  // ── auto-scroll: smoothly follow the newest content while it streams, but
  //    release the moment the user scrolls up to read, and re-engage when they
  //    return to the bottom. No manual scrolling, no per-token jank.
  const stickRef = useRef(true)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickRef.current) return
    // Instant during a streaming turn (continuous, no jank); the content growing
    // a few px per token reads as a smooth follow.
    el.scrollTop = el.scrollHeight
  }, [messages])

  // The typewriter reveals text between token events (its own internal state),
  // which wouldn't re-fire the effect above — so poll a gentle follow while a
  // turn is streaming. Respects stickRef, so a manual scroll-up still pauses it.
  useEffect(() => {
    if (!isLoading) return
    const id = setInterval(() => {
      const el = scrollRef.current
      if (el && stickRef.current) el.scrollTop = el.scrollHeight
    }, 100)
    return () => clearInterval(id)
  }, [isLoading])

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
    // Optimistically render the user's message + an empty assistant bubble so
    // the UI updates instantly, before personalization/network work begins.
    setMessages([...baseHistory, { role: 'assistant', content: '' }])
    setStreamingIndex(baseHistory.length)
    stickRef.current = true // follow the new turn
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
    <div className="flex h-full w-full overflow-hidden bg-[var(--background)]">
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
            {(allArtifacts.length > 0 || allReports.length > 0) && (
              <button
                onClick={() => {
                  if (panelOpen) {
                    setPanelOpen(false)
                  } else {
                    openPanel(activeArtifactId || allReports[0]?.id || allArtifacts[0]?.id || '')
                  }
                }}
                className={`p-2 rounded-md transition-colors ${panelOpen ? 'bg-[var(--secondary)] text-foreground' : 'text-muted-foreground hover:bg-[var(--secondary)]'}`}
                title="Toggle panel"
              >
                <PanelRight size={18} />
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-8 pb-32">
            {messages.map((msg, i) => (
              <div key={i} data-message-index={i} className={`flex flex-col scroll-mt-20 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-2xl bg-[var(--secondary)] px-4 py-2.5 text-[15px] text-foreground whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full" data-selection-scope="assistant-message">
                    <ToolActivity
                      steps={msg.steps}
                      isStreaming={i === streamingIndex && isLoading}
                      answered={!!msg.content}
                      drafting={msg.drafting}
                    />
                    <WidgetCards widgets={msg.widgets} />
                    {/* answer text */}
                    {msg.content ? <StreamingText content={msg.content} animate={i === streamingIndex} /> : null}
                    {/* artifact / report chips */}
                    {(msg.artifacts?.length || msg.reports?.length) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.reports?.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => openPanel(r.id)}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                          >
                            <FileText size={15} strokeWidth={1.75} className="text-[var(--muted-foreground)]" />
                            <span className="max-w-[200px] truncate">{r.title}</span>
                          </button>
                        ))}
                        {msg.artifacts?.map((a) => (
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
                    {msg.content && !(i === streamingIndex && isLoading) ? (
                      <AnswerFooter content={msg.content} sources={msg.sources} />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Composer */}
        <div className="flex-shrink-0 border-t border-[var(--border-subtle)] bg-[var(--background)] p-3 sm:p-4">
          <div className="max-w-2xl mx-auto">
            {attachedFiles.length > 0 && <FileUploadArea files={attachedFiles} onRemove={removeFile} className="mb-2" />}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2 transition-colors focus-within:border-[var(--accent)]/40">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                rows={1}
                className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground max-h-40"
              />
              <div className="flex items-center justify-between px-1 pt-1">
                <div className="flex items-center gap-1">
                  <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors" title="Attach">
                    <Paperclip size={17} strokeWidth={1.75} />
                  </button>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={onPickFiles} />
                  <button onClick={handleSst} className={`p-1.5 rounded-md ${isRecording ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'} hover:bg-[var(--secondary)] transition-colors`} title="Voice">
                    {isRecording ? <Square size={16} /> : <Mic size={17} strokeWidth={1.75} />}
                  </button>
                </div>
                <button
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && attachedFiles.filter((f) => f.status === 'ready').length === 0)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
                >
                  <ArrowUp size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Artifact side panel — kept mounted so it slides open AND closed */}
      {hasPanelContent && (
        <div
          className={`hidden sm:block h-full flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            panelOpen ? 'w-[62%] max-w-[1240px]' : 'w-0'
          }`}
        >
          {/* fixed inner width so the content slides in rather than squishing */}
          <div className="h-full w-[62vw] max-w-[1240px]">
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
    </div>
  )
}
