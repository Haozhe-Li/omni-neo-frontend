'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowUp, Copy, ThumbsUp, ThumbsDown, Share } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface LightChatViewProps {
    query: string
    threadId: string
    onNewSearch: () => void
}

interface Message {
    role: 'user' | 'assistant'
    content: string
}

export function LightChatView({ query, threadId, onNewSearch }: LightChatViewProps) {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'user', content: query },
        { role: 'assistant', content: '...' } // Loading placeholder
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

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

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, thread_id: threadId })
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

                const newMessages: Message[] = [
                    { role: 'user', content: query },
                    { role: 'assistant', content: answer }
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
                        timestamp: Date.now()
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

        const userMsg: Message = { role: 'user', content: input }
        const newHistory = [...messages, userMsg]
        setMessages([...newHistory, { role: 'assistant', content: '...' }])
        setInput('')
        setIsLoading(true)

        if (threadId) {
            // Save immediately with user message (without loading placeholder)
            const historyData = {
                thread_id: threadId,
                query: query,
                type: 'light',
                chat_history: newHistory,
                timestamp: Date.now()
            }
            localStorage.setItem(threadId, JSON.stringify(historyData))
        }

        try {
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
            const endpoint = baseUrl.endsWith('/') ? `${baseUrl}light_chat` : `${baseUrl}/light_chat`

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: input, thread_id: threadId })
            })

            if (!res.ok) throw new Error("Failed to fetch")

            let data = await res.json()
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data)
                } catch (e) { }
            }

            const answer = data.answer || (typeof data === 'string' ? data : "No answer returned.")

            setMessages(prev => {
                const copy = [...prev]
                // Replace loading
                copy[copy.length - 1] = { role: 'assistant', content: answer }

                // Save
                if (threadId) {
                    const historyData = {
                        thread_id: threadId,
                        query: query, // Main query remains the first one?
                        type: 'light',
                        model: 'light',
                        chat_history: copy,
                        timestamp: Date.now()
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
        <div className="flex flex-col h-screen bg-[var(--background)] relative">
            {/* Header */}
            <header className="flex-shrink-0 h-14 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center pl-14 pr-4 md:px-4 z-10 sticky top-0">

                <div className="flex-1 text-center font-medium text-[var(--foreground)] truncate">
                    {query}
                </div>
                <div className="w-10" /> {/* Spacer */}
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
                                    <div className="flex gap-1 h-6 items-center">
                                        <div className="w-1.5 h-1.5 bg-[var(--muted-foreground)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-1.5 h-1.5 bg-[var(--muted-foreground)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-1.5 h-1.5 bg-[var(--muted-foreground)] rounded-full animate-bounce" />
                                    </div>
                                ) : (
                                    <>
                                        <div className={`prose prose-sm dark:prose-invert max-w-none ${msg.role === 'user' ? '' : 'leading-7'}`}>
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
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 p-4 bg-[var(--background)] border-t border-[var(--border-subtle)]">
                <div className="max-w-2xl mx-auto relative">
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
