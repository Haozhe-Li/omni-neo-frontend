'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { MessageSquare, Plus, Settings, Trash2, Sidebar as SidebarIcon, PanelLeftClose, PanelLeftOpen, Menu, ArrowLeft, Palette, Bot, Info, History, Zap, Layout, Database, Search, X, LogIn, LogOut, Loader2, User, Globe, BookOpen, ExternalLink } from 'lucide-react'
import { SignUpButton, useAuth, useUser, useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'
import type { TodoItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface StoredChat {
    thread_id: string
    query: string
    timestamp: number
    model?: string
    isExpiring?: boolean
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
    const { isSignedIn } = useAuth()
    const { user } = useUser()
    const clerk = useClerk()
    const { fetchWithAuth } = useApi()
    const [mounted, setMounted] = useState(false)
    const [history, setHistory] = useState<StoredChat[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [isSyncing, setIsSyncing] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    // ── 1. Fast localStorage scan (runs every 2 s, no network) ────────
    const loadLocalHistory = useCallback(() => {
        if (typeof window === 'undefined') return
        const items: StoredChat[] = []
        const now = Date.now()
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
        const TWO_DAYS = 2 * 24 * 60 * 60 * 1000

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key) continue
            try {
                const raw = localStorage.getItem(key)
                if (!raw) continue
                const data = JSON.parse(raw)
                if (data.thread_id && (data.query || data.title) && data.timestamp) {
                    const age = now - data.timestamp
                    if (age > THREE_DAYS) { localStorage.removeItem(key); continue }
                    items.push({
                        thread_id: data.thread_id,
                        query: data.title || data.query,
                        timestamp: data.timestamp,
                        model: data.model,
                        isExpiring: age > TWO_DAYS
                    })
                }
            } catch { }
        }
        items.sort((a, b) => b.timestamp - a.timestamp)
        setHistory(items)
    }, [])

    // ── 2. Backend sync (runs once on mount + on auth change) ────────
    const syncFromBackend = useCallback(async () => {
        if (!isSignedIn) return
        setIsSyncing(true)
        try {
            const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
            const res = await fetchWithAuth(`${backendUrl}/api/threads`)
            if (!res.ok) return
            const data = await res.json()
            if (!data.threads || !Array.isArray(data.threads)) return

            const remoteItems: StoredChat[] = data.threads.map((t: any) => ({
                thread_id: t.thread_id,
                query: t.title || 'Untitled Chat',
                timestamp: new Date(t.updated_at).getTime(),
                model: 'auto',
                isExpiring: false,
            }))

            remoteItems.sort((a, b) => b.timestamp - a.timestamp)
            setHistory(remoteItems)
        } catch { }
        finally { setIsSyncing(false) }
    }, [isSignedIn, fetchWithAuth])

    // Poll localStorage every 2 s (cheap, no network)
    useEffect(() => {
        if (isSignedIn) return
        loadLocalHistory()
        const handleStorage = () => loadLocalHistory()
        window.addEventListener('storage', handleStorage)
        const interval = setInterval(loadLocalHistory, 2000)
        return () => {
            window.removeEventListener('storage', handleStorage)
            clearInterval(interval)
        }
    }, [isSignedIn, loadLocalHistory])

    // Sync from backend once on mount and whenever auth state changes
    useEffect(() => {
        if (!mounted) return
        if (isSignedIn) {
            syncFromBackend()
        } else {
            loadLocalHistory()
        }
    }, [mounted, isSignedIn, syncFromBackend, loadLocalHistory])

    // Keep cloud list fresh for multi-device usage (controlled interval)
    useEffect(() => {
        if (!mounted || !isSignedIn) return
        const interval = setInterval(syncFromBackend, 15000)
        const onFocus = () => syncFromBackend()
        window.addEventListener('focus', onFocus)
        return () => {
            clearInterval(interval)
            window.removeEventListener('focus', onFocus)
        }
    }, [mounted, isSignedIn, syncFromBackend])

    const removeThreadLocalCache = useCallback((threadId: string) => {
        if (typeof window === 'undefined') return [] as Array<{ key: string; value: string }>
        const removed: Array<{ key: string; value: string }> = []
        const keys = Object.keys(localStorage)
        for (const key of keys) {
            const value = localStorage.getItem(key)
            if (!value) continue

            let shouldRemove = key === threadId || key.endsWith(`_chat_${threadId}`)
            if (!shouldRemove) {
                try {
                    const data = JSON.parse(value)
                    shouldRemove = data?.thread_id === threadId
                } catch { }
            }

            if (shouldRemove) {
                removed.push({ key, value })
                localStorage.removeItem(key)
            }
        }
        return removed
    }, [])

    const restoreRemovedLocalCache = useCallback((items: Array<{ key: string; value: string }>) => {
        if (typeof window === 'undefined') return
        items.forEach(item => localStorage.setItem(item.key, item.value))
    }, [])

    const handleDelete = async (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation()
        if (typeof window !== 'undefined') {
            const removedLocalItems = removeThreadLocalCache(threadId)
            setHistory(prev => prev.filter(item => item.thread_id !== threadId))

            if (!isSignedIn) {
                // Guest mode is local-only: skip cloud delete
                if (threadId === currentThreadId && onNewChat) {
                    onNewChat()
                }
                return
            }

            try {
                const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
                const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadId}`, { method: 'DELETE' })
                if (!res.ok) {
                    restoreRemovedLocalCache(removedLocalItems)
                    if (isSignedIn) {
                        syncFromBackend()
                    } else {
                        loadLocalHistory()
                    }
                    toast.error('Delete failed on server')
                    return
                }

                // If deleted active thread, go to new chat
                if (threadId === currentThreadId && onNewChat) {
                    onNewChat()
                }

                if (isSignedIn) {
                    syncFromBackend()
                }
            } catch {
                restoreRemovedLocalCache(removedLocalItems)
                if (isSignedIn) {
                    syncFromBackend()
                } else {
                    loadLocalHistory()
                }
                toast.error('Network error while deleting thread')
            }
        }
    }

    // On mobile, the sidebar content is always "expanded" when visible (in drawer).
    // On desktop, it follows the collapsed/expanded state.
    const isExpanded = isMobile ? true : isOpen

    const filteredHistory = history.filter(chat =>
        chat.query.toLowerCase().includes(searchQuery.toLowerCase())
    )

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
                            <div className="flex items-center gap-1">
                                {isSyncing && (
                                    <span title="Syncing…" className="flex items-center px-1">
                                        <Loader2 size={13} className="animate-spin text-[var(--muted-foreground)]" />
                                    </span>
                                )}
                                <button
                                    onClick={onToggle}
                                    className="p-1.5 hover:bg-[var(--secondary)] rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                    title="Collapse sidebar"
                                >
                                    <PanelLeftClose size={18} />
                                </button>
                            </div>
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
            <div className="px-3 pb-2 space-y-2">
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

                {/* Pages Link */}
                <Link
                    href="/pages"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => { if (isMobile && onToggle) onToggle() }}
                    className={`
                        flex items-center gap-3 w-full p-2 rounded-lg 
                        hover:bg-[var(--secondary)] 
                        transition-all duration-200
                        ${!isExpanded ? 'justify-center' : ''}
                        ${pathname === '/pages'
                            ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                            : 'text-[var(--foreground)]'}
                    `}
                    title="Omni Pages (Opens in new tab)"
                >
                    <div className="flex items-center justify-center p-1 rounded-md bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                        <BookOpen size={18} />
                    </div>
                    {isExpanded && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                            <span className="text-sm font-medium">Pages</span>
                            <ExternalLink size={12} className="opacity-50" />
                        </div>
                    )}
                </Link>

                {/* Search Input */}
                {isExpanded && (
                    <div className="relative group mt-2">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] group-focus-within:text-[var(--foreground)] transition-colors" />
                        <input
                            type="text"
                            placeholder="Search history..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[var(--background)] border border-[var(--border-subtle)] rounded-lg pl-9 pr-8 py-2 md:py-1.5 text-[16px] md:text-sm outline-none focus:border-[var(--muted-foreground)] transition-colors text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-md transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* List Content (History) */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 space-y-1 custom-scrollbar">
                {isExpanded ? (
                    <>
                        {filteredHistory.map((chat) => (
                            <button
                                key={chat.thread_id}
                                onClick={() => {
                                    if (onSelectThread) onSelectThread(chat.thread_id, chat.query)
                                    if (isMobile && onToggle) onToggle()
                                }}
                                className={`
                      group relative flex items-start gap-3 w-full p-2 rounded-lg text-left transition-all duration-200
                      ${currentThreadId === chat.thread_id
                                        ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                                        : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'
                                    }
                    `}
                                title={chat.query}
                            >
                                <div className="mt-0.5">
                                    {chat.model === 'canvas' ? (
                                        <Layout size={16} className="min-w-[16px]" />
                                    ) : (
                                        <MessageSquare size={16} className="min-w-[16px]" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0 flex-1 pr-5">
                                    <span className="text-sm truncate w-full">
                                        {chat.query}
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] opacity-60">
                                            {formatDistanceToNow(chat.timestamp, { addSuffix: true })}
                                        </span>
                                        {chat.isExpiring && (
                                            <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1" title="Will disappear if unused for 3 days">
                                                Expires soon
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div
                                    onClick={(e) => handleDelete(e, chat.thread_id)}
                                    className={`absolute right-2 top-2 p-1 hover:bg-[var(--background)] rounded text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-all ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                    role="button"
                                    aria-label="Delete chat"
                                >
                                    <Trash2 size={12} />
                                </div>
                            </button>
                        ))}
                        {filteredHistory.length === 0 && (
                            <div className="px-2 py-4 text-center text-xs text-[#A1A1A1]">
                                {searchQuery ? 'No results found' : 'No history yet'}
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

            {/* Footer / Settings + User */}
            <div className="p-3 border-t border-[var(--border-subtle)] space-y-1">
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

                {/* Auth row — only render after mount to avoid SSR/client hydration mismatch */}
                {mounted && (
                    isSignedIn ? (
                        <div className={`
                            flex items-center gap-3 w-full p-2 rounded-lg
                            text-[var(--muted-foreground)]
                            ${!isExpanded ? 'justify-center' : ''}
                        `}>
                            {user?.imageUrl ? (
                                <img
                                    src={user.imageUrl}
                                    alt=""
                                    className="w-[22px] h-[22px] rounded-full shrink-0 ring-1 ring-[var(--border-subtle)]"
                                />
                            ) : (
                                <div className="w-[22px] h-[22px] rounded-full bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                                    <User size={12} className="text-[var(--accent)]" />
                                </div>
                            )}
                            {isExpanded && (
                                <>
                                    <span className="text-sm truncate flex-1">
                                        {user?.firstName || 'Account'}
                                    </span>
                                    <button
                                        onClick={async () => {
                                            await clerk.signOut()
                                            if (typeof window !== 'undefined') {
                                                window.location.reload()
                                            }
                                        }}
                                        className="p-1 rounded-md hover:bg-red-500/10 hover:text-red-500 transition-colors shrink-0"
                                        title="Sign Out"
                                    >
                                        <LogOut size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <SignUpButton mode="modal">
                            <button
                                className={`
                                    flex items-center gap-3 w-full p-2 rounded-lg
                                    text-[var(--muted-foreground)]
                                    hover:bg-[var(--secondary)] hover:text-[var(--foreground)]
                                    transition-all duration-200
                                    ${!isExpanded ? 'justify-center' : ''}
                                `}
                                title="Get started to sync your history and settings"
                            >
                                <User size={18} />
                                {isExpanded && <span className="text-sm">Sign In</span>}
                            </button>
                        </SignUpButton>
                    )
                )}
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
