'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, Layout, ChevronUp, Clock, FileText, Menu, AlertCircle, XCircle, ArrowUp, X, Copy, ThumbsUp, ThumbsDown, Share, Loader } from 'lucide-react'
import { toast } from 'sonner'
import { ThinkingTimeline } from '@/components/thinking-timeline'
import { ResearchProgress } from '@/components/research-progress'
import { FinalAnswer } from '@/components/final-answer'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { parseSSEMessage } from '@/lib/sse-parser'
import type { SSEMessage, TodoItem } from '@/lib/types'
import { getUserLocation } from '@/lib/location'
import { getLocalISOString } from '@/lib/utils'
import { appendQueryToMemoryQueue, getMemories } from '@/lib/memories'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface CanvasViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
  sidebarOpen?: boolean
  setSidebarOpen?: (open: boolean) => void
}

type CanvasPhase = 'chat' | 'researching' | 'report'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  read_to_begin_research?: boolean
  follow_up_content?: string
}

export function CanvasView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false, sidebarOpen, setSidebarOpen }: CanvasViewProps) {
  // Phase state
  const [phase, setPhase] = useState<CanvasPhase>('chat')
  const [isFading, setIsFading] = useState(false)
  const [title, setTitle] = useState(query)

  // Chat phase states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [rewrittenQuery, setRewrittenQuery] = useState('')
  const [followUpText, setFollowUpText] = useState('')

  // Research phase states
  const [messages, setMessages] = useState<SSEMessage[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showProgressBlocks, setShowProgressBlocks] = useState(true)
  const [startTime, setStartTime] = useState<number>(Date.now())
  const [executionTime, setExecutionTime] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState<number>(Date.now())

  // Report phase state
  const [finalAnswer, setFinalAnswer] = useState<{
    answer: string
    sources: Array<{ title: string; url: string }>
    assets?: string[]
    isEdited?: boolean
  } | null>(null)

  const lastMessageTime = useRef<number>(Date.now())
  const answerReceivedRef = useRef(false)
  const isCompleteRef = useRef(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)

  // Scroll to bottom of chat
  useEffect(() => {
    if (phase === 'chat' || phase === 'researching') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, phase, isChatLoading])

  const switchPhase = (to: CanvasPhase) => {
    if (to === phase) return
    setIsFading(true)
    setTimeout(() => {
      setPhase(to)
      if (to === 'report' && !isMobile && setSidebarOpen && sidebarOpen) {
        setSidebarOpen(false)
      }
      requestAnimationFrame(() => setIsFading(false))
    }, 300)
  }

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    }
  }

  const handleFeatureComingSoon = () => {
    toast.info('Feature coming soon')
  }

  // Effect to ensure sidebar is closed when entering report mode (e.g., from initial load)
  useEffect(() => {
    if (phase === 'report' && !isMobile && sidebarOpen && setSidebarOpen) {
      setSidebarOpen(false)
    }
  }, [phase, isMobile]) // Only trigger when phase or isMobile changes, not when sidebarOpen changes manually

  // Monitor manual sidebar interaction during report phase
  useEffect(() => {
    if (phase === 'report' && !isMobile && sidebarOpen) {
      switchPhase('researching')
    }
  }, [sidebarOpen, phase, isMobile])


  // SSE Handlers
  const KNOWN_TOOLS = new Set([
    'tavily_search', 'skimming_web_pages', 'get_full_text', 'verify_claim',
    'check_python_compile', 'draw_graph', 'write_file', 'read_file', 'edit_file',
    'run_python_tool', 'get_history_trend', 'get_stock_data'
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
          if (answerData.title) {
            setTitle(answerData.title)
          }
          setFinalAnswer({
            answer: answerData.answer || answerData.final_answer,
            sources: answerData.sources || answerData.final_sources || [],
            assets: answerData.assets || [],
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
        setTodos(isCompleteRef.current ? raw.args.todos.map(t => ({ ...t, status: 'completed' })) : raw.args.todos)
      }
    } else if (parsed.type === 'reasoning') {
      setMessages(prev => [...prev, parsed])
    } else if (parsed.type === 'tool' && KNOWN_TOOLS.has(parsed.tool || '')) {
      const toolArgs = (data.raw as any)?.args || {}
      if (parsed.tool === 'verify_claim' && !toolArgs.fact) return
      if ((parsed.tool === 'run_python_tool' || parsed.tool === 'check_python_compile' || parsed.tool === 'draw_graph') && !toolArgs.code) return
      setMessages(prev => [...prev, parsed])
    }
  }, [KNOWN_TOOLS])

  // Completion Effect
  useEffect(() => {
    if (((isComplete && finalAnswer) || error || hasTimedOut) && phase === 'researching') {
      if (!error && !hasTimedOut) {
        setTodos(prev => prev.map(t => ({ ...t, status: 'completed' as const })))
      }
      setShowProgressBlocks(false) // Fold it when done

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
          duration,
          chatMessages,
          rewrittenQuery,
          phase: 'researching'
        }
        localStorage.setItem(threadId, JSON.stringify(chatData))
      }
    }
  }, [isComplete, finalAnswer, error, hasTimedOut])

  const fetchHelper = async (userQuery: string, isInitial = false, prevMessages: ChatMessage[] = chatMessages, currentFollowUpText?: string) => {
    setIsChatLoading(true)

    let updatedMessages = [...prevMessages]
    if (isInitial) {
      updatedMessages = [{ role: 'user', content: userQuery, follow_up_content: currentFollowUpText }]
    } else {
      updatedMessages.push({ role: 'user', content: userQuery, follow_up_content: currentFollowUpText })
    }

    setChatMessages([...updatedMessages, { role: 'assistant', content: '...' }])

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
      const endpoint = baseUrl.endsWith('/') ? `${baseUrl}research_helper` : `${baseUrl}/research_helper`

      const payload: any = { query: userQuery, thread_id: threadId }
      if (currentFollowUpText) {
        payload.follow_up_content = currentFollowUpText
      }

      const personalization: any = {}
      if (typeof window !== 'undefined') {
        const savedLang = localStorage.getItem('omni_response_language')
        if (savedLang && savedLang !== 'auto') personalization.response_language = savedLang
        const savedEnableMemories = localStorage.getItem('omni_enable_memories')
        if (savedEnableMemories === 'true') {
          const m = getMemories()
          if (m) personalization.memories = m
        }
      }

      const locData = await getUserLocation(false)
      personalization.user_local_datetime = getLocalISOString()
      if (locData?.value) personalization.user_location = locData.value

      if (Object.keys(personalization).length > 0) payload.personalization = personalization

      appendQueryToMemoryQueue(userQuery)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error("Failed to fetch helper")

      const data = await res.json()

      const finalMessages: ChatMessage[] = [
        ...updatedMessages,
        {
          role: 'assistant',
          content: data.response || "No response.",
          read_to_begin_research: data.read_to_begin_research
        }
      ]

      setChatMessages(finalMessages)
      if (data.rewritten_query) {
        setRewrittenQuery(data.rewritten_query)
        // Auto start if user was chatting in researching phase, or just leave it for user?
        // Let's not auto-start again if we are already in deep research, it's just chatting.
      }
      setIsChatLoading(false)

      if (typeof window !== 'undefined' && threadId) {
        const storedStr = localStorage.getItem(threadId)
        let phaseToSave = phase
        if (storedStr) {
          try {
            const parsed = JSON.parse(storedStr)
            phaseToSave = parsed.phase || phase
          } catch (e) { }
        }

        const chatData = {
          thread_id: threadId,
          query,
          phase: phaseToSave,
          chatMessages: finalMessages,
          rewrittenQuery: data.rewritten_query || rewrittenQuery,
          timestamp: Date.now(),
          model: 'canvas',
          title: title || query,
          final_answer: finalAnswer,
          messages,
          todos
        }
        localStorage.setItem(threadId, JSON.stringify(chatData))
      }

    } catch (e) {
      setChatMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: "Error communicating with research helper." }
        return copy
      })
      setIsChatLoading(false)
    }
  }

  useEffect(() => {
    const initCanvas = async () => {
      // 1. Try to load from local storage
      if (typeof window !== 'undefined' && threadId) {
        try {
          const stored = localStorage.getItem(threadId)
          if (stored) {
            const data = JSON.parse(stored)
            if (data.thread_id === threadId) {
              if (data.final_answer) {
                setMessages(data.messages || [])
                setFinalAnswer(data.final_answer)
                setTodos(data.todos || [])
                if (data.duration) setExecutionTime(data.duration)
                if (data.chatMessages) setChatMessages(data.chatMessages)
                if (data.rewrittenQuery) setRewrittenQuery(data.rewrittenQuery)
                setIsComplete(true)
                isCompleteRef.current = true
                answerReceivedRef.current = true

                if (data.phase === 'report' || !data.phase) {
                  setPhase('report')
                } else {
                  setPhase(data.phase)
                }
                isInitializedRef.current = true
                return
              } else if (data.phase) {
                setPhase(data.phase)
                if (data.chatMessages) setChatMessages(data.chatMessages)
                if (data.rewrittenQuery) setRewrittenQuery(data.rewrittenQuery)
                if (data.messages) setMessages(data.messages)
                if (data.todos) setTodos(data.todos)
                if (data.phase === 'researching' && !data.isComplete) {
                  setError("Research was interrupted. Please start a new search.")
                  setIsComplete(true)
                  isCompleteRef.current = true
                }
                isInitializedRef.current = true
                return
              }
            }
          }
        } catch (e) {
          console.error("Failed to load thread from storage", e)
        }
      }

      // 2. Not found
      if (!isInitializedRef.current && chatMessages.length === 0) {
        isInitializedRef.current = true
        fetchHelper(query, true, [])
      }
    }
    initCanvas()
  }, [threadId, query])

  const fetchDeepResearch = async (activeQuery: string) => {
    try {
      const apiEndpoint = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
        ? '/api/mock-chat'
        : process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/chat` : '/api/chat'

      const personalization: any = {}
      if (typeof window !== 'undefined') {
        const savedLang = localStorage.getItem('omni_response_language')
        if (savedLang && savedLang !== 'auto') personalization.response_language = savedLang
        const savedEnableMemories = localStorage.getItem('omni_enable_memories')
        if (savedEnableMemories === 'true') {
          const m = getMemories()
          if (m) personalization.memories = m
        }
      }

      const locData = await getUserLocation(false)
      personalization.user_local_datetime = getLocalISOString()
      if (locData?.value) personalization.user_location = locData.value

      const payload: any = { query: activeQuery, thread_id: threadId }
      if (Object.keys(personalization).length > 0) payload.personalization = personalization

      appendQueryToMemoryQueue(activeQuery)

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
      setError('Connection to Chat service failed.')
      setIsComplete(true)
      isCompleteRef.current = true
    }
  }

  const handleAskOmni = (text: string) => {
    setFollowUpText(text)
    setTimeout(() => {
      const inputNode = document.getElementById('chat-input')
      if (inputNode) {
        inputNode.focus()
      }
    }, 100)
  }

  const handleChatSend = () => {
    if (!chatInput.trim() || isChatLoading) return
    const currentInput = chatInput
    const currentFollowUp = followUpText
    setChatInput('')
    setFollowUpText('')
    fetchHelper(currentInput, false, chatMessages, currentFollowUp)
  }

  const startDeepResearch = () => {
    setPhase('researching')
    setShowProgressBlocks(true)
    setStartTime(Date.now())
    lastMessageTime.current = Date.now()

    if (typeof window !== 'undefined' && threadId) {
      const chatData = JSON.parse(localStorage.getItem(threadId) || '{}')
      chatData.phase = 'researching'
      localStorage.setItem(threadId, JSON.stringify(chatData))
    }

    fetchDeepResearch(rewrittenQuery || query)
  }

  // Timeout logic
  useEffect(() => {
    if (phase !== 'researching') return
    if (isComplete || hasTimedOut) return
    const interval = setInterval(() => {
      if (Date.now() - lastMessageTime.current > 300_000) {
        setHasTimedOut(true)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [isComplete, hasTimedOut, phase])

  useEffect(() => {
    if (phase !== 'researching') return
    if (isComplete || hasTimedOut) return
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [isComplete, hasTimedOut, phase])

  const getDuration = () => {
    if (executionTime > 0) {
      const seconds = Math.floor(executionTime / 1000)
      if (seconds < 60) return `${seconds}s`
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    }
    const end = isComplete ? lastMessageTime.current : currentTime
    const durationMs = Math.max(0, end - startTime)
    const seconds = Math.floor(durationMs / 1000)
    if (seconds < 60) return `${seconds}s`
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  useEffect(() => {
    const fetchTitle = async () => {
      try {
        const apiEndpoint = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
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
        const newTitle = (typeof data === 'string' ? data : data?.title) || title
        setTitle(newTitle)
        if (typeof window !== 'undefined' && threadId) {
          const stored = localStorage.getItem(threadId)
          if (stored) {
            try {
              const chatData = JSON.parse(stored)
              chatData.title = newTitle
              localStorage.setItem(threadId, JSON.stringify(chatData))
            } catch (e) { }
          }
        }
      } catch (error) {
        console.error('Failed to fetch title:', error)
      }
    }
    fetchTitle()
  }, [query])

  return (
    <div className="h-full flex flex-col bg-[var(--background)] overflow-hidden relative" ref={containerRef}>
      <TextSelectionMenu
        containerRef={containerRef}
        showCheckSource={false}
        onFollowUp={handleAskOmni}
      />
      {!isComplete && phase === 'researching' && (
        <div className="absolute inset-0 z-0 pointer-events-none animate-flash-edges" />
      )}

      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-xl z-30">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 md:px-6 relative">
          <div className="flex items-center w-24 flex-shrink-0">
            {isMobile && (
              <button
                onClick={onToggleSidebar}
                className="p-2 -ml-2 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Menu size={20} />
              </button>
            )}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 max-w-[50%] sm:max-w-[60%] text-center pointer-events-none">
            <span className="block text-sm font-medium tracking-tight text-[var(--foreground)]/90 truncate pointer-events-auto">
              {title}
            </span>
          </div>
          <div className="w-24 flex-shrink-0 flex justify-end" />
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 flex transition-opacity duration-300 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}>

          {/* Left/Main Chat Layout */}
          <div className={`flex flex-col min-h-0 bg-[var(--background)] relative transition-all duration-300 ${phase === 'report' && !isMobile
            ? 'w-[400px] lg:w-[480px] xl:w-[550px] border-r border-[var(--border-subtle)] shrink-0'
            : 'flex-1'
            } ${phase === 'report' && isMobile ? 'hidden' : ''}`}>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-8">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`
                        max-w-[85%] rounded-2xl px-5 py-3 flex flex-col gap-2 
                        ${msg.role === 'user' ? 'bg-[var(--secondary)] text-[var(--foreground)]' : 'bg-transparent text-[var(--foreground)]'}
                      `}>
                      {msg.role === 'assistant' && msg.content === '...' ? (
                        <div className="flex flex-col gap-3 w-full py-1 min-w-[240px] sm:min-w-[320px]">
                          <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)] mb-1">
                            <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[var(--muted-foreground)] border-t-transparent animate-spin opacity-70" />
                            <span className="opacity-80">Thinking Hard...</span>
                          </div>
                          <div className="space-y-3 w-full">
                            <div className="h-3 w-full bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" />
                            <div className="h-3 w-[85%] bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                            <div className="h-3 w-[60%] bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out fill-mode-both">
                          <div className={`dark:prose-invert max-w-none ${msg.role === 'user' ? 'prose prose-sm' : 'prose prose-p:text-[16px] prose-li:text-[16px] md:prose-p:text-[15px] md:prose-li:text-[15px] prose-p:leading-[1.75] prose-li:leading-[1.75]'}`}>
                            {msg.role === 'user' && msg.follow_up_content && (
                              <div className="mb-2 pl-3 py-1.5 border-l-[3px] border-[var(--foreground)]/30 text-[var(--foreground)]/80 text-sm line-clamp-3">
                                {msg.follow_up_content}
                              </div>
                            )}
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                          {msg.role === 'assistant' && !msg.read_to_begin_research && (
                            <div className="flex items-center gap-2 mt-2 border-t border-[var(--border-subtle)] pt-2">
                              <button
                                onClick={() => handleCopy(msg.content)}
                                className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                title="Copy"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={handleFeatureComingSoon}
                                className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                title="Helpful"
                              >
                                <ThumbsUp size={14} />
                              </button>
                              <button
                                onClick={handleFeatureComingSoon}
                                className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                title="Not Helpful"
                              >
                                <ThumbsDown size={14} />
                              </button>
                              <button
                                onClick={handleFeatureComingSoon}
                                className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                title="Share"
                              >
                                <Share size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {msg.read_to_begin_research && phase === 'chat' && i === chatMessages.length - 1 && (
                        <div className="mt-5 pt-5 border-t border-[var(--border-subtle)]/60 flex flex-col items-start gap-4">
                          {rewrittenQuery && (
                            <div className="w-full bg-[var(--background)] border border-[var(--active-border)]/20 rounded-xl p-4 shadow-sm">
                              <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Layout size={14} className="opacity-70" />
                                Research Topic
                              </div>
                              <div className="text-[15px] text-[var(--foreground)] font-medium leading-relaxed">
                                {rewrittenQuery}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                            <button
                              onClick={startDeepResearch}
                              className="px-6 py-2.5 bg-[var(--accent)] text-white rounded-full text-sm font-medium hover:opacity-90 flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.02] shrink-0"
                            >
                              <Layout size={16} />
                              Start Research
                            </button>
                            <button
                              onClick={() => {
                                setFollowUpText(rewrittenQuery)
                                setTimeout(() => {
                                  const inputNode = document.getElementById('chat-input')
                                  if (inputNode) {
                                    inputNode.focus()
                                  }
                                }, 100)
                              }}
                              className="px-6 py-2.5 bg-[var(--secondary)] text-[var(--foreground)] rounded-full text-sm font-medium hover:bg-[var(--secondary)]/80 transition-colors shrink-0 flex items-center justify-center gap-2"
                            >
                              <FileText size={16} />
                              Edit Topic
                            </button>
                            <div className="text-xs text-[var(--muted-foreground)] opacity-70 flex items-center gap-1.5 sm:ml-auto justify-center sm:justify-start">
                              <Clock size={14} />
                              Takes just a few minutes
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {(phase === 'researching' || phase === 'report') && (
                  <div className="mt-8 border border-[var(--border-subtle)] bg-card/50 rounded-xl p-5 sm:p-6 shadow-sm animate-fade-in">
                    <div className={`flex flex-col ${phase === 'report' ? 'gap-4' : 'sm:flex-row sm:items-center gap-4 sm:gap-0'} justify-between mb-4 ${phase === 'report' ? '' : 'sm:mb-2'}`}>
                      <div className="flex items-start gap-3 w-full sm:w-auto overflow-hidden">
                        <div className="relative flex h-8 w-8 items-center justify-center shrink-0 overflow-hidden rounded-full bg-[var(--accent)]/20 mt-0.5">
                          {!isComplete ? (
                            <Loader className="h-4 w-4 text-[var(--accent)] animate-spin" />
                          ) : (
                            <Layout className="h-4 w-4 text-[var(--accent)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[var(--foreground)] leading-snug">
                            {isComplete ? (title || "Canvas Report Complete") : "Deep Research in Progress"}
                          </h3>
                          <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            {isComplete ? `Research completed with ${messages.length} steps` : "Please don't close this page..."}
                            {!isComplete && <span className="ml-2 font-mono text-[var(--accent)]">{getDuration()}</span>}
                          </p>
                        </div>
                      </div>
                      {isComplete ? (
                        <div className={`flex flex-col ${phase === 'report' ? '' : 'sm:flex-row'} items-stretch ${phase === 'report' ? '' : 'sm:items-center'} gap-2 sm:gap-3 shrink-0`}>
                          <button
                            onClick={() => setShowProgressBlocks(!showProgressBlocks)}
                            className="w-full sm:w-auto px-4 py-2 sm:py-2 bg-[var(--secondary)] text-[var(--foreground)] rounded-md text-sm font-medium hover:bg-[var(--secondary)]/80 transition-colors"
                          >
                            {showProgressBlocks ? 'Hide Progress' : 'Show Progress'}
                          </button>
                          {phase !== 'report' && (
                            <button
                              onClick={() => switchPhase('report')}
                              className="w-full sm:w-auto px-4 py-2 sm:py-2 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-colors shadow-sm"
                            >
                              View Report
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowProgressBlocks(!showProgressBlocks)}
                          className="w-full sm:w-auto px-4 py-2 sm:py-2 bg-[var(--secondary)] text-[var(--foreground)] rounded-md text-sm font-medium hover:bg-[var(--secondary)]/80 transition-colors shrink-0"
                        >
                          {showProgressBlocks ? 'Hide Progress' : 'Show Progress'}
                        </button>
                      )}
                    </div>

                    {showProgressBlocks && (
                      <div className="mt-6 border-t border-[var(--border-subtle)]/50 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
                        <div className="flex flex-col gap-3 min-h-0">
                          <span className="text-xs font-bold text-[var(--muted-foreground)]/70 uppercase tracking-widest pl-1">Research Plan</span>
                          <div className="flex-1 min-h-0 relative overflow-hidden bg-[var(--background)] rounded-lg border border-[var(--border-subtle)]/50">
                            <div className="absolute inset-0 overflow-y-auto px-4 py-3 custom-scrollbar">
                              <ResearchProgress todos={todos} isComplete={isComplete} />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 min-h-0">
                          <span className="text-xs font-bold text-[var(--muted-foreground)]/70 uppercase tracking-widest pl-1">Thinking Process</span>
                          <div className="flex-1 min-h-0 relative overflow-hidden bg-[var(--background)] rounded-lg border border-[var(--border-subtle)]/50">
                            <div className="absolute inset-0 overflow-y-auto px-4 py-3 custom-scrollbar">
                              <ThinkingTimeline messages={messages} isStreaming={!isComplete && !error} isComplete={isComplete} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                )}

                <div ref={chatBottomRef} className="h-4" />
              </div>
            </div>

            {/* Chat Input Area always visible in chat and researching phase */}
            <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[var(--background)] border-t border-[var(--border-subtle)]">
              <div className="max-w-2xl mx-auto relative">
                {followUpText && (
                  <div className="absolute bottom-[calc(100%+1rem)] left-0 right-0 flex items-center gap-3 mb-2 px-4 py-3 bg-[var(--secondary)] rounded-xl text-sm border border-[var(--border-subtle)] backdrop-blur-sm max-h-24 overflow-y-auto w-full shadow-sm z-10 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-[3px] self-stretch bg-[var(--accent)] rounded-full shrink-0" />
                    <p className="text-[var(--foreground)] truncate overflow-hidden whitespace-nowrap" title={followUpText}>
                      {followUpText}
                    </p>
                    <button
                      onClick={() => setFollowUpText('')}
                      className="p-1 hover:bg-[var(--muted)] rounded-md shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ml-auto"
                      title="Clear ask omni text"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <input
                  id="chat-input"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                  placeholder="Discuss the research plan..."
                  disabled={isChatLoading}
                  className="w-full bg-white dark:bg-[#121212] text-[var(--foreground)] rounded-full pl-5 pr-12 py-3.5 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-sm border border-[var(--border-subtle)]"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || isChatLoading}
                  className={`
                        absolute right-2 top-1/2 -translate-y-1/2 
                        flex items-center justify-center p-2 rounded-lg transition-all duration-200
                        ${!chatInput.trim() || isChatLoading
                      ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                      : 'bg-[var(--accent)] text-white hover:opacity-90'
                    }
                      `}
                >
                  <ArrowUp size={18} />
                </button>
              </div>
              <div className="mt-2 text-center text-[11px] sm:text-xs text-[var(--muted-foreground)]/70 px-4 select-none">
                Answers generated by AI. Check important info.
              </div>
            </div>

          </div>
          {/* Right Report Layout */}
          {phase === 'report' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)] relative">
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {finalAnswer ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-8 animate-fade-up pb-24 relative">
                    <FinalAnswer
                      answer={finalAnswer.answer}
                      sources={finalAnswer.sources}
                      assets={finalAnswer.assets}
                      title={title}
                      onBack={() => switchPhase('researching')}
                      onFollowUp={handleAskOmni}
                    />
                  </div>
                ) : (error || hasTimedOut) ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-16 animate-fade-up">
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 sm:p-12 flex flex-col items-center text-center max-w-xl mx-auto shadow-sm">
                      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                      </div>
                      <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight mb-2">
                        {hasTimedOut ? "Generation Timed Out" : "An Error Occurred"}
                      </h3>
                      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-md">
                        {error || "The research process took too long and was aborted. Please try phrasing your query differently or try again later."}
                      </p>
                      <button
                        onClick={onNewSearch}
                        className="mt-8 px-6 py-2.5 bg-[var(--background)] border border-[var(--border-subtle)] shadow-sm rounded-full text-sm font-medium hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors duration-200 text-[var(--muted-foreground)]"
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
