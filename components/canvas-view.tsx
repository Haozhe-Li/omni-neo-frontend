'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Layout, Clock, FileText, Menu, AlertCircle, ArrowUp, X, Copy, ThumbsUp, ThumbsDown, Share, Mic, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ThinkingTimeline } from '@/components/thinking-timeline'
import { ResearchProgress } from '@/components/research-progress'
import { FinalAnswer } from '@/components/final-answer'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { parseSSEMessage } from '@/lib/sse-parser'
import type { SSEMessage, TodoItem } from '@/lib/types'
import { getUserLocation } from '@/lib/location'
import { getAiRequestErrorMessage, getLocalISOString } from '@/lib/utils'
import { appendQueryToMemoryQueue, getMemories } from '@/lib/memories'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { useApi } from '@/hooks/useApi'
import { SignUpButton, useAuth, useClerk } from '@clerk/nextjs'

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
  mode?: 'canvas' | 'light'
  canvas_state?: CanvasPersistState
}

interface CanvasPersistState {
  rewrittenQuery: string
  researchBlocks: ResearchBlock[]
  researchTriggerIndex: number[]
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

const isUntitledTitle = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized || normalized === 'untitled' || normalized === 'untitled chat'
}

const inferTitleFromMessages = (messages: Array<{ role?: string; content?: string }>, fallback: string) => {
  const firstUserMessage = messages.find((message) => message?.role === 'user' && typeof message?.content === 'string' && message.content.trim())
  return firstUserMessage?.content?.trim() || fallback
}

const fetchedTitleThreadSet = new Set<string>()
const inFlightTitleThreadSet = new Set<string>()

export function CanvasView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false, sidebarOpen, setSidebarOpen }: CanvasViewProps) {
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [title, setTitle] = useState(query)
  const [isFading, setIsFading] = useState(false)

  // Which research block's report is shown in right panel (-1 = none)
  const [reportBlockIdx, setReportBlockIdx] = useState(-1)
  const isReportOpen = reportBlockIdx >= 0

  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSstPending, setIsSstPending] = useState(false)
  const [rewrittenQuery, setRewrittenQuery] = useState('')
  const [followUpText, setFollowUpText] = useState('')
  const [isQuotaLocked, setIsQuotaLocked] = useState(false)
  const [quotaLockedBlockId, setQuotaLockedBlockId] = useState<string | null>(null)

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
  const rewrittenQueryRef = useRef('')
  const researchBlocksRef = useRef<ResearchBlock[]>([])
  const researchTriggerIndexRef = useRef<number[]>([])
  const lastAutoScrolledAssistantKeyRef = useRef<string>('')
  const containerRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  const recognitionRef = useRef<any>(null)

  const { fetchWithAuth } = useApi()

  const getStoredTitle = useCallback(() => {
    if (typeof window === 'undefined' || !threadId) return ''
    const stored = localStorage.getItem(threadId)
    if (!stored) return ''
    try {
      const parsed = JSON.parse(stored)
      const parsedTitle = typeof parsed?.title === 'string' ? parsed.title.trim() : ''
      return parsedTitle
    } catch {
      return ''
    }
  }, [threadId])

  const lockCanvasForQuota = useCallback((blockId?: string, shouldOpenSignIn = true) => {
    setIsQuotaLocked(true)
    setChatInput('')
    setFollowUpText('')
    if (blockId) {
      setQuotaLockedBlockId(blockId)
    } else if (!quotaLockedBlockId) {
      const lastBlockId = researchBlocksRef.current[researchBlocksRef.current.length - 1]?.id
      if (lastBlockId) setQuotaLockedBlockId(lastBlockId)
    }
    if (shouldOpenSignIn) {
      clerk.openSignIn()
    }
  }, [clerk, quotaLockedBlockId])

  const checkQuotaAfterCanvasAnswer = useCallback(async (blockId: string) => {
    if (isSignedIn) return
    try {
      const backendUrl = (
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
      ).replace(/\/$/, '')
      const res = await fetchWithAuth(`${backendUrl}/api/guests/daily-quota`)
      if (!res.ok) return
      const data = await res.json()
      if (typeof data?.remaining === 'number' && data.remaining <= 0) {
        lockCanvasForQuota(blockId, false)
      }
    } catch {
      // silently ignore post-answer quota check failure
    }
  }, [fetchWithAuth, isSignedIn, lockCanvasForQuota])

  useEffect(() => {
    rewrittenQueryRef.current = rewrittenQuery
  }, [rewrittenQuery])

  useEffect(() => {
    if (isSignedIn && isQuotaLocked) {
      setIsQuotaLocked(false)
      setQuotaLockedBlockId(null)
    }
  }, [isSignedIn, isQuotaLocked])

  useEffect(() => {
    researchBlocksRef.current = researchBlocks
  }, [researchBlocks])

  useEffect(() => {
    researchTriggerIndexRef.current = researchTriggerIndex
  }, [researchTriggerIndex])

  const syncToBackend = useCallback((messages: unknown[], syncTitle?: string, stateOverride?: Partial<CanvasPersistState>) => {
    if (!threadId || isMockMode) return
    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
    const canvasState: CanvasPersistState = {
      rewrittenQuery: stateOverride?.rewrittenQuery ?? rewrittenQueryRef.current,
      researchBlocks: stateOverride?.researchBlocks ?? researchBlocksRef.current,
      researchTriggerIndex: stateOverride?.researchTriggerIndex ?? researchTriggerIndexRef.current,
    }
    const payloadMessages = messages.map((message: any, index) => {
      if (index === 0 && typeof message === 'object' && message !== null) {
        return { ...message, mode: 'canvas', canvas_state: canvasState }
      }
      return message
    })
    const body: Record<string, unknown> = { messages: payloadMessages }
    if (syncTitle && !isUntitledTitle(syncTitle)) body.title = syncTitle
    fetchWithAuth(`${backendUrl}/api/threads/${threadId}/sync`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).catch(() => { /* fire-and-forget */ })
  }, [threadId, fetchWithAuth, isMockMode])

  // Scroll to latest assistant message whenever new chat appears
  useEffect(() => {
    let lastAssistantIndex = -1
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      if (chatMessages[index]?.role === 'assistant') {
        lastAssistantIndex = index
        break
      }
    }
    if (lastAssistantIndex < 0) return
    const assistantContent = chatMessages[lastAssistantIndex]?.content ?? ''
    const assistantPhase = assistantContent === '...' ? 'placeholder' : 'final'
    const scrollKey = `${lastAssistantIndex}:${assistantPhase}`
    if (scrollKey === lastAutoScrolledAssistantKeyRef.current) return

    lastAutoScrolledAssistantKeyRef.current = scrollKey
    requestAnimationFrame(() => {
      // Scroll to the user query preceding the AI reply so user sees their own question at the top
      const userIndex = lastAssistantIndex - 1
      const target = containerRef.current?.querySelector(
        `[data-message-index="${userIndex >= 0 ? userIndex : lastAssistantIndex}"]`
      ) as HTMLElement | null
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [chatMessages])

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
      const url = `${window.location.origin}/pages/${id}`

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
    'google_search', 'skimming_web_pages', 'get_full_text', 'verify_claim',
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
            const resolvedBlockId = researchBlocksRef.current[blockIdx]?.id
            if (resolvedBlockId) {
              void checkQuotaAfterCanvasAnswer(resolvedBlockId)
            }
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
  }, [KNOWN_TOOLS, query, checkQuotaAfterCanvasAnswer])

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

      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        if (res.status === 429) {
          setChatMessages(updatedMessages)
          setIsChatLoading(false)
          lockCanvasForQuota()
          return
        }
        const message = getAiRequestErrorMessage(res.status)
        toast.error(message)
        throw new Error(message)
      }
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
      const nextRewrittenQuery = data.rewritten_query || rewrittenQueryRef.current
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
          rewrittenQuery: nextRewrittenQuery,
          researchBlocks,
          researchTriggerIndex,
          timestamp: Date.now(),
          model: 'canvas',
          title: title || query,
        }
        localStorage.setItem(threadId, JSON.stringify(chatData))
        syncToBackend(finalMessages, chatData.title, { rewrittenQuery: nextRewrittenQuery })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '请求失败，请稍后重试。'
      setChatMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: errorMessage }
        return copy
      })
      setIsChatLoading(false)
    }
  }

  // ── Init from local storage ────────────────────────────────────────
  useEffect(() => {
    const initCanvas = async () => {
      // 1) Try backend persisted thread messages first (cross-device sync)
      if (!isMockMode && isSignedIn) {
        try {
          const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
          const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadId}`)
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data?.messages) && data.messages.length > 0) {
              const remoteMessages = data.messages as ChatMessage[]
              const remoteRawTitle = typeof data?.title === 'string' ? data.title.trim() : ''
              const resolvedTitle = isUntitledTitle(remoteRawTitle)
                ? inferTitleFromMessages(remoteMessages, query)
                : remoteRawTitle
              const firstMessage = remoteMessages[0]
              const remoteCanvasState =
                firstMessage &&
                typeof firstMessage === 'object' &&
                firstMessage.canvas_state &&
                typeof firstMessage.canvas_state === 'object'
                  ? firstMessage.canvas_state
                  : null

              const recoveredRewrittenQuery =
                remoteCanvasState && typeof remoteCanvasState.rewrittenQuery === 'string'
                  ? remoteCanvasState.rewrittenQuery
                  : ''
              const recoveredResearchBlocks =
                remoteCanvasState && Array.isArray(remoteCanvasState.researchBlocks)
                  ? remoteCanvasState.researchBlocks
                  : []
              const recoveredResearchTriggerIndex =
                remoteCanvasState && Array.isArray(remoteCanvasState.researchTriggerIndex)
                  ? remoteCanvasState.researchTriggerIndex
                  : []

              // If backend merge misses canvas_state, recover richer canvas data from local cache.
              let localRewrittenQuery = ''
              let localResearchBlocks: ResearchBlock[] = []
              let localResearchTriggerIndex: number[] = []
              if (typeof window !== 'undefined') {
                try {
                  const localRaw = localStorage.getItem(threadId)
                  if (localRaw) {
                    const localData = JSON.parse(localRaw)
                    if (localData?.thread_id === threadId) {
                      if (typeof localData.rewrittenQuery === 'string') {
                        localRewrittenQuery = localData.rewrittenQuery
                      }
                      if (Array.isArray(localData.researchBlocks)) {
                        localResearchBlocks = localData.researchBlocks
                      }
                      if (Array.isArray(localData.researchTriggerIndex)) {
                        localResearchTriggerIndex = localData.researchTriggerIndex
                      }
                    }
                  }
                } catch {
                  // ignore invalid local cache
                }
              }

              const hasRemoteCanvasBlocks = recoveredResearchBlocks.length > 0
              const hasLocalCanvasBlocks = localResearchBlocks.length > 0
              const shouldHydrateFromLocal = !hasRemoteCanvasBlocks && hasLocalCanvasBlocks

              const finalRewrittenQuery = shouldHydrateFromLocal
                ? (localRewrittenQuery || recoveredRewrittenQuery)
                : recoveredRewrittenQuery
              const finalResearchBlocks = shouldHydrateFromLocal
                ? localResearchBlocks
                : recoveredResearchBlocks
              const finalResearchTriggerIndex = shouldHydrateFromLocal
                ? (localResearchTriggerIndex.length > 0 ? localResearchTriggerIndex : recoveredResearchTriggerIndex)
                : recoveredResearchTriggerIndex

              setChatMessages(remoteMessages)
              setTitle(resolvedTitle)
              if (!isUntitledTitle(resolvedTitle)) {
                fetchedTitleThreadSet.add(threadId)
              }
              setRewrittenQuery(finalRewrittenQuery)
              setResearchBlocks(finalResearchBlocks)
              setResearchTriggerIndex(finalResearchTriggerIndex)
              answerReceivedRef.current = finalResearchBlocks.some((block) => block?.isComplete)
              isCompleteRef.current = finalResearchBlocks.some((block) => block?.isComplete)
              setIsChatLoading(false)
              isInitializedRef.current = true

              if (typeof window !== 'undefined') {
                const chatData = {
                  thread_id: threadId,
                  query,
                  chatMessages: remoteMessages,
                  rewrittenQuery: finalRewrittenQuery,
                  researchBlocks: finalResearchBlocks,
                  researchTriggerIndex: finalResearchTriggerIndex,
                  timestamp: Date.now(),
                  model: 'canvas',
                  title: resolvedTitle,
                }
                localStorage.setItem(threadId, JSON.stringify(chatData))
              }

              if ((isUntitledTitle(remoteRawTitle) && !isUntitledTitle(resolvedTitle)) || shouldHydrateFromLocal) {
                syncToBackend(remoteMessages, resolvedTitle, {
                  rewrittenQuery: finalRewrittenQuery,
                  researchBlocks: finalResearchBlocks,
                  researchTriggerIndex: finalResearchTriggerIndex,
                })
              }
              return
            }
          }
        } catch {
          // Fall through to local cache and then fresh generation
        }
      }

      // 2) Fallback to local storage
      if (typeof window !== 'undefined' && threadId) {
        try {
          const stored = localStorage.getItem(threadId)
          if (stored) {
            const data = JSON.parse(stored)
            if (data.thread_id === threadId) {
              if (data.chatMessages) setChatMessages(data.chatMessages)
              if (data.rewrittenQuery) setRewrittenQuery(data.rewrittenQuery)
              if (data.title) {
                setTitle(data.title)
                if (!isUntitledTitle(data.title)) {
                  fetchedTitleThreadSet.add(threadId)
                }
              }

              if (data.researchBlocks && Array.isArray(data.researchBlocks)) {
                setResearchBlocks(data.researchBlocks)
                setResearchTriggerIndex(data.researchTriggerIndex || [])
              } else if (data.final_answer) {
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

      // 3) No history, generate a fresh initial response
      if (!isInitializedRef.current && chatMessages.length === 0) {
        isInitializedRef.current = true
        fetchHelper(query, true, [])
      }
    }
    initCanvas()
  }, [threadId, query, fetchWithAuth, isMockMode, isSignedIn])

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
        syncToBackend(chatData.chatMessages || [], chatData.title)
      }
    } catch { }
  }, [researchBlocks, researchTriggerIndex, threadId, syncToBackend])

  // ── Sync full canvas state to backend for cross-device continuity ─
  useEffect(() => {
    if (!threadId || !isInitializedRef.current || chatMessages.length === 0) return
    const timer = setTimeout(() => {
      syncToBackend(chatMessages, title)
    }, 800)
    return () => clearTimeout(timer)
  }, [threadId, chatMessages, rewrittenQuery, researchBlocks, researchTriggerIndex, title, syncToBackend])

  // ── Start a new deep research session ─────────────────────────────
  const startDeepResearch = async (triggeredByMsgIdx: number, researchQuery?: string) => {
    if (isQuotaLocked) {
      clerk.openSignIn()
      return
    }
    const blockIdx = researchBlocks.length
    answerReceivedRef.current = false
    isCompleteRef.current = false

    const activeQuery = researchQuery || rewrittenQuery || query
    const blockId = `research-${Date.now()}`
    const newBlock: ResearchBlock = {
      id: blockId,
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

    await fetchDeepResearch(activeQuery, blockIdx, blockId)
  }

  // ── Stream a deep research request ────────────────────────────────
  const fetchDeepResearch = async (activeQuery: string, blockIdx: number, blockId: string) => {
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

      const response = await fetchWithAuth(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        if (response.status === 429) {
          setResearchBlocks(prev => {
            const copy = [...prev]
            if (copy[blockIdx]) {
              copy[blockIdx] = {
                ...copy[blockIdx],
                isComplete: true,
                error: null,
                hasTimedOut: false,
                executionTime: Date.now() - copy[blockIdx].startTime,
              }
            }
            return copy
          })
          isCompleteRef.current = true
          lockCanvasForQuota(blockId)
          return
        }
        const message = getAiRequestErrorMessage(response.status)
        toast.error(message)
        throw new Error(message)
      }
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection to Chat service failed.'
      setResearchBlocks(prev => {
        const copy = [...prev]
        if (copy[blockIdx]) {
          copy[blockIdx] = { ...copy[blockIdx], error: errorMessage, isComplete: true }
        }
        return copy
      })
      isCompleteRef.current = true
    }
  }

  const handleChatSend = () => {
    if (isQuotaLocked) {
      clerk.openSignIn()
      return
    }
    if (!chatInput.trim() || isChatLoading) return
    const currentInput = chatInput
    const currentFollowUp = followUpText
    setChatInput('')
    setFollowUpText('')
    fetchHelper(currentInput, false, chatMessages, currentFollowUp)
  }

  const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitOnEnter(e)) return
    e.preventDefault()
    handleChatSend()
  }

  const handleSst = useCallback(() => {
    const currentlyResearching = activeResearchIdx >= 0 && !researchBlocks[activeResearchIdx]?.isComplete
    if (isQuotaLocked || isChatLoading || currentlyResearching) return

    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }

    const RecognitionCtor = typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null

    if (!RecognitionCtor) {
      toast.info('Speech-to-text is not supported in this browser.')
      return
    }

    let transcript = ''

    try {
      const recognition = new RecognitionCtor()
      recognition.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US'
      recognition.interimResults = false
      recognition.continuous = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsRecording(true)
        setIsSstPending(false)
      }

      recognition.onresult = (event: any) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const part = event.results[index]?.[0]?.transcript
          if (typeof part === 'string') transcript += part
        }
      }

      recognition.onerror = () => {
        setIsSstPending(false)
        setIsRecording(false)
        toast.error('Speech recognition failed. Please retry.')
      }

      recognition.onend = () => {
        setIsSstPending(false)
        setIsRecording(false)
        recognitionRef.current = null
        const finalText = transcript.trim()
        if (!finalText) return
        setChatInput((prev) => {
          const base = prev.trim()
          return base ? `${base} ${finalText}` : finalText
        })
      }

      recognitionRef.current = recognition
      setIsSstPending(true)
      recognition.start()
    } catch {
      setIsSstPending(false)
      setIsRecording(false)
      recognitionRef.current = null
      toast.error('Unable to start speech recognition.')
    }
  }, [isQuotaLocked, isChatLoading, isRecording, activeResearchIdx, researchBlocks])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.()
      recognitionRef.current = null
    }
  }, [])

  const getDurationForTitle = async () => {
    try {
      if (!threadId) return
      if (isUntitledTitle(query)) return
      if (!isUntitledTitle(title)) {
        fetchedTitleThreadSet.add(threadId)
        return
      }

      const storedTitle = getStoredTitle()
      if (!isUntitledTitle(storedTitle)) {
        setTitle(storedTitle)
        fetchedTitleThreadSet.add(threadId)
        return
      }

      if (fetchedTitleThreadSet.has(threadId) || inFlightTitleThreadSet.has(threadId)) return
      inFlightTitleThreadSet.add(threadId)

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
      if (!isUntitledTitle(newTitle)) {
        fetchedTitleThreadSet.add(threadId)
      }
      if (typeof window !== 'undefined' && threadId) {
        const stored = localStorage.getItem(threadId)
        if (stored) {
          try {
            const chatData = JSON.parse(stored)
            chatData.title = newTitle
            localStorage.setItem(threadId, JSON.stringify(chatData))
            syncToBackend(chatData.chatMessages || [], newTitle)
          } catch { }
        }
      }
    } catch {
      console.error('Failed to fetch title')
    } finally {
      if (threadId) {
        inFlightTitleThreadSet.delete(threadId)
      }
    }
  }

  useEffect(() => { getDurationForTitle() }, [query, threadId, title, getStoredTitle])

  const isResearching = activeResearchIdx >= 0 && !researchBlocks[activeResearchIdx]?.isComplete
  const reportBlock = reportBlockIdx >= 0 ? researchBlocks[reportBlockIdx] : null

  return (
    <div className="h-full flex flex-col bg-[var(--background)] overflow-hidden relative" ref={containerRef}>
      <TextSelectionMenu
        containerRef={containerRef}
        showCheckSource={false}
        onFollowUp={handleAskOmni}
        allowedSelectors={['[data-selection-scope="assistant-message"]']}
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
            <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-8">

                {chatMessages.map((msg, i) => {
                  const researchBlockIdx = researchTriggerIndex.indexOf(i)
                  const block = researchBlockIdx >= 0 ? researchBlocks[researchBlockIdx] : null

                  return (
                    <div
                      key={i}
                      data-message-index={i}
                      data-ai-message-index={msg.role === 'assistant' ? i : undefined}
                      data-selection-scope={msg.role === 'assistant' ? 'assistant-message' : undefined}
                    >
                      {/* Chat message bubble */}
                      <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`
                          rounded-2xl px-5 py-3 flex flex-col gap-2
                          ${msg.role === 'user' ? 'max-w-[85%] bg-[var(--secondary)] text-[var(--foreground)]' : 'w-full bg-transparent text-[var(--foreground)]'}
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
                              {msg.role === 'user' ? (
                                <div className="max-w-none whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--foreground)]">
                                  {msg.follow_up_content && (
                                    <div className="mb-2 pl-3 py-1.5 border-l-[3px] border-[var(--foreground)]/30 text-[var(--foreground)]/80 text-sm line-clamp-3">
                                      {msg.follow_up_content}
                                    </div>
                                  )}
                                  <div>{msg.content}</div>
                                </div>
                              ) : (
                                <div className="max-w-none blog-markdown markdown-body text-[16px] leading-[1.8]">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>
                              )}

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
                                  <div className="flex flex-col gap-2.5 w-full">
                                    <div className="flex items-center gap-2.5">
                                      <button
                                        onClick={() => {
                                          if (isQuotaLocked) {
                                            clerk.openSignIn()
                                            return
                                          }
                                          startDeepResearch(i)
                                        }}
                                        className={`px-6 py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all shrink-0 ${
                                          isQuotaLocked
                                            ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                                            : 'bg-[var(--accent)] text-white hover:opacity-90 hover:scale-[1.02]'
                                        }`}
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
                                    </div>
                                    <div className="text-xs text-[var(--muted-foreground)] opacity-70 flex items-center gap-1.5 pl-1">
                                      <Clock size={12} />
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
                            {isQuotaLocked && quotaLockedBlockId === block.id && (
                              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 px-3 py-2">
                                <span className="text-[11px] text-[var(--muted-foreground)] tracking-[0.01em]">
                                  Your daily quota is used up. Please sign in to continue in Canvas mode.
                                </span>
                                <SignUpButton mode="modal">
                                  <button
                                    type="button"
                                    className="h-7 px-3 rounded-md border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors whitespace-nowrap"
                                  >
                                    Sign In
                                  </button>
                                </SignUpButton>
                              </div>
                            )}
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
                <textarea
                  id="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatInputKeyDown}
                  placeholder={isQuotaLocked ? 'Quota reached. Sign in to continue in Canvas mode.' : isResearching ? 'Researching... please wait' : 'Discuss the research plan'}
                  disabled={isQuotaLocked || isChatLoading || isResearching}
                  rows={1}
                  className="w-full resize-none bg-white dark:bg-[#121212] text-[var(--foreground)] rounded-2xl pl-5 pr-28 py-4 min-h-[92px] max-h-56 overflow-y-auto focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-sm border border-[var(--border-subtle)] disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSst}
                    disabled={isQuotaLocked || isChatLoading || isResearching || isSstPending}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                      isQuotaLocked || isChatLoading || isResearching || isSstPending
                        ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                        : isRecording
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                    }`}
                    aria-label={isRecording ? 'Stop speech to text' : 'Start speech to text'}
                  >
                    {isRecording && !isSstPending && (
                      <span className="absolute inset-0 rounded-full border border-white/45 animate-ping" aria-hidden="true" />
                    )}
                    {isSstPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />}
                  </button>

                  <button
                    onClick={handleChatSend}
                    disabled={isQuotaLocked || !chatInput.trim() || isChatLoading || isResearching}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
                      isQuotaLocked || !chatInput.trim() || isChatLoading || isResearching
                        ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                        : 'bg-[var(--accent)] text-white hover:opacity-90'
                    }`}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
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
                      onPublish={isSignedIn ? (duration) => handleShare(reportBlockIdx, duration) : undefined}
                      isSignedIn={!!isSignedIn}
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
    <div className="relative border border-[var(--border-subtle)] bg-card/50 rounded-xl p-4 sm:p-5 shadow-sm animate-fade-in">
      {!block.isComplete && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-xl animate-pulse"
          style={{
            boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 36px color-mix(in srgb, var(--accent) 12%, transparent)',
            animationDuration: '2.6s',
          }}
        />
      )}
      {/* Header: always stacked column layout */}
      <div className="flex flex-col gap-3">
        {/* Icon + title */}
        <div className="flex items-start gap-3 overflow-hidden min-w-0">
          <div className="relative flex h-8 w-8 items-center justify-center shrink-0 overflow-hidden rounded-full bg-[var(--accent)]/20 mt-0.5">
            {!block.isComplete ? (
              <div className="h-2 w-2 rounded-full bg-[var(--accent)]/80" />
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

        {/* Buttons: always below title, indented to align with text */}
        <div className="flex items-center gap-2 pl-11">
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
