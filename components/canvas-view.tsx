'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, Sparkles, ChevronUp, Clock, FileText, Menu, AlertCircle, XCircle } from 'lucide-react'
import { ThinkingTimeline } from '@/components/thinking-timeline'
import { ResearchProgress } from '@/components/research-progress'
import { FinalAnswer } from '@/components/final-answer'
import { parseSSEMessage } from '@/lib/sse-parser'
import type { SSEMessage, TodoItem } from '@/lib/types'
import { getUserLocation } from '@/lib/location'
import { getLocalISOString } from '@/lib/utils'
import { appendQueryToMemoryQueue, getMemories } from '@/lib/memories'
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
    isEdited?: boolean
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
  const [executionTime, setExecutionTime] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  // When answer arrives or error occurs: mark completed, wait 1s, trigger fade to answer
  useEffect(() => {
    if (((isComplete && finalAnswer) || error || hasTimedOut) && activeView === 'steps') {
      if (!error && !hasTimedOut) {
        setTodos((prev) =>
          prev.map((t) => ({ ...t, status: 'completed' as const }))
        )
      }

      // Save to local storage
      if (typeof window !== 'undefined' && threadId && finalAnswer) {
        const duration = lastMessageTime.current - startTime
        setExecutionTime(duration)

        const chatData = {
          thread_id: threadId,
          query,
          messages,
          final_answer: finalAnswer,
          todos: todos.map(t => ({ ...t, status: 'completed' })),
          timestamp: Date.now(),
          model: 'canvas',
          title: title || query,
          duration
        }
        localStorage.setItem(threadId, JSON.stringify(chatData))
      }

      const timer = setTimeout(() => {
        if (!error && !hasTimedOut) {
          setTodos((prev) =>
            prev.map((t) => ({ ...t, status: 'completed' as const }))
          )
        }
        switchView('answer')
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isComplete, finalAnswer, error, hasTimedOut, title])

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
    'draw_graph',
    'write_file',
    'read_file',
    'edit_file',
  ])

  const handleSSELine = useCallback((data: Record<string, unknown>) => {
    lastMessageTime.current = Date.now()
    const parsed = parseSSEMessage(data)

    if (parsed.type === 'error') {
      setError(parsed.content || 'An unexpected error occurred.')
      setIsComplete(true)
      isCompleteRef.current = true
    } else if (parsed.type === 'answer') {
      if (answerReceivedRef.current) return
      answerReceivedRef.current = true

      const rawContent = data.content
      let strToParse = ''

      if (typeof rawContent === 'string') {
        strToParse = rawContent
      } else if (Array.isArray(rawContent)) {
        strToParse = rawContent.find((c: any) => c.type === 'text')?.text || ''
      }

      if (strToParse) {
        try {
          const answerData = JSON.parse(strToParse)
          setFinalAnswer({
            answer: answerData.final_answer,
            sources: answerData.final_sources || [],
          })
          setIsComplete(true)
          isCompleteRef.current = true
        } catch (e) {
          console.error("Failed to parse answer JSON", e)
        }
      }
    } else if (parsed.type === 'tool' && parsed.tool === 'write_todos') {
      const raw = data.raw as { args?: { todos?: TodoItem[] } } | undefined
      if (raw?.args && Array.isArray(raw.args.todos)) {
        setTodos(isCompleteRef.current
          ? raw.args.todos.map((t) => ({ ...t, status: 'completed' as const }))
          : raw.args.todos
        )
      }
    } else if (parsed.type === 'reasoning') {
      setMessages((prev) => [...prev, parsed])
    } else if (parsed.type === 'tool' && KNOWN_TOOLS.has(parsed.tool || '')) {
      const toolArgs = (data.raw as any)?.args || {}
      if (parsed.tool === 'verify_claim' && !toolArgs.fact) return
      if ((parsed.tool === 'run_python_tool' || parsed.tool === 'check_python_compile' || parsed.tool === 'draw_graph') && !toolArgs.code) return
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
              if (data.duration) setExecutionTime(data.duration)
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

        const personalization: any = {}
        if (typeof window !== 'undefined') {
          const savedLang = localStorage.getItem('omni_response_language')
          if (savedLang && savedLang !== 'auto') {
            personalization.response_language = savedLang
          }
          const savedEnableMemories = localStorage.getItem('omni_enable_memories')
          if (savedEnableMemories !== 'false') {
            const m = getMemories()
            if (m) {
              personalization.memories = m
            }
          }
        }

        const locData = await getUserLocation(false)

        personalization.user_local_datetime = getLocalISOString()
        if (locData?.value) {
          personalization.user_location = locData.value
        }

        const payload: any = {
          query,
          thread_id: threadId
        }

        if (Object.keys(personalization).length > 0) {
          payload.personalization = personalization
        }

        appendQueryToMemoryQueue(query)

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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
      if (Date.now() - lastMessageTime.current > 300_000) {
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
    if (executionTime > 0) {
      const seconds = Math.floor(executionTime / 1000)
      if (seconds < 60) return `${seconds}s`
      const m = Math.floor(seconds / 60)
      const s = seconds % 60
      return `${m}m ${s}s`
    }

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
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 md:px-6 relative">
          <div className="flex items-center w-24 flex-shrink-0">
            {isMobile && (
              <button
                onClick={onToggleSidebar}
                className="p-2 -ml-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Menu size={20} />
              </button>
            )}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 max-w-[50%] sm:max-w-[60%] text-center pointer-events-none">
            <span className="block text-sm font-medium tracking-tight text-foreground/90 truncate pointer-events-auto">
              {title}
            </span>
          </div>

          <div className="w-24 flex-shrink-0 flex justify-end" />
        </div>
      </header>

      {/* ── Persistent Sub-Header (Only visible on completion) ── */}
      {isComplete && (finalAnswer || error || hasTimedOut) && (
        <div className="flex-shrink-0 border-b border-border bg-card/30 backdrop-blur-md z-20 animate-fade-in">
          <div className="mx-auto max-w-[1200px] px-6 h-12 flex items-center justify-between">
            {/* Left: Summary */}
            <div className="flex items-center gap-3">
              {(error || hasTimedOut) ? (
                <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0" />
              )}
              <span className="text-xs text-foreground font-medium">
                {(error || hasTimedOut) ? `Process failed after ${messages.length} steps` : `Research completed with ${messages.length} steps`}
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
                    <span className="text-sm font-bold text-muted-foreground/70 uppercase tracking-widest">Thinking</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/5 text-muted-foreground text-[10px] font-medium font-mono">
                      {getDuration()}
                    </span>
                  </div>

                  {/* Thinking steps with top/bottom fade mask */}
                  <div
                    className="relative h-48 overflow-hidden"
                  >
                    <div
                      className="absolute inset-0 overflow-y-auto custom-scrollbar pr-2"
                      style={{
                        maskImage: isComplete ? 'none' : 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                        WebkitMaskImage: isComplete ? 'none' : 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)'
                      }}
                    >
                      <ThinkingTimeline
                        messages={messages}
                        isStreaming={isStreaming && !error}
                        isComplete={isComplete}
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
                {finalAnswer ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-8 animate-fade-up pb-24">
                    <FinalAnswer
                      answer={finalAnswer.answer}
                      sources={finalAnswer.sources}
                      title={title}
                      isEdited={finalAnswer.isEdited}
                      onAnswerEdit={(newAnswer) => {
                        setFinalAnswer(prev => prev ? { ...prev, answer: newAnswer, isEdited: true } : prev)
                        if (typeof window !== 'undefined' && threadId) {
                          try {
                            const stored = localStorage.getItem(threadId)
                            if (stored) {
                              const chatData = JSON.parse(stored)
                              if (chatData.final_answer) {
                                chatData.final_answer.answer = newAnswer
                                chatData.final_answer.isEdited = true
                                localStorage.setItem(threadId, JSON.stringify(chatData))
                              }
                            }
                          } catch (e) {
                            console.error('Failed to update storage with edited answer', e)
                          }
                        }
                      }}
                    />
                  </div>
                ) : (error || hasTimedOut) ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-16 animate-fade-up">
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 sm:p-12 flex flex-col items-center text-center max-w-xl mx-auto shadow-sm">
                      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                      </div>
                      <h3 className="text-xl font-semibold text-foreground tracking-tight mb-2">
                        {hasTimedOut ? "Generation Timed Out" : "An Error Occurred"}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                        {error || "The research process took too long and was aborted. Please try phrasing your query differently or try again later."}
                      </p>
                      <button
                        onClick={onNewSearch}
                        className="mt-8 px-6 py-2.5 bg-background border border-border shadow-sm rounded-full text-sm font-medium hover:bg-secondary hover:text-foreground transition-colors duration-200 text-muted-foreground"
                      >
                        Start Next Search
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
