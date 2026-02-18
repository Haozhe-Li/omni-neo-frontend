'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { MessageSquare, Plus, Settings, Trash2, Sidebar as SidebarIcon, PanelLeftClose, PanelLeftOpen, Menu, ArrowLeft, Palette, Bot, Info, History, Zap, Layout, Database } from 'lucide-react'
import type { TodoItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StoredChat {
    thread_id: string
    query: string
    timestamp: number
    model?: string
}

interface AppSidebarProps {
    currentThreadId?: string | null
    onSelectThread?: (threadId: string, query: string) => void
    onNewChat?: () => void
    className?: string
    // Variant props removed as we unified the sidebar
    isOpen?: boolean
    onToggle?: () => void
    isMobile?: boolean
}

export function AppSidebar({
    currentThreadId,
    onSelectThread,
    onNewChat,
    className = '',
    // Variant props removed from interface but might be passed for compatibility, ignoring them
    isOpen = true,
    onToggle,
    isMobile = false
}: AppSidebarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [history, setHistory] = useState<StoredChat[]>([])
    // Removed internal state for isOpen/isMobile as they are now controlled

    const loadHistory = useCallback(() => {
        if (typeof window === 'undefined') return
        const items: StoredChat[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key) continue
            try {
                const raw = localStorage.getItem(key)
                if (!raw) continue
                const data = JSON.parse(raw)
                // Simple validation to ensure it's our chat data
                if (data.thread_id && (data.query || data.title) && data.timestamp) {
                    items.push({
                        thread_id: data.thread_id,
                        query: data.title || data.query, // Prefer title if available
                        timestamp: data.timestamp,
                        model: data.model // Add model loading
                    })
                }
            } catch (e) {
                // Not a chat item, ignore
            }
        }
        items.sort((a, b) => b.timestamp - a.timestamp)
        setHistory(items)
    }, [])

    useEffect(() => {
        loadHistory()
        const handleStorage = () => loadHistory()
        window.addEventListener('storage', handleStorage)
        const interval = setInterval(loadHistory, 2000)
        return () => {
            window.removeEventListener('storage', handleStorage)
            clearInterval(interval)
        }
    }, [loadHistory])

    const handleDelete = (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation()
        if (typeof window !== 'undefined') {
            localStorage.removeItem(threadId)
            loadHistory()
            // If deleted active thread, maybe go to new chat?
            if (threadId === currentThreadId && onNewChat) {
                onNewChat()
            }
        }
    }

    // On mobile, the sidebar content is always "expanded" when visible (in drawer).
    // On desktop, it follows the collapsed/expanded state.
    const isExpanded = isMobile ? true : isOpen

    const SidebarContent = (
        <>
            {/* Header / Toggle */}
            <div className={`
                flex items-center p-4 
                ${isExpanded ? 'h-16 justify-between' : 'flex-col gap-4 py-4'}
            `}>
                {isExpanded ? (
                    <>
                        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
                            <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-sm border border-[var(--border-subtle)]">
                                <Image
                                    src="/android-chrome-512x512.png"
                                    alt="Omni Logo"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        </Link>
                        {!isMobile && (
                            <button
                                onClick={onToggle}
                                className="p-1.5 hover:bg-[var(--secondary)] rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                title="Collapse sidebar"
                            >
                                <PanelLeftClose size={18} />
                            </button>
                        )}
                        {/* Mobile close button is usually handled by clicking outside, but we can add an X if needed.
                            For now, let's keep the desktop approach or just hide the toggle on mobile since it's a drawer. 
                        */}
                    </>
                ) : (
                    <button
                        onClick={onToggle}
                        className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-sm border border-[var(--border-subtle)] group hover:border-[var(--muted-foreground)] transition-all"
                        title="Expand sidebar"
                    >
                        <div className="absolute inset-0 transition-opacity duration-200 group-hover:opacity-0">
                            <Image
                                src="/android-chrome-512x512.png"
                                alt="Omni Logo"
                                fill
                                className="object-cover"
                            />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--secondary)] opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[var(--foreground)]">
                            <PanelLeftOpen size={18} />
                        </div>
                    </button>
                )}
            </div>

            {/* Main Action Button (New Chat) */}
            <div className="px-3 pb-2">
                <button
                    onClick={() => {
                        if (onNewChat) onNewChat()
                        if (isMobile && onToggle) onToggle()
                    }}
                    className={`
                    flex items-center gap-3 w-full p-2 rounded-lg 
                    hover:bg-[var(--secondary)] 
                    text-[var(--foreground)]
                    transition-all duration-200
                    ${!isExpanded ? 'justify-center' : ''}
                `}
                    title="New Chat"
                >
                    <div className="flex items-center justify-center p-1 rounded-md bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                        <Plus size={18} />
                    </div>
                    {isExpanded && <span className="text-sm font-medium">New Thread</span>}
                </button>
            </div>

            {/* List Content (History) */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 space-y-1 custom-scrollbar">
                {isExpanded ? (
                    <>
                        {history.map((chat) => (
                            <button
                                key={chat.thread_id}
                                onClick={() => {
                                    if (onSelectThread) onSelectThread(chat.thread_id, chat.query)
                                    if (isMobile && onToggle) onToggle()
                                }}
                                className={`
                      group relative flex items-center gap-3 w-full p-2 rounded-lg text-left transition-all duration-200
                      ${currentThreadId === chat.thread_id
                                        ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                                        : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'
                                    }
                    `}
                                title={chat.query}
                            >
                                {chat.model === 'canvas' ? (
                                    <Layout size={16} className="min-w-[16px]" />
                                ) : (
                                    <MessageSquare size={16} className="min-w-[16px]" />
                                )}
                                <span className="text-sm truncate pr-6 flex-1">
                                    {chat.query}
                                </span>
                                <div
                                    onClick={(e) => handleDelete(e, chat.thread_id)}
                                    className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--secondary)] rounded text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-all"
                                    role="button"
                                    aria-label="Delete chat"
                                >
                                    <Trash2 size={12} />
                                </div>
                            </button>
                        ))}
                        {history.length === 0 && (
                            <div className="px-2 py-4 text-center text-xs text-[#A1A1A1]">
                                No history yet
                            </div>
                        )}
                    </>
                ) : (
                    <button
                        onClick={onToggle}
                        className="flex items-center justify-center w-full p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-all duration-200"
                        title="Show History"
                    >
                        <History size={18} />
                    </button>
                )}
            </div>

            {/* Footer / Settings */}
            <div className="p-3 border-t border-[var(--border-subtle)]">
                <button
                    onClick={() => {
                        if (pathname !== '/settings') {
                            router.push('/settings')
                        }
                        if (isMobile && onToggle) onToggle()
                    }}
                    className={`
                flex items-center gap-3 w-full p-2 rounded-lg 
                text-[var(--muted-foreground)]
                hover:bg-[var(--secondary)] hover:text-[var(--foreground)]
                transition-all duration-200
                ${!isExpanded ? 'justify-center' : ''}
                ${pathname === '/settings' ? 'bg-[var(--secondary)] text-[var(--foreground)]' : ''}
            `}
                >
                    <Settings size={18} />
                    {isExpanded && <span className="text-sm">Settings</span>}
                </button>
            </div>
        </>
    )

    if (isMobile) {
        return (
            <>
                {/* Fixed toggle button removed - now handled by page headers */}

                <div
                    className={cn(
                        "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-all duration-300",
                        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                    onClick={onToggle}
                />

                <aside
                    className={cn(
                        "fixed inset-y-0 left-0 z-50 flex flex-col h-full w-64 shadow-xl",
                        "bg-[rgba(243,243,238,0.95)] dark:bg-[rgba(25,26,26,0.95)] backdrop-blur-md",
                        "border-r border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]",
                        "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                        isOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    {SidebarContent}
                </aside>
            </>
        )
    }

    return (
        <aside
            className={cn(
                "relative flex flex-col h-full",
                "bg-[rgba(243,243,238,0.8)] dark:bg-[rgba(25,26,26,0.8)] backdrop-blur-md",
                "border-r border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]",
                "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                isExpanded ? 'w-64' : 'w-16',
                className
            )}
        >
            {SidebarContent}
        </aside>
    )
}
