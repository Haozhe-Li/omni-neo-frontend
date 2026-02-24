'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { ArrowLeft, ArrowUp, Copy, Check, ThumbsUp, ThumbsDown, Share, Menu, Search, Globe, X } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { getUserLocation } from '@/lib/location'
import { getAiRequestErrorMessage, getLocalISOString } from '@/lib/utils'
import { appendQueryToMemoryQueue, getMemories } from '@/lib/memories'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@clerk/nextjs'

interface LightChatViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  use_search?: boolean
  follow_up_content?: string
}

function extractNodeText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const withProps = node as { props?: { children?: ReactNode } }
    return extractNodeText(withProps.props?.children)
  }
  return ''
}

function CodeCopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = getText().trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Code copied')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Failed to copy code')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-background/80 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-all text-xs opacity-0 group-hover:opacity-100 cursor-pointer"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

const markdownComponents: Components = {
  pre: ({ children }) => (
    <div className="relative group my-4">
      <pre>{children}</pre>
      <CodeCopyButton getText={() => extractNodeText(children)} />
    </div>
  ),
}

const isUntitledTitle = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized || normalized === 'untitled' || normalized === 'untitled chat'
}

const inferTitleFromMessages = (messages: Message[], fallback: string) => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim())
  return firstUserMessage?.content?.trim() || fallback
}

export function LightChatView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false }: LightChatViewProps) {
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
  const { isSignedIn } = useAuth()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'user', content: query },
    { role: 'assistant', content: '...' } // Loading placeholder
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [followUpText, setFollowUpText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState(query)

  const { fetchWithAuth } = useApi()

  const syncToBackend = useCallback((msgs: Message[], syncTitle?: string) => {
    if (!threadId || isMockMode) return
    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
    const payloadMessages = msgs.map((message, index) => {
      if (index === 0) {
        return { ...message, mode: 'light' }
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Fetch Title effect
  useEffect(() => {
    const fetchTitle = async () => {
      try {
        if (isUntitledTitle(query)) return
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
          // Persist to local storage immediately
          if (typeof window !== 'undefined' && threadId) {
            const stored = localStorage.getItem(threadId)
            if (stored) {
              try {
                const chatData = JSON.parse(stored)
                chatData.title = data
                localStorage.setItem(threadId, JSON.stringify(chatData))
                syncToBackend(Array.isArray(chatData.chat_history) ? chatData.chat_history : [], data)
              } catch (e) { }
            }
          }
        } else if (data && data.title) {
          setTitle(data.title)
          // Persist to local storage immediately
          if (typeof window !== 'undefined' && threadId) {
            const stored = localStorage.getItem(threadId)
            if (stored) {
              try {
                const chatData = JSON.parse(stored)
                chatData.title = data.title
                localStorage.setItem(threadId, JSON.stringify(chatData))
                syncToBackend(Array.isArray(chatData.chat_history) ? chatData.chat_history : [], data.title)
              } catch (e) { }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch title:', error)
      }
    }

    // Only fetch if not using mock, or if mock has a specific endpoint
    fetchTitle()
  }, [query, threadId])

  // Load from LocalStorage OR Fetch initial
  useEffect(() => {
    const initChat = async () => {
      // 1. Try backend persisted thread messages first (cross-device sync)
      if (!isMockMode && isSignedIn) {
        try {
          const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
          const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadId}`)
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data?.messages) && data.messages.length > 0) {
              const remoteMessages = data.messages as Message[]
              const remoteRawTitle = typeof data?.title === 'string' ? data.title.trim() : ''
              const resolvedTitle = isUntitledTitle(remoteRawTitle)
                ? inferTitleFromMessages(remoteMessages, query)
                : remoteRawTitle
              setMessages(remoteMessages)
              setTitle(resolvedTitle)
              setIsLoading(false)

              if (typeof window !== 'undefined') {
                const historyData = {
                  thread_id: threadId,
                  query,
                  type: 'light',
                  model: 'light',
                  chat_history: remoteMessages,
                  timestamp: Date.now(),
                  title: resolvedTitle
                }
                localStorage.setItem(threadId, JSON.stringify(historyData))
              }

              if (isUntitledTitle(remoteRawTitle) && !isUntitledTitle(resolvedTitle)) {
                syncToBackend(remoteMessages, resolvedTitle)
              }
              return
            }
          }
        } catch {
          // Fall through to local cache and then fresh fetch
        }
      }

      // 2. Fallback to localStorage
      if (typeof window !== 'undefined' && threadId) {
        const stored = localStorage.getItem(threadId)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            if (data.thread_id === threadId && data.type === 'light' && data.chat_history && Array.isArray(data.chat_history)) {
              setMessages(data.chat_history)
              if (data.title) setTitle(data.title)
              setIsLoading(false)
              return
            }
          } catch (e) {
            console.error("Failed to parse storage", e)
          }
        }
      }

      // 3. If no valid history, start fresh fetch
      setIsLoading(true)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
        const endpoint = baseUrl.endsWith('/') ? `${baseUrl}light_chat` : `${baseUrl}/light_chat`

        const personalization: any = {}
        if (typeof window !== 'undefined') {
          const savedLang = localStorage.getItem('omni_response_language')
          if (savedLang && savedLang !== 'auto') {
            personalization.response_language = savedLang
          }
          const savedEnableMemories = localStorage.getItem('omni_enable_memories')
          if (savedEnableMemories === 'true') {
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

        const res = await fetchWithAuth(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!res.ok) {
          const message = getAiRequestErrorMessage(res.status)
          toast.error(message)
          throw new Error(message)
        }

        let data = await res.json()
        // Handle double-encoded JSON if necessary
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data)
          } catch (e) {
            // If it's just a string, use it as is? 
            // The user said it returns JSON string, so parsing should work.
            // If parse fails, maybe it IS the answer?
          }
        }

        const answer = data.answer || (typeof data === 'string' ? data : "No answer returned.")
        const use_search = !!data.use_search

        const newMessages: Message[] = [
          { role: 'user', content: query },
          { role: 'assistant', content: answer, use_search }
        ]

        setMessages(newMessages)
        setIsLoading(false)

        // Save to localStorage
        if (threadId) {
          const historyData = {
            thread_id: threadId,
            query,
            type: 'light',
            chat_history: newMessages,
            timestamp: Date.now(),
            title: title || query
          }
          localStorage.setItem(threadId, JSON.stringify(historyData))
          syncToBackend(newMessages, historyData.title)
        }

      } catch (e) {
        console.error(e)
        const errorMessage = e instanceof Error ? e.message : '请求失败，请稍后重试。'
        setMessages(prev => {
          const copy = [...prev]
          copy[1] = { role: 'assistant', content: errorMessage }
          return copy
        })
        setIsLoading(false)
      }
    }

    initChat()
  }, [threadId, query, fetchWithAuth, isMockMode, isSignedIn])

  // We don't really have a "chat" continuation in the requirements, just "Light chat rendering is traditional chatbot page".
  // But usually chatbot implies continuation. I'll add a simple input for "continuation" even if backend might not support context yet (the user didn't specify context behavior for light chat, just /light_chat endpoint).
  // The Prompt says: "Request /light_chat... returns final answer". 
  // It doesn't say "Context". But passing `thread_id` implies context.

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const currentFollowUpText = followUpText
    const userMsg: Message = { role: 'user', content: input, follow_up_content: currentFollowUpText || undefined }
    const newHistory = [...messages, userMsg]
    setMessages([...newHistory, { role: 'assistant', content: '...' }])
    setInput('')
    setFollowUpText('')
    setIsLoading(true)

    if (threadId) {
      // Save immediately with user message (without loading placeholder)
      const historyData = {
        thread_id: threadId,
        query: query,
        type: 'light',
        chat_history: newHistory,
        timestamp: Date.now(),
        title: title || query
      }
      localStorage.setItem(threadId, JSON.stringify(historyData))
      syncToBackend(newHistory, historyData.title)
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
      const endpoint = baseUrl.endsWith('/') ? `${baseUrl}light_chat` : `${baseUrl}/light_chat`

      const personalization: any = {}
      if (typeof window !== 'undefined') {
        const savedLang = localStorage.getItem('omni_response_language')
        if (savedLang && savedLang !== 'auto') {
          personalization.response_language = savedLang
        }
        const savedEnableMemories = localStorage.getItem('omni_enable_memories')
        if (savedEnableMemories === 'true') {
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
        query: input,
        thread_id: threadId,
        ...(currentFollowUpText ? { follow_up_content: currentFollowUpText } : {})
      }

      if (Object.keys(personalization).length > 0) {
        payload.personalization = personalization
      }

      appendQueryToMemoryQueue(input)

      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const message = getAiRequestErrorMessage(res.status)
        toast.error(message)
        throw new Error(message)
      }

      let data = await res.json()
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (e) { }
      }

      const answer = data.answer || (typeof data === 'string' ? data : "No answer returned.")
      const use_search = !!data.use_search

      const finalMessages: Message[] = [...newHistory, { role: 'assistant', content: answer, use_search }]
      setMessages(finalMessages)
      if (threadId) {
        const historyData = {
          thread_id: threadId,
          query: query,
          type: 'light',
          model: 'light',
          chat_history: finalMessages,
          timestamp: Date.now(),
          title: title || query
        }
        localStorage.setItem(threadId, JSON.stringify(historyData))
        syncToBackend(finalMessages, historyData.title)
      }
      setIsLoading(false)
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '请求失败，请稍后重试。'
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: errorMessage }
        return copy
      })
      setIsLoading(false)
    }
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shouldSubmitOnEnter(e)) return
    e.preventDefault()
    handleSend()
  }

  return (
    <div className="flex flex-col h-full bg-[var(--background)] relative" ref={containerRef}>
      <TextSelectionMenu
        containerRef={containerRef}
        showCheckSource={false}
        onFollowUp={(text) => setFollowUpText(text)}
      />
      {/* Header */}
      <header className="flex-shrink-0 h-14 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-between px-4 z-30 sticky top-0 relative">
        <div className="flex items-center w-10 flex-shrink-0">
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
            {title || query}
          </span>
        </div>

        <div className="w-10 flex-shrink-0" /> {/* Spacer */}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-8">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                            max-w-[85%] rounded-2xl px-5 py-3 flex flex-col gap-2
                            ${msg.role === 'user'
                    ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                    : 'bg-transparent text-[var(--foreground)]'
                  }
                        `}
              >
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
                    {msg.role === 'assistant' && msg.use_search && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] bg-[var(--secondary)]/50 w-fit px-2.5 py-1 rounded-md mb-2 border border-[var(--border-subtle)]/50">
                        <Globe size={12} className="opacity-70" />
                        <span>Searched the web</span>
                      </div>
                    )}
                    <div className={`max-w-none ${msg.role === 'user' ? 'prose prose-sm dark:prose-invert' : 'blog-markdown light-chat-markdown markdown-body text-[16px] leading-[1.8]'}`}>
                      {msg.role === 'user' && msg.follow_up_content && (
                        <div className="mb-2 pl-3 py-1.5 border-l-[3px] border-[var(--foreground)]/30 text-[var(--foreground)]/80 text-sm line-clamp-3">
                          {msg.follow_up_content}
                        </div>
                      )}
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={markdownComponents}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.role === 'assistant' && (
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
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask a follow-up..."
            disabled={isLoading}
            className="w-full bg-white dark:bg-[#121212] text-[var(--foreground)] rounded-full pl-5 pr-12 py-3.5 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-sm border border-[var(--border-subtle)]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`
                            absolute right-2 top-1/2 -translate-y-1/2 
                            flex items-center justify-center p-2 rounded-lg transition-all duration-200
                            ${!input.trim() || isLoading
                ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                : 'bg-[var(--accent)] text-white hover:opacity-90'
              }
                        `}
          >
            <ArrowUp size={18} />
          </button>
        </div>
        <div className="text-center mt-2 text-xs text-[var(--muted-foreground)] opacity-60">
          Answers generated by AI. Check important info.
        </div>
      </div>
    </div>
  )
}
