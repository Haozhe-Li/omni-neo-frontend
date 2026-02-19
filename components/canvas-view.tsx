'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, Sparkles, ChevronUp, Clock, FileText, Menu } from 'lucide-react'
import { ThinkingTimeline } from '@/components/thinking-timeline'
import { ResearchProgress } from '@/components/research-progress'
import { FinalAnswer } from '@/components/final-answer'
import { parseSSEMessage } from '@/lib/sse-parser'
import type { SSEMessage, TodoItem } from '@/lib/types'

interface CanvasViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
}

type ActiveView = 'steps' | 'answer'

export function CanvasView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false }: CanvasViewProps) {
  const [messages, setMessages] = useState<SSEMessage[]>([])
  const [finalAnswer, setFinalAnswer] = useState<{
    answer: string
    sources: Array<{ title: string; url: string }>
  } | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>('steps')
  const [isFading, setIsFading] = useState(false)
  const [title, setTitle] = useState(query)
  const lastMessageTime = useRef<number>(Date.now())
  const answerReceivedRef = useRef(false)
  const isCompleteRef = useRef(false)

  // When answer arrives: mark completed, wait 1s, trigger fade to answer
  useEffect(() => {
    if (isComplete && finalAnswer && activeView === 'steps') {
      setTodos((prev) =>
        prev.map((t) => ({ ...t, status: 'completed' as const }))
      )

      // Save to local storage
      if (typeof window !== 'undefined' && threadId) {
        const chatData = {
          thread_id: threadId,
          query,
          messages,
          final_answer: finalAnswer,
          todos: todos.map(t => ({ ...t, status: 'completed' })),
          timestamp: Date.now(),
          model: 'canvas',
          title: title || query,
        }
        localStorage.setItem(threadId, JSON.stringify(chatData))
      }

      const timer = setTimeout(() => {
        setTodos((prev) =>
          prev.map((t) => ({ ...t, status: 'completed' as const }))
        )
        switchView('answer')
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isComplete, finalAnswer, title])

  const switchView = (to: ActiveView) => {
    if (to === activeView) return
    setIsFading(true)
    setTimeout(() => {
      setActiveView(to)
      requestAnimationFrame(() => {
        setIsFading(false)
      })
    }, 300)
  }

  /* ── SSE Logic ── */
  const KNOWN_TOOLS = new Set([
    'tavily_search',
    'skimming_web_pages',
    'get_full_text',
    'verify_claim',
    'check_python_compile',
    'run_python_tool',
  ])

  const handleSSELine = useCallback((data: Record<string, unknown>) => {
    lastMessageTime.current = Date.now()
    const parsed = parseSSEMessage(data)

    if (parsed.type === 'answer') {
      if (answerReceivedRef.current) return
      answerReceivedRef.current = true

      const content = data.content as Array<{ type: string; text?: string }> | undefined
      const textContent = content?.find((c) => c.type === 'text')
      if (textContent?.text) {
        try {
          const answerData = JSON.parse(textContent.text as string)
          setFinalAnswer({
            answer: answerData.final_answer,
            sources: answerData.final_sources || [],
          })
          setIsComplete(true)
          isCompleteRef.current = true
        } catch { /* parse error */ }
      }
    } else if (parsed.type === 'tool' && parsed.tool === 'write_todos') {
      const raw = data.raw as { args?: { todos?: TodoItem[] } } | undefined
      const todosData = raw?.args?.todos || []
      setTodos(isCompleteRef.current
        ? todosData.map((t) => ({ ...t, status: 'completed' as const }))
        : todosData
      )
    } else if (parsed.type === 'reasoning') {
      setMessages((prev) => [...prev, parsed])
    } else if (parsed.type === 'tool' && KNOWN_TOOLS.has(parsed.tool || '')) {
      const toolArgs = (data.raw as any)?.args || {}
      if (parsed.tool === 'verify_claim' && !toolArgs.fact) return
      if ((parsed.tool === 'run_python_tool' || parsed.tool === 'check_python_compile') && !toolArgs.code) return
      setMessages((prev) => [...prev, parsed])
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      // 1. Try to load from local storage
      if (typeof window !== 'undefined' && threadId) {
        try {
          const stored = localStorage.getItem(threadId)
          if (stored) {
            const data = JSON.parse(stored)
            // Ensure it matches the requested query or just load it?
            // Usually threadId is unique enough.
            if (data.thread_id === threadId) {
              setMessages(data.messages || [])
              setFinalAnswer(data.final_answer || null)
              setTodos(data.todos || [])
              setIsComplete(true)
              isCompleteRef.current = true
              answerReceivedRef.current = true
              if (data.final_answer) {
                setActiveView('answer')
              }
              return // Skip network fetch
            }
          }
        } catch (e) {
          console.error("Failed to load thread from storage", e)
        }
      }

      // 2. If not found, fetch from API
      try {
        const apiEndpoint =
          process.env.NEXT_PUBLIC_USE_MOCK === 'true'
            ? '/api/mock-chat'
            : process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/chat` : '/api/chat'

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, thread_id: threadId }),
        })

        if (!response.ok) throw new Error('Failed to fetch')
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) return
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              handleSSELine(data)
            } catch { /* parse error */ }
          }
        }
      } catch (error) {
        console.error('Fetch error:', error)
      }
    }
    fetchData()
  }, [query, threadId, handleSSELine])

  // Timeout logic
  useEffect(() => {
    if (isComplete || hasTimedOut) return
    const interval = setInterval(() => {
      if (Date.now() - lastMessageTime.current > 100_000) {
        setHasTimedOut(true)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [isComplete, hasTimedOut])

  const isStreaming = !isComplete && !hasTimedOut

  /* ── Timer Logic ── */
  const [startTime] = useState<number>(Date.now())
  const [currentTime, setCurrentTime] = useState<number>(Date.now())

  useEffect(() => {
    if (isComplete || hasTimedOut) return
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [isComplete, hasTimedOut])

  const getDuration = () => {
    const end = isComplete ? lastMessageTime.current : currentTime
    const durationMs = Math.max(0, end - startTime)
    const seconds = Math.floor(durationMs / 1000)
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }



  useEffect(() => {
    const fetchTitle = async () => {
      try {
        const apiEndpoint =
          process.env.NEXT_PUBLIC_USE_MOCK === 'true'
            ? '/api/mock-get-title'
            : process.env.NEXT_PUBLIC_BACKEND_URL
              ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/get_title`
              : '/api/get_title'

        if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') return;

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })

        if (!response.ok) throw new Error('Failed to fetch title')

        const data = await response.json()
        if (data && typeof data === 'string') {
          setTitle(data)
          if (typeof window !== 'undefined' && threadId) {
            const stored = localStorage.getItem(threadId)
            if (stored) {
              try {
                const chatData = JSON.parse(stored)
                chatData.title = data
                localStorage.setItem(threadId, JSON.stringify(chatData))
              } catch (e) { }
            }
          }
        } else if (data && data.title) {
          setTitle(data.title)
          if (typeof window !== 'undefined' && threadId) {
            const stored = localStorage.getItem(threadId)
            if (stored) {
              try {
                const chatData = JSON.parse(stored)
                chatData.title = data.title
                localStorage.setItem(threadId, JSON.stringify(chatData))
              } catch (e) { }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch title:', error)
      }
    }

    // Only fetch if not using mock, or if mock has a specific endpoint (omitted for now)
    fetchTitle()
  }, [query])

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      {/* Edge flashing — only when thinking (not complete) */}
      {!isComplete && (
        <div className="absolute inset-0 z-0 pointer-events-none animate-flash-edges" />
      )}


      {/* ── Global Header (Unchanged) ── */}
      <header className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-xl z-30">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-4 md:px-6">
          {isMobile && (
            <button
              onClick={onToggleSidebar}
              className="p-2 -ml-2 mr-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              <Menu size={20} />
            </button>
          )}

          <div className="flex-1 text-center">
            <span className="text-sm font-medium tracking-tight text-foreground/90 line-clamp-1 text-pretty">
              {title}
            </span>
          </div>
          <div className="w-20 sm:w-24 flex-shrink-0 flex justify-end">
            {!isComplete && (
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                <Clock className="h-3.5 w-3.5" />
                <span>{getDuration()}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Persistent Sub-Header (Only visible on completion) ── */}
      {isComplete && finalAnswer && (
        <div className="flex-shrink-0 border-b border-border bg-card/30 backdrop-blur-md z-20 animate-fade-in">
          <div className="mx-auto max-w-[1200px] px-6 h-12 flex items-center justify-between">
            {/* Left: Summary */}
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0" />
              <span className="text-xs text-foreground font-medium">
                Research completed with {messages.length} steps
              </span>
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getDuration()}
              </span>
            </div>

            {/* Right: Toggle Button */}
            <button
              onClick={() => switchView(activeView === 'answer' ? 'steps' : 'answer')}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer"
            >
              {activeView === 'answer' ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Show Progress</span>
                </>
              ) : (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Hide Progress</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Main Layout Container (Crossfade) ── */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-300 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'
            }`}
        >
          {activeView === 'steps' ? (
            /* ═══ View 1: Steps (Thinking Process) — Strict Two-Container Layout ═══ */
            /* ═══ View 1: Steps (Thinking Process) — Professional Split Layout ═══ */
            /* ═══ View 1: Steps (Thinking Process) — Minimalist Floating Layout ═══ */
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 relative z-10">

              <div className="w-full max-w-2xl px-6 flex flex-col gap-16">
                {/* Research Plan Block */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-sm font-bold text-muted-foreground/70 uppercase tracking-widest">Research Plan</span>
                    {todos.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/5 text-muted-foreground text-[10px] font-medium">
                        {todos.filter(t => t.status === 'completed').length} / {todos.length}
                      </span>
                    )}
                  </div>

                  {/* Research Plan with top/bottom fade mask (same as thinking steps) */}
                  <div className="relative h-[25vh] overflow-hidden">
                    <div
                      className="absolute inset-0 overflow-y-auto custom-scrollbar pr-2"
                    >
                      <ResearchProgress
                        todos={isComplete ? todos.map(t => ({ ...t, status: 'completed' as const })) : todos}
                        isComplete={isComplete}
                      />
                    </div>
                  </div>
                </div>

                {/* Thinking Steps Block */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-sm font-bold text-muted-foreground/70 uppercase tracking-widest">Thinking Process</span>
                    {isStreaming && (
                      <span className="relative flex h-2 w-2 ml-1">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
                      </span>
                    )}
                  </div>

                  {/* Thinking steps with top/bottom fade mask */}
                  <div
                    className="relative h-48 overflow-hidden"
                  >
                    <div
                      className="absolute inset-0 overflow-y-auto custom-scrollbar pr-2"
                      style={{
                        maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
                      }}
                    >
                      <ThinkingTimeline
                        messages={messages}
                        isStreaming={isStreaming}
                        isComplete={isComplete}
                        hasError={hasTimedOut}
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            /* ═══ View 1: Steps (Thinking Process) — Split Layout ═══ */
          ) : (
            /* ═══ View 2: Answer (Final Result) ═══ */
            <div className="flex-1 flex flex-col min-h-0 bg-background relative">
              {/* Scrollable Answer Content */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {finalAnswer && (
                  <div className="mx-auto max-w-[1200px] px-6 py-8 animate-fade-up pb-24">
                    <FinalAnswer
                      answer={finalAnswer.answer}
                      sources={finalAnswer.sources}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
