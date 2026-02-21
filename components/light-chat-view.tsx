'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowUp, Copy, ThumbsUp, ThumbsDown, Share, Menu, Search, Globe, X } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { getUserLocation } from '@/lib/location'
import { getLocalISOString } from '@/lib/utils'
import { appendQueryToMemoryQueue, getMemories } from '@/lib/memories'

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

export function LightChatView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false }: LightChatViewProps) {
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
            // 1. Try LocalStorage
            if (typeof window !== 'undefined' && threadId) {
                const stored = localStorage.getItem(threadId)
                if (stored) {
                    try {
                        const data = JSON.parse(stored)
                        if (data.thread_id === threadId) {
                            // 1. Check for Light Mode history (Preferred)
                            if (data.type === 'light' && data.chat_history && Array.isArray(data.chat_history)) {
                                setMessages(data.chat_history)
                                if (data.title) setTitle(data.title)
                                setIsLoading(false)
                                return
                            }

                            // 2. Fallback: Check for Canvas Mode history (if we want to support viewing it)
                            // Canvas uses `messages` (SSE steps) and `final_answer`.
                            // For now, if we are in Light mode but open a Canvas thread, we might just show the final answer?
                            // Or better, if `messages` exists but it's not light mode, we might want to try to render what we can.
                            // But for the specific bug "history not saving/restoring in light mode", the above check fixes it.

                            // Let's keep the existing check for safety/compatibility if needed, but the above is what matters.
                        }
                    } catch (e) {
                        console.error("Failed to parse storage", e)
                    }
                }
            }

            // 2. If no valid history, start fresh fetch
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

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })

                if (!res.ok) throw new Error("Failed to fetch")

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
                }

            } catch (e) {
                console.error(e)
                setMessages(prev => {
                    const copy = [...prev]
                    copy[1] = { role: 'assistant', content: "Sorry, something went wrong." }
                    return copy
                })
                setIsLoading(false)
            }
        }

        initChat()
    }, [threadId]) // Only run once per threadId change

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
                query: input,
                thread_id: threadId,
                ...(currentFollowUpText ? { follow_up_content: currentFollowUpText } : {})
            }

            if (Object.keys(personalization).length > 0) {
                payload.personalization = personalization
            }

            appendQueryToMemoryQueue(input)

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error("Failed to fetch")

            let data = await res.json()
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data)
                } catch (e) { }
            }

            const answer = data.answer || (typeof data === 'string' ? data : "No answer returned.")
            const use_search = !!data.use_search

            setMessages(prev => {
                const copy = [...prev]
                // Replace loading
                copy[copy.length - 1] = { role: 'assistant', content: answer, use_search }

                // Save
                if (threadId) {
                    const historyData = {
                        thread_id: threadId,
                        query: query, // Main query remains the first one?
                        type: 'light',
                        model: 'light',
                        chat_history: copy,
                        timestamp: Date.now(),
                        title: title || query
                    }
                    localStorage.setItem(threadId, JSON.stringify(historyData))
                }

                return copy
            })
            setIsLoading(false)
        } catch (e) {
            setMessages(prev => {
                const copy = [...prev]
                copy[copy.length - 1] = { role: 'assistant', content: "Error getting response." }
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
                                        <div className={`dark:prose-invert max-w-none ${msg.role === 'user' ? 'prose prose-sm' : 'prose prose-p:text-[16px] prose-li:text-[16px] md:prose-p:text-[15px] md:prose-li:text-[15px] prose-p:leading-[1.75] prose-li:leading-[1.75]'}`}>
                                            {msg.role === 'user' && msg.follow_up_content && (
                                                <div className="mb-2 pl-3 py-1.5 border-l-[3px] border-[var(--foreground)]/30 text-[var(--foreground)]/80 text-sm line-clamp-3">
                                                    {msg.follow_up_content}
                                                </div>
                                            )}
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeHighlight]}
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
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
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
