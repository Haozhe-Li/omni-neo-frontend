'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Plus, Settings, Trash2, Sidebar as SidebarIcon, PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react'
import type { TodoItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StoredChat {
    thread_id: string
    query: string
    timestamp: number
    // We only need these for the list preview/ordering
}

interface AppSidebarProps {
    currentThreadId: string | null
    onSelectThread: (threadId: string, query: string) => void
    onNewChat: () => void
    onOpenSettings: () => void
    className?: string
}

export function AppSidebar({ currentThreadId, onSelectThread, onNewChat, onOpenSettings, className = '' }: AppSidebarProps) {
    const [history, setHistory] = useState<StoredChat[]>([])
    const [isOpen, setIsOpen] = useState(true)
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            const isMobileView = window.innerWidth < 768
            setIsMobile(isMobileView)
            if (isMobileView) {
                setIsOpen(false)
            } else {
                setIsOpen(true)
            }
        }

        checkMobile()

        const handleResize = () => {
            const isMobileView = window.innerWidth < 768
            setIsMobile(isMobileView)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

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
                if (data.thread_id && data.query && data.timestamp) {
                    items.push({
                        thread_id: data.thread_id,
                        query: data.query,
                        timestamp: data.timestamp
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
        // Listen for storage events (e.g. new chat created in another tab or this tab)
        const handleStorage = () => loadHistory()
        window.addEventListener('storage', handleStorage)

        // Poll occasionally to keep it simple and robust
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
            if (threadId === currentThreadId) {
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
            <div className="flex items-center justify-between p-4 h-14">
                {isExpanded && (
                    <span className="font-medium text-sm text-[var(--foreground)] opacity-60">History</span>
                )}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-1 hover:bg-[var(--secondary)] rounded-md transition-colors text-[var(--muted-foreground)]"
                    title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </button>
            </div>

            {/* New Chat Button */}
            <div className="px-3 pb-2">
                <button
                    onClick={() => {
                        onNewChat()
                        if (isMobile) setIsOpen(false)
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

            {/* History List */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 space-y-1 custom-scrollbar">
                {history.map((chat) => (
                    <button
                        key={chat.thread_id}
                        onClick={() => {
                            onSelectThread(chat.thread_id, chat.query)
                            if (isMobile) setIsOpen(false)
                        }}
                        className={`
              group relative flex items-center gap-3 w-full p-2 rounded-lg text-left transition-all duration-200
              ${currentThreadId === chat.thread_id
                                ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                                : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'
                            }
              ${!isExpanded ? 'justify-center' : ''}
            `}
                        title={chat.query}
                    >
                        <MessageSquare size={16} className="min-w-[16px]" />
                        {isExpanded && (
                            <>
                                <span className="text-sm truncate pr-6 flex-1">
                                    {chat.query}
                                </span>
                            </>
                        )}
                        {isExpanded && (
                            <div
                                onClick={(e) => handleDelete(e, chat.thread_id)}
                                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--secondary)] rounded text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-all"
                                role="button"
                                aria-label="Delete chat"
                            >
                                <Trash2 size={12} />
                            </div>
                        )}
                    </button>
                ))}
                {history.length === 0 && isExpanded && (
                    <div className="px-2 py-4 text-center text-xs text-[#A1A1A1]">
                        No history yet
                    </div>
                )}
            </div>

            {/* Footer / Settings */}
            <div className="p-3 border-t border-[var(--border-subtle)]">
                <button
                    onClick={() => {
                        onOpenSettings()
                        if (isMobile) setIsOpen(false)
                    }}
                    className={`
                flex items-center gap-3 w-full p-2 rounded-lg 
                text-[var(--muted-foreground)]
                hover:bg-[var(--secondary)] hover:text-[var(--foreground)]
                transition-all duration-200
                ${!isExpanded ? 'justify-center' : ''}
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
                <button
                    onClick={() => setIsOpen(true)}
                    className={cn(
                        "fixed top-3 left-3 z-50 p-2 rounded-md bg-background/80 backdrop-blur-md border border-border shadow-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-300",
                        isOpen ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"
                    )}
                    aria-label="Open sidebar"
                >
                    <Menu size={20} />
                </button>

                <div
                    className={cn(
                        "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-all duration-300",
                        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                    onClick={() => setIsOpen(false)}
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
