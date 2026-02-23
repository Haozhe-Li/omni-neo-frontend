'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Layout, Clock, FileText, Menu, AlertCircle, ArrowUp, X, Copy, ThumbsUp, ThumbsDown, Share, Loader } from 'lucide-react'
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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  read_to_begin_research?: boolean
  follow_up_content?: string
}

// A single deep-research session embedded inline
interface ResearchBlock {
  id: string
  query: string
  messages: SSEMessage[]
  todos: TodoItem[]
  isComplete: boolean
  error: string | null
  hasTimedOut: boolean
  startTime: number
  executionTime: number
  showProgress: boolean
  finalAnswer: {
    answer: string
    sources: Array<{ title: string; url: string }>
    assets?: string[]
  } | null
  title: string
}

export function CanvasView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false, sidebarOpen, setSidebarOpen }: CanvasViewProps) {
  const [title, setTitle] = useState(query)
  const [isFading, setIsFading] = useState(false)

  // Which research block's report is shown in right panel (-1 = none)
  const [reportBlockIdx, setReportBlockIdx] = useState(-1)
  const isReportOpen = reportBlockIdx >= 0

  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [rewrittenQuery, setRewrittenQuery] = useState('')
  const [followUpText, setFollowUpText] = useState('')

  // Research blocks (one per "Start Research" click)
  const [researchBlocks, setResearchBlocks] = useState<ResearchBlock[]>([])
  // Which chat message index triggered which research block
  const [researchTriggerIndex, setResearchTriggerIndex] = useState<number[]>([])

  // Active / currently-streaming block index (-1 = none)
  const [activeResearchIdx, setActiveResearchIdx] = useState(-1)
  const [currentTime, setCurrentTime] = useState(Date.now())

  const lastMessageTime = useRef<number>(Date.now())
  const answerReceivedRef = useRef(false)
  const isCompleteRef = useRef(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)

  // Scroll to bottom whenever chat or research changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, researchBlocks, isChatLoading])

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    }
  }

  const handleFeatureComingSoon = () => {
    toast.info('Feature coming soon')
  }

  const handleAskOmni = (text: string) => {
    setFollowUpText(text)
    setTimeout(() => {
      const inputNode = document.getElementById('chat-input')
      if (inputNode) inputNode.focus()
    }, 100)
  }

  const handleShare = async (blockIdx: number, duration: string) => {
    const block = researchBlocks[blockIdx]
    if (!block || !block.finalAnswer) return null

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: block.finalAnswer.answer,
          sources: block.finalAnswer.sources,
          assets: block.finalAnswer.assets,
          title: block.title,
          duration,
        }),
      })

      if (!res.ok) throw new Error('Failed to publish')
      const { id } = await res.json()
      const url = `${window.location.origin}/publish/${id}`

      if (typeof navigator !== 'undefined') {
        await navigator.clipboard.writeText(url)
        toast.success('Share link copied!')
      }
      return url
    } catch (error) {
      console.error('Share failed:', error)
      toast.error('Failed to create share link')
      return null
    }
  }

  // ── Open/close report split-screen ────────────────────────────────
  const openReport = (blockIdx: number) => {
    setIsFading(true)
    setTimeout(() => {
      setReportBlockIdx(blockIdx)
      if (!isMobile && setSidebarOpen && sidebarOpen) setSidebarOpen(false)
      requestAnimationFrame(() => setIsFading(false))
    }, 250)
  }

  const closeReport = () => {
    setIsFading(true)
    setTimeout(() => {
      setReportBlockIdx(-1)
      requestAnimationFrame(() => setIsFading(false))
    }, 250)
  }

  // Monitor sidebar: if it's manually opened while report is showing, close the report
  useEffect(() => {
    if (isReportOpen && !isMobile && sidebarOpen) {
      closeReport()
    }
  }, [sidebarOpen, isMobile])

  // ── SSE helper ─────────────────────────────────────────────────────
  const KNOWN_TOOLS = new Set([
    'tavily_search', 'skimming_web_pages', 'get_full_text', 'verify_claim',
    'check_python_compile', 'draw_graph', 'write_file', 'read_file', 'edit_file',
    'run_python_tool', 'get_history_trend', 'get_stock_data'
  ])

  const makeSSEHandler = useCallback((blockIdx: number) => {
    return (data: Record<string, unknown>) => {
      lastMessageTime.current = Date.now()
      const parsed = parseSSEMessage(data)

      if (parsed.type === 'error') {
        setResearchBlocks(prev => {
          const copy = [...prev]
          copy[blockIdx] = { ...copy[blockIdx], error: parsed.content || 'An unexpected error occurred.', isComplete: true }
          return copy
        })
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
            const newTitle = answerData.title || query
            if (answerData.title) setTitle(answerData.title)

            const fa = {
              answer: answerData.answer || answerData.final_answer,
              sources: answerData.sources || answerData.final_sources || [],
              assets: answerData.assets || [],
            }

            setResearchBlocks(prev => {
              const copy = [...prev]
              copy[blockIdx] = {
                ...copy[blockIdx],
                finalAnswer: fa,
                isComplete: true,
                title: newTitle,
                executionTime: Date.now() - copy[blockIdx].startTime,
                showProgress: false,
              }
              return copy
            })
            isCompleteRef.current = true
          } catch (e) {
            console.error('Failed to parse answer JSON', e)
          }
        }
      } else if (parsed.type === 'tool' && parsed.tool === 'write_todos') {
        const raw = data.raw as { args?: { todos?: TodoItem[] } } | undefined
        if (raw?.args && Array.isArray(raw.args.todos)) {
          setResearchBlocks(prev => {
            const copy = [...prev]
            const isComplete = isCompleteRef.current
            copy[blockIdx] = {
              ...copy[blockIdx],
              todos: isComplete ? raw!.args!.todos!.map(t => ({ ...t, status: 'completed' })) : raw!.args!.todos!
            }
            return copy
          })
        }
      } else if (parsed.type === 'reasoning') {
        setResearchBlocks(prev => {
          const copy = [...prev]
          copy[blockIdx] = { ...copy[blockIdx], messages: [...copy[blockIdx].messages, parsed] }
          return copy
        })
      } else if (parsed.type === 'tool' && KNOWN_TOOLS.has(parsed.tool || '')) {
        const toolArgs = (data.raw as any)?.args || {}
        if (parsed.tool === 'verify_claim' && !toolArgs.fact) return
        if ((parsed.tool === 'run_python_tool' || parsed.tool === 'check_python_compile' || parsed.tool === 'draw_graph') && !toolArgs.code) return
        setResearchBlocks(prev => {
          const copy = [...prev]
          copy[blockIdx] = { ...copy[blockIdx], messages: [...copy[blockIdx].messages, parsed] }
          return copy
        })
      }
    }
  }, [KNOWN_TOOLS, query])

  // ── Tick clock for active research block ───────────────────────────
  useEffect(() => {
    if (activeResearchIdx < 0) return
    const block = researchBlocks[activeResearchIdx]
    if (!block || block.isComplete || block.hasTimedOut) return
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [activeResearchIdx, researchBlocks])

  // ── Timeout watchdog ───────────────────────────────────────────────
  useEffect(() => {
    if (activeResearchIdx < 0) return
    const block = researchBlocks[activeResearchIdx]
    if (!block || block.isComplete || block.hasTimedOut) return
    const iv = setInterval(() => {
      if (Date.now() - lastMessageTime.current > 300_000) {
        setResearchBlocks(prev => {
          const copy = [...prev]
          copy[activeResearchIdx] = { ...copy[activeResearchIdx], hasTimedOut: true, isComplete: true }
          return copy
        })
        isCompleteRef.current = true
      }
    }, 5000)
    return () => clearInterval(iv)
  }, [activeResearchIdx, researchBlocks])

  const getDurationForBlock = (block: ResearchBlock) => {
    if (block.executionTime > 0) {
      const s = Math.floor(block.executionTime / 1000)
      if (s < 60) return `${s}s`
      return `${Math.floor(s / 60)}m ${s % 60}s`
    }
    const end = block.isComplete ? lastMessageTime.current : currentTime
    const s = Math.floor(Math.max(0, end - block.startTime) / 1000)
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  // ── Chat helper ────────────────────────────────────────────────────
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
      if (currentFollowUpText) payload.follow_up_content = currentFollowUpText

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
      if (!res.ok) throw new Error('Failed to fetch helper')
      const data = await res.json()

      const finalMessages: ChatMessage[] = [
        ...updatedMessages,
        {
          role: 'assistant',
          content: data.response || 'No response.',
          read_to_begin_research: data.read_to_begin_research
        }
      ]
      setChatMessages(finalMessages)
      if (data.rewritten_query) setRewrittenQuery(data.rewritten_query)
      setIsChatLoading(false)

      if (typeof window !== 'undefined' && threadId) {
        const stored = localStorage.getItem(threadId)
        let chatData: any = {}
        if (stored) { try { chatData = JSON.parse(stored) } catch { } }
        chatData = {
          ...chatData,
          thread_id: threadId,
          query,
          chatMessages: finalMessages,
          rewrittenQuery: data.rewritten_query || rewrittenQuery,
          researchBlocks,
          researchTriggerIndex,
          timestamp: Date.now(),
          model: 'canvas',
          title: title || query,
        }
        localStorage.setItem(threadId, JSON.stringify(chatData))
      }
    } catch {
      setChatMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: 'Error communicating with research helper.' }
        return copy
      })
      setIsChatLoading(false)
    }
  }

  // ── Init from local storage ────────────────────────────────────────
  useEffect(() => {
    const initCanvas = async () => {
      if (typeof window !== 'undefined' && threadId) {
        try {
          const stored = localStorage.getItem(threadId)
          if (stored) {
            const data = JSON.parse(stored)
            if (data.thread_id === threadId) {
              if (data.chatMessages) setChatMessages(data.chatMessages)
              if (data.rewrittenQuery) setRewrittenQuery(data.rewrittenQuery)
              if (data.title) setTitle(data.title)

              if (data.researchBlocks && Array.isArray(data.researchBlocks)) {
                setResearchBlocks(data.researchBlocks)
                setResearchTriggerIndex(data.researchTriggerIndex || [])
              } else if (data.final_answer) {
                // Legacy: single research session
                const block: ResearchBlock = {
                  id: 'legacy',
                  query: data.rewrittenQuery || data.query || query,
                  messages: data.messages || [],
                  todos: (data.todos || []).map((t: any) => ({ ...t, status: 'completed' })),
                  isComplete: true,
                  error: null,
                  hasTimedOut: false,
                  startTime: data.timestamp || Date.now(),
                  executionTime: data.duration || 0,
                  showProgress: false,
                  finalAnswer: data.final_answer,
                  title: data.title || query,
                }
                setResearchBlocks([block])
                setResearchTriggerIndex([data.chatMessages ? data.chatMessages.length - 1 : 0])
                isCompleteRef.current = true
                answerReceivedRef.current = true
              }
              isInitializedRef.current = true
              return
            }
          }
        } catch { }
      }
      if (!isInitializedRef.current && chatMessages.length === 0) {
        isInitializedRef.current = true
        fetchHelper(query, true, [])
      }
    }
    initCanvas()
  }, [threadId, query])

  // ── Persist research blocks to localStorage when a block completes ─
  useEffect(() => {
    if (typeof window === 'undefined' || !threadId || researchBlocks.length === 0) return
    // Only persist when at least one block is complete
    if (!researchBlocks.some(b => b.isComplete)) return
    try {
      const stored = localStorage.getItem(threadId)
      if (stored) {
        const chatData = JSON.parse(stored)
        chatData.researchBlocks = researchBlocks
        chatData.researchTriggerIndex = researchTriggerIndex
        localStorage.setItem(threadId, JSON.stringify(chatData))
      }
    } catch { }
  }, [researchBlocks, researchTriggerIndex, threadId])

  // ── Start a new deep research session ─────────────────────────────
  const startDeepResearch = async (triggeredByMsgIdx: number, researchQuery?: string) => {
    const blockIdx = researchBlocks.length
    answerReceivedRef.current = false
    isCompleteRef.current = false

    const activeQuery = researchQuery || rewrittenQuery || query
    const newBlock: ResearchBlock = {
      id: `research-${Date.now()}`,
      query: activeQuery,
      messages: [],
      todos: [],
      isComplete: false,
      error: null,
      hasTimedOut: false,
      startTime: Date.now(),
      executionTime: 0,
      showProgress: true,
      finalAnswer: null,
      title: '',
    }
    setResearchBlocks(prev => [...prev, newBlock])
    setResearchTriggerIndex(prev => [...prev, triggeredByMsgIdx])
    setActiveResearchIdx(blockIdx)
    lastMessageTime.current = Date.now()

    await fetchDeepResearch(activeQuery, blockIdx)
  }

  // ── Stream a deep research request ────────────────────────────────
  const fetchDeepResearch = async (activeQuery: string, blockIdx: number) => {
    const handler = makeSSEHandler(blockIdx)
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
            handler(data)
          } catch { }
        }
      }
    } catch {
      setResearchBlocks(prev => {
        const copy = [...prev]
        if (copy[blockIdx]) {
          copy[blockIdx] = { ...copy[blockIdx], error: 'Connection to Chat service failed.', isComplete: true }
        }
        return copy
      })
      isCompleteRef.current = true
    }
  }

  const handleChatSend = () => {
    if (!chatInput.trim() || isChatLoading) return
    const currentInput = chatInput
    const currentFollowUp = followUpText
    setChatInput('')
    setFollowUpText('')
    fetchHelper(currentInput, false, chatMessages, currentFollowUp)
  }

  const getDurationForTitle = async () => {
    try {
      const apiEndpoint = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
        ? '/api/mock-get-title'
        : process.env.NEXT_PUBLIC_BACKEND_URL
          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/get_title`
          : '/api/get_title'
      if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') return
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
          } catch { }
        }
      }
    } catch {
      console.error('Failed to fetch title')
    }
  }

  useEffect(() => { getDurationForTitle() }, [query])

  const isResearching = activeResearchIdx >= 0 && !researchBlocks[activeResearchIdx]?.isComplete
  const reportBlock = reportBlockIdx >= 0 ? researchBlocks[reportBlockIdx] : null

  return (
    <div className="h-full flex flex-col bg-[var(--background)] overflow-hidden relative" ref={containerRef}>
      <TextSelectionMenu
        containerRef={containerRef}
        showCheckSource={false}
        onFollowUp={handleAskOmni}
      />
      {isResearching && (
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

      {/* Main split-screen container */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 flex transition-opacity duration-250 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}>

          {/* ── LEFT: Chat panel ── */}
          <div className={`flex flex-col min-h-0 bg-[var(--background)] relative transition-all duration-300 ${isReportOpen && !isMobile
            ? 'w-[400px] lg:w-[480px] xl:w-[550px] border-r border-[var(--border-subtle)] shrink-0'
            : 'flex-1'
            } ${isReportOpen && isMobile ? 'hidden' : ''}`}>

            {/* Chat scroll */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-8">

                {chatMessages.map((msg, i) => {
                  const researchBlockIdx = researchTriggerIndex.indexOf(i)
                  const block = researchBlockIdx >= 0 ? researchBlocks[researchBlockIdx] : null

                  return (
                    <div key={i}>
                      {/* Chat message bubble */}
                      <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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

                              {/* Action buttons: only on messages without a research block */}
                              {msg.role === 'assistant' && !block && (
                                <div className="flex items-center gap-2 mt-2 border-t border-[var(--border-subtle)] pt-2">
                                  <button onClick={() => handleCopy(msg.content)} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Copy">
                                    <Copy size={14} />
                                  </button>
                                  <button onClick={handleFeatureComingSoon} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Helpful">
                                    <ThumbsUp size={14} />
                                  </button>
                                  <button onClick={handleFeatureComingSoon} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Not Helpful">
                                    <ThumbsDown size={14} />
                                  </button>
                                </div>
                              )}

                              {/* "Start Research" CTA for follow-up messages */}
                              {msg.read_to_begin_research && researchBlockIdx < 0 && !isChatLoading && !isResearching && (
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
                                      onClick={() => startDeepResearch(i)}
                                      className="px-6 py-2.5 bg-[var(--accent)] text-white rounded-full text-sm font-medium hover:opacity-90 flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.02] shrink-0"
                                    >
                                      <Layout size={16} />
                                      Start Research
                                    </button>
                                    <button
                                      onClick={() => {
                                        setFollowUpText(rewrittenQuery)
                                        setTimeout(() => {
                                          document.getElementById('chat-input')?.focus()
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
                          )}
                        </div>
                      </div>

                      {/* Inline research block (right below its triggering message) */}
                      {block && (
                        <>
                          <div className="mt-6">
                            <InlineResearchBlock
                              block={block}
                              duration={getDurationForBlock(block)}
                              isActiveReport={reportBlockIdx === researchBlockIdx}
                              onToggleProgress={() => {
                                setResearchBlocks(prev => {
                                  const copy = [...prev]
                                  copy[researchBlockIdx] = { ...copy[researchBlockIdx], showProgress: !copy[researchBlockIdx].showProgress }
                                  return copy
                                })
                              }}
                              onViewReport={() => {
                                if (reportBlockIdx === researchBlockIdx) {
                                  closeReport()
                                } else {
                                  openReport(researchBlockIdx)
                                }
                              }}
                            />
                          </div>
                          {/* Action buttons below the research block */}
                          {block.isComplete && (
                            <div className="flex items-center gap-2 mt-2 ml-1 border-t border-[var(--border-subtle)] pt-2">
                              <button onClick={() => handleCopy(msg.content)} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Copy response">
                                <Copy size={14} />
                              </button>
                              <button onClick={handleFeatureComingSoon} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Helpful">
                                <ThumbsUp size={14} />
                              </button>
                              <button onClick={handleFeatureComingSoon} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Not Helpful">
                                <ThumbsDown size={14} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}

                <div ref={chatBottomRef} className="h-4" />
              </div>
            </div>

            {/* Chat input */}
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
                  placeholder={isResearching ? 'Researching... please wait' : 'Discuss the research plan or ask a follow-up...'}
                  disabled={isChatLoading || isResearching}
                  className="w-full bg-white dark:bg-[#121212] text-[var(--foreground)] rounded-full pl-5 pr-12 py-3.5 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-sm border border-[var(--border-subtle)] disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || isChatLoading || isResearching}
                  className={`
                    absolute right-2 top-1/2 -translate-y-1/2
                    flex items-center justify-center p-2 rounded-lg transition-all duration-200
                    ${!chatInput.trim() || isChatLoading || isResearching
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

          {/* ── RIGHT: Report panel (split-screen) ── */}
          {isReportOpen && (
            <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)] relative">
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {reportBlock?.finalAnswer ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-8 animate-fade-up pb-24 relative">
                    <FinalAnswer
                      answer={reportBlock.finalAnswer.answer}
                      sources={reportBlock.finalAnswer.sources}
                      assets={reportBlock.finalAnswer.assets}
                      title={reportBlock.title}
                      onBack={closeReport}
                      onFollowUp={handleAskOmni}
                      onPublish={(duration) => handleShare(reportBlockIdx, duration)}
                    />
                  </div>
                ) : (reportBlock?.error || reportBlock?.hasTimedOut) ? (
                  <div className="mx-auto max-w-[1200px] px-6 py-16 animate-fade-up">
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 sm:p-12 flex flex-col items-center text-center max-w-xl mx-auto shadow-sm">
                      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                      </div>
                      <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight mb-2">
                        {reportBlock?.hasTimedOut ? 'Generation Timed Out' : 'An Error Occurred'}
                      </h3>
                      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-md">
                        {reportBlock?.error || 'The research process took too long and was aborted.'}
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

// ── Inline Research Block Component ───────────────────────────────────
interface InlineResearchBlockProps {
  block: ResearchBlock
  duration: string
  isActiveReport: boolean
  onToggleProgress: () => void
  onViewReport: () => void
}

function InlineResearchBlock({ block, duration, isActiveReport, onToggleProgress, onViewReport }: InlineResearchBlockProps) {
  return (
    <div className="border border-[var(--border-subtle)] bg-card/50 rounded-xl p-4 sm:p-5 shadow-sm animate-fade-in">
      {/* Header: stacks on mobile, row on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        {/* Icon + title */}
        <div className="flex items-start gap-3 overflow-hidden flex-1 min-w-0">
          <div className="relative flex h-8 w-8 items-center justify-center shrink-0 overflow-hidden rounded-full bg-[var(--accent)]/20 mt-0.5">
            {!block.isComplete ? (
              <Loader className="h-4 w-4 text-[var(--accent)] animate-spin" />
            ) : (
              <Layout className="h-4 w-4 text-[var(--accent)]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--foreground)] leading-snug break-words">
              {block.isComplete ? (block.title || 'Canvas Report Complete') : 'Deep Research in Progress'}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              {block.isComplete
                ? `Research completed with ${block.messages.length} steps`
                : "Please don't close this page..."}
              {!block.isComplete && (
                <span className="ml-2 font-mono text-[var(--accent)]">{duration}</span>
              )}
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0">
          <button
            onClick={onToggleProgress}
            className="px-3 py-1.5 bg-[var(--secondary)] text-[var(--foreground)] rounded-md text-xs font-medium hover:bg-[var(--secondary)]/80 transition-colors"
          >
            {block.showProgress ? 'Hide Progress' : 'Show Progress'}
          </button>
          {block.isComplete && block.finalAnswer && (
            <button
              onClick={onViewReport}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm ${isActiveReport
                ? 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                : 'bg-[var(--accent)] text-white hover:opacity-90'
                }`}
            >
              {isActiveReport ? 'Close Report' : 'View Report'}
            </button>
          )}
        </div>
      </div>

      {/* Progress panels */}
      {block.showProgress && (
        <div className="mt-6 border-t border-[var(--border-subtle)]/50 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 h-auto max-h-[50vh] sm:h-[380px] sm:max-h-none">
          <div className="flex flex-col gap-3 min-h-0">
            <span className="text-xs font-bold text-[var(--muted-foreground)]/70 uppercase tracking-widest pl-1">Research Plan</span>
            <div className="flex-1 min-h-[140px] sm:min-h-0 relative overflow-hidden bg-[var(--background)] rounded-lg border border-[var(--border-subtle)]/50">
              <div className="absolute inset-0 overflow-y-auto px-4 py-3 custom-scrollbar">
                <ResearchProgress todos={block.todos} isComplete={block.isComplete} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 min-h-0">
            <span className="text-xs font-bold text-[var(--muted-foreground)]/70 uppercase tracking-widest pl-1">Thinking Process</span>
            <div className="flex-1 min-h-[140px] sm:min-h-0 relative overflow-hidden bg-[var(--background)] rounded-lg border border-[var(--border-subtle)]/50">
              <div className="absolute inset-0 overflow-y-auto px-4 py-3 custom-scrollbar">
                <ThinkingTimeline messages={block.messages} isStreaming={!block.isComplete && !block.error} isComplete={block.isComplete} />
              </div>
            </div>
          </div>
        </div>
      )}

      {block.error && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {block.error}
        </div>
      )}
    </div>
  )
}
