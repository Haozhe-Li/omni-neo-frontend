'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { MessageSquare, Plus, Settings, Trash2, Sidebar as SidebarIcon, PanelLeftClose, PanelLeftOpen, Menu, ArrowLeft, Palette, Bot, Info, History, Zap, Telescope, Database, Search, X, LogIn, LogOut, Loader2, User, Globe, Library, SquarePen } from 'lucide-react'
import { SignUpButton, useAuth, useUser, useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'
import type { TodoItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SettingsDialog } from '@/components/settings-dialog'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog'

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
    const [generatingThreadIds, setGeneratingThreadIds] = useState<Set<string>>(new Set())
    // Threads optimistically shown while generating, before the backend list has
    // them (a brand-new thread has no title yet, so /api/threads filters it out).
    const [optimisticThreads, setOptimisticThreads] = useState<Map<string, StoredChat>>(new Map())
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<StoredChat[] | null>(null)
    const [isSearchLoading, setIsSearchLoading] = useState(false)
    const searchRequestIdRef = useRef(0)
    const [isSearchVisible, setIsSearchVisible] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [loadingAction, setLoadingAction] = useState<string | null>(null)
    const pagesActive = !!pathname && (pathname === '/pages' || pathname.startsWith('/pages/'))

    useEffect(() => { setMounted(true) }, [])

    // Scan localStorage on mount for any threads that were generating when the
    // user left. The marker value holds the thread's title, so we can rebuild an
    // optimistic sidebar entry and keep it visible across reloads.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const ids = new Set<string>()
        const opt = new Map<string, StoredChat>()
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (!k?.startsWith('omni:gen:')) continue
            const id = k.slice(9)
            ids.add(id)
            const stored = localStorage.getItem(k)
            const title = !stored || stored === '1' ? 'New thread' : stored
            opt.set(id, { thread_id: id, query: title, timestamp: Date.now(), model: 'auto' })
        }
        if (ids.size > 0) {
            setGeneratingThreadIds(ids)
            setOptimisticThreads(opt)
        }
    }, [])

    useEffect(() => {
        setLoadingAction(null)
    }, [pathname, currentThreadId])

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
        setHistory(prev => {
            if (
                prev.length === items.length &&
                prev.every((p, i) => p.thread_id === items[i].thread_id && p.timestamp === items[i].timestamp)
            ) return prev
            return items
        })
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

            const remoteItems: StoredChat[] = data.threads
                .filter((t: any) => {
                    // Filter out ghost threads that have no title (created by pre-fetching thread_id
                    // before the user typed anything). They have no meaningful content.
                    return t.title && t.title.trim() !== ''
                })
                .map((t: any) => ({
                    thread_id: t.thread_id,
                    query: t.title || 'Untitled Chat',
                    timestamp: new Date(t.updated_at).getTime(),
                    model: 'auto',
                    isExpiring: false,
                }))

            remoteItems.sort((a, b) => b.timestamp - a.timestamp)
            // Persist for instant render on next mount (eliminates blank-flash).
            try { localStorage.setItem('omni:threadlist', JSON.stringify(remoteItems)) } catch {}
            setHistory(prev => {
                if (
                    prev.length === remoteItems.length &&
                    prev.every((p, i) => p.thread_id === remoteItems[i].thread_id && p.timestamp === remoteItems[i].timestamp)
                ) return prev
                return remoteItems
            })
        } catch { }
        finally { setIsSyncing(false) }
    }, [isSignedIn, fetchWithAuth])

    // Debounce the search box before hitting the backend (200ms).
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 200)
        return () => clearTimeout(handler)
    }, [searchQuery])

    // Query the backend full-text search endpoint instead of matching locally.
    useEffect(() => {
        if (!debouncedSearchQuery) {
            setSearchResults(null)
            setIsSearchLoading(false)
            return
        }
        const requestId = ++searchRequestIdRef.current
        setIsSearchLoading(true)
        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
        fetchWithAuth(`${backendUrl}/api/threads/search?q=${encodeURIComponent(debouncedSearchQuery)}&limit=20`)
            .then(async (res) => {
                if (requestId !== searchRequestIdRef.current) return
                if (!res.ok) { setSearchResults([]); return }
                const data = await res.json()
                const results: StoredChat[] = Array.isArray(data.results)
                    ? data.results.map((r: any) => ({
                        thread_id: r.thread_id,
                        query: r.title || 'Untitled Chat',
                        timestamp: new Date(r.updated_at).getTime(),
                        model: 'auto',
                    }))
                    : []
                setSearchResults(results)
            })
            .catch(() => {
                if (requestId === searchRequestIdRef.current) setSearchResults([])
            })
            .finally(() => {
                if (requestId === searchRequestIdRef.current) setIsSearchLoading(false)
            })
    }, [debouncedSearchQuery, fetchWithAuth])

    // Listen for gen:start / gen:stop events from the chat view.
    // gen:start optimistically inserts the thread so it shows immediately (a
    // brand-new thread isn't in the backend list yet). gen:stop refreshes the
    // list so the now-persisted, titled thread replaces the optimistic entry.
    useEffect(() => {
        const onStart = (e: Event) => {
            const { threadId, title } = (e as CustomEvent<{ threadId: string; title?: string; mode?: string }>).detail
            setGeneratingThreadIds(prev => new Set([...prev, threadId]))
            setOptimisticThreads(prev => {
                if (prev.has(threadId)) return prev
                const next = new Map(prev)
                next.set(threadId, {
                    thread_id: threadId,
                    query: title && title.trim() ? title : 'New thread',
                    timestamp: Date.now(),
                    model: 'auto',
                })
                return next
            })
        }
        const onStop = (e: Event) => {
            const { threadId } = (e as CustomEvent<{ threadId: string }>).detail
            setGeneratingThreadIds(prev => { const s = new Set(prev); s.delete(threadId); return s })
            // Pull the freshly-completed thread (title now persisted) so the real
            // entry takes over from the optimistic one.
            if (isSignedIn) syncFromBackend()
        }
        // The LLM-generated title arrived — swap the live entry over from the raw query.
        const onTitle = (e: Event) => {
            const { threadId, title } = (e as CustomEvent<{ threadId: string; title?: string }>).detail
            if (!title || !title.trim()) return
            setOptimisticThreads(prev => {
                if (!prev.has(threadId)) return prev
                const next = new Map(prev)
                next.set(threadId, { ...next.get(threadId)!, query: title })
                return next
            })
            setHistory(prev => {
                let changed = false
                const updated = prev.map(c => {
                    if (c.thread_id === threadId && c.query !== title) { changed = true; return { ...c, query: title } }
                    return c
                })
                return changed ? updated : prev
            })
        }
        window.addEventListener('omni:gen:start', onStart)
        window.addEventListener('omni:gen:stop', onStop)
        window.addEventListener('omni:title', onTitle)
        return () => {
            window.removeEventListener('omni:gen:start', onStart)
            window.removeEventListener('omni:gen:stop', onStop)
            window.removeEventListener('omni:title', onTitle)
        }
    }, [isSignedIn, syncFromBackend])

    // Drop optimistic entries once the real history contains them.
    useEffect(() => {
        setOptimisticThreads(prev => {
            if (prev.size === 0) return prev
            const ids = new Set(history.map(h => h.thread_id))
            let changed = false
            const next = new Map(prev)
            for (const id of next.keys()) {
                if (ids.has(id)) { next.delete(id); changed = true }
            }
            return changed ? next : prev
        })
    }, [history])

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

    // Sync from backend once on mount and whenever auth state changes.
    // For signed-in users, pre-populate from cache so there's no blank flash
    // while the network request is in flight.
    useEffect(() => {
        if (!mounted) return
        if (isSignedIn) {
            try {
                const cached = localStorage.getItem('omni:threadlist')
                if (cached) setHistory(JSON.parse(cached))
            } catch {}
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

    const onSingleDeleteClick = (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation()
        setThreadToDelete(threadId)
    }

    const handleDeleteConfirm = async () => {
        if (!threadToDelete) return
        setIsDeleting(true)

        if (typeof window !== 'undefined') {
            const removedLocalItems = removeThreadLocalCache(threadToDelete)
            setHistory(prev => prev.filter(item => item.thread_id !== threadToDelete))
            setSearchResults(prev => prev ? prev.filter(item => item.thread_id !== threadToDelete) : prev)

            if (!isSignedIn) {
                // Guest mode: local-only
                if (threadToDelete === currentThreadId && onNewChat) {
                    onNewChat()
                }
                setThreadToDelete(null)
                setIsDeleting(false)
                return
            }

            try {
                const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
                const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadToDelete}`, { method: 'DELETE' })
                if (!res.ok) {
                    restoreRemovedLocalCache(removedLocalItems)
                    if (isSignedIn) {
                        syncFromBackend()
                    } else {
                        loadLocalHistory()
                    }
                    toast.error('Delete failed on server')
                    setThreadToDelete(null)
                    setIsDeleting(false)
                    return
                }

                // If deleted active thread, go to new chat
                if (threadToDelete === currentThreadId && onNewChat) {
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
        setThreadToDelete(null)
        setIsDeleting(false)
    }

    const handleBulkDelete = async () => {
        if (history.length === 0) {
            toast.error('No threads to delete')
            setIsDeleteConfirmOpen(false)
            return
        }
        setIsDeleting(true)
        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
        let deletedCount = 0
        let failedCount = 0

        if (isSignedIn) {
            const threadIds = history.map(chat => chat.thread_id)
            const BATCH_SIZE = 100 // backend truncates anything beyond this per request
            for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
                const batch = threadIds.slice(i, i + BATCH_SIZE)
                try {
                    const res = await fetchWithAuth(`${backendUrl}/api/threads/batch-delete`, {
                        method: 'POST',
                        body: JSON.stringify({ thread_ids: batch }),
                    })
                    if (res.ok) {
                        const data = await res.json()
                        const batchDeleted = Array.isArray(data.deleted) ? data.deleted.length : 0
                        deletedCount += batchDeleted
                        failedCount += batch.length - batchDeleted
                    } else {
                        failedCount += batch.length
                    }
                } catch {
                    failedCount += batch.length
                }
            }
        } else {
            deletedCount = history.length
        }

        // Force clear ALL local history regardless of cloud state
        if (typeof window !== 'undefined') {
            const keys = Object.keys(localStorage)
            for (const key of keys) {
                try {
                    const raw = localStorage.getItem(key)
                    if (raw) {
                        const data = JSON.parse(raw)
                        // If it matches the schema of a stored chat or a thread_id, delete it
                        if (data?.thread_id || key.includes('_chat_')) {
                            localStorage.removeItem(key)
                        }
                    }
                } catch {
                    // Also catch raw string thread ID keys if any
                    if (key.includes('_chat_')) {
                        localStorage.removeItem(key)
                    }
                }
            }
        }

        // Always go back to home after deleting all threads
        if (onNewChat) onNewChat()
        setIsSearchVisible(false)
        setSearchQuery('')
        if (isMobile && onToggle) onToggle()

        // Refresh list
        if (isSignedIn) {
            await syncFromBackend()
        } else {
            loadLocalHistory()
        }

        setIsDeleting(false)
        setIsDeleteConfirmOpen(false)

        if (failedCount > 0) {
            toast.error(`Deleted ${deletedCount} threads, ${failedCount} failed`)
        } else {
            toast.success(`Deleted ${deletedCount} thread${deletedCount !== 1 ? 's' : ''}`)
        }
    }

    // On mobile, the sidebar content is always "expanded" when visible (in drawer).
    // On desktop, it follows the collapsed/expanded state.
    const isExpanded = isMobile ? true : isOpen

    // Merge optimistic (currently-generating) threads that aren't in the backend
    // list yet, so a freshly-sent thread shows in the sidebar immediately.
    const displayHistory = useMemo(() => {
        if (optimisticThreads.size === 0) return history
        const ids = new Set(history.map(h => h.thread_id))
        const extra = [...optimisticThreads.values()].filter(o => !ids.has(o.thread_id))
        if (extra.length === 0) return history
        return [...extra, ...history].sort((a, b) => b.timestamp - a.timestamp)
    }, [history, optimisticThreads])

const trimmedSearchQuery = searchQuery.trim()
const filteredHistory = trimmedSearchQuery
    ? (debouncedSearchQuery === trimmedSearchQuery ? (searchResults ?? []) : [])
    : displayHistory

// While waiting on the debounce or the in-flight request, suppress the
// "No results" flash rather than rendering it prematurely.
const isSearchPending = !!trimmedSearchQuery && (debouncedSearchQuery !== trimmedSearchQuery || isSearchLoading)

    const searchGroupedHistory = useMemo(() => {
        const today: StoredChat[] = []
        const yesterday: StoredChat[] = []
        const previous7Days: StoredChat[] = []
        const previous30Days: StoredChat[] = []
        const older: StoredChat[] = []

        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        const yesterdayStart = todayStart - 86400000
        const sevenDaysStart = todayStart - 7 * 86400000
        const thirtyDaysStart = todayStart - 30 * 86400000

        for (const chat of filteredHistory) {
            if (chat.timestamp >= todayStart) today.push(chat)
            else if (chat.timestamp >= yesterdayStart) yesterday.push(chat)
            else if (chat.timestamp >= sevenDaysStart) previous7Days.push(chat)
            else if (chat.timestamp >= thirtyDaysStart) previous30Days.push(chat)
            else older.push(chat)
        }

        return [
            { label: 'Today', items: today },
            { label: 'Yesterday', items: yesterday },
            { label: 'Previous 7 Days', items: previous7Days },
            { label: 'Previous 30 Days', items: previous30Days },
            { label: 'Older', items: older }
        ].filter(g => g.items.length > 0)
    }, [filteredHistory])

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
                            <div className="relative w-8 h-8 shrink-0">
                                <Image
                                    src="/omni-logo-light.png"
                                    alt="Omni Logo"
                                    fill
                                    className="object-contain dark:hidden"
                                />
                                <Image
                                    src="/omni-logo-dark.png"
                                    alt="Omni Logo"
                                    fill
                                    className="object-contain hidden dark:block"
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
                        className="relative w-8 h-8 shrink-0 group transition-all"
                        title="Expand sidebar"
                    >
                        <div className="absolute inset-0 transition-opacity duration-200 group-hover:opacity-0">
                            <Image
                                src="/omni-logo-light.png"
                                alt="Omni Logo"
                                fill
                                className="object-contain dark:hidden"
                            />
                            <Image
                                src="/omni-logo-dark.png"
                                alt="Omni Logo"
                                fill
                                className="object-contain hidden dark:block"
                            />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--secondary)] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[var(--foreground)]">
                            <PanelLeftOpen size={18} />
                        </div>
                    </button>
                )}
            </div>

            {/* Main Action Button (New Chat) */}
            <div className="px-3 pb-2 space-y-2">
                <button
                    onClick={() => {
                        setLoadingAction('new-chat')
                        if (onNewChat) onNewChat()
                        setTimeout(() => setLoadingAction(null), 1000)
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
                    {isExpanded && (
                        <div className="flex items-center justify-between flex-1 min-w-0 pr-1">
                            <span className="text-sm font-medium">New Thread</span>
                            {loadingAction === 'new-chat' && <Loader2 size={14} className="animate-spin text-[var(--muted-foreground)]" />}
                        </div>
                    )}
                </button>

                {/* Pages */}
                <button
                    onClick={() => {
                        if (pathname !== '/pages') router.push('/pages')
                        if (isMobile && onToggle) onToggle()
                    }}
                    className={`
                        flex items-center gap-3 w-full p-2 rounded-lg
                        hover:bg-[var(--secondary)]
                        transition-all duration-200
                        ${!isExpanded ? 'justify-center' : ''}
                        ${pagesActive
                            ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                            : 'text-[var(--foreground)]'}
                    `}
                    title="Pages"
                >
                    <div className="flex items-center justify-center p-1 rounded-md bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                        <Library size={18} />
                    </div>
                    {isExpanded && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                            <span className="text-sm font-medium">Pages</span>
                        </div>
                    )}
                </button>

                {/* History Toggle Button */}
                <button
                    onClick={() => {
                        setIsSearchVisible(true)
                    }}
                    className={`
                        flex items-center gap-3 w-full p-2 rounded-lg 
                        hover:bg-[var(--secondary)] 
                        transition-all duration-200
                        ${!isExpanded ? 'justify-center' : ''}
                        text-[var(--foreground)]
                    `}
                    title="History"
                >
                    <div className="flex items-center justify-center p-1 rounded-md bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                        <History size={18} />
                    </div>
                    {isExpanded && <span className="text-sm font-medium">History</span>}
                </button>
            </div>

            {/* List Content (History) */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 space-y-1 custom-scrollbar">
                {isExpanded && (
                    <>
                        {filteredHistory.map((chat) => (
                            <button
                                key={chat.thread_id}
                                onClick={() => {
                                    if (currentThreadId !== chat.thread_id) {
                                        setLoadingAction(`thread_${chat.thread_id}`)
                                        if (onSelectThread) onSelectThread(chat.thread_id, chat.query)
                                    }
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
                                        <Telescope size={16} className="min-w-[16px]" />
                                    ) : (
                                        <MessageSquare size={16} className="min-w-[16px]" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0 flex-1 pr-5">
                                    <div className="flex items-center gap-1.5 w-full min-w-0">
                                        <span className="text-sm truncate flex-1">
                                            {chat.query}
                                        </span>
                                        {generatingThreadIds.has(chat.thread_id) && (
                                            <span className="relative flex h-2 w-2 shrink-0">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
                                            </span>
                                        )}
                                        {loadingAction === `thread_${chat.thread_id}` && (
                                            <Loader2 size={12} className="animate-spin text-[var(--muted-foreground)] shrink-0" />
                                        )}
                                    </div>
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
                                    onClick={(e) => onSingleDeleteClick(e, chat.thread_id)}
                                    className={`absolute right-2 top-2 p-1 hover:bg-[var(--background)] rounded text-[var(--muted-foreground)] hover:text-red-500 transition-all ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                    role="button"
                                    aria-label="Delete chat"
                                >
                                    <Trash2 size={12} />
                                </div>
                            </button>
                        ))}
                        {filteredHistory.length === 0 && (
                            <div className="px-2 py-4 text-center text-xs text-[#A1A1A1]">
                                No history yet
                            </div>
                        )}
                    </>
                )
                }
            </div >

            {/* Footer / Settings + User */}
            < div className="p-3 border-t border-[var(--border-subtle)] space-y-1" >
                <button
                    onClick={() => {
                        setIsSettingsOpen(true)
                        if (isMobile && onToggle) onToggle()
                    }}
                    className={`
                flex items-center gap-3 w-full p-2 rounded-lg
                text-[var(--muted-foreground)]
                hover:bg-[var(--secondary)] hover:text-[var(--foreground)]
                transition-all duration-200
                ${!isExpanded ? 'justify-center' : ''}
                ${isSettingsOpen ? 'bg-[var(--secondary)] text-[var(--foreground)]' : ''}
            `}
                >
                    <Settings size={18} />
                    {isExpanded && (
                        <div className="flex items-center justify-between flex-1 min-w-0 pr-1">
                            <span className="text-sm">Settings</span>
                        </div>
                    )}
                </button>

                {/* Auth row — only render after mount to avoid SSR/client hydration mismatch */}
                {
                    mounted && (
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
                    )
                }
            </div >

            {/* Settings Dialog */}
            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

            {/* Search Dialog Modal */}
            < Dialog open={isSearchVisible} onOpenChange={(open) => {
                setIsSearchVisible(open)
                if (!open) setSearchQuery('')
            }}>
                <DialogContent
                    showCloseButton={false}
                    overlayClassName="bg-black/5 dark:bg-black/40"
                    className="p-0 border-0 sm:border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl overflow-hidden flex flex-col gap-0 w-[100vw] h-[100dvh] max-w-none rounded-none !top-0 !left-0 !translate-x-0 !translate-y-0 sm:!top-[50%] sm:!left-[50%] sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:w-full sm:h-auto sm:max-h-[85vh] sm:max-w-[700px] sm:rounded-2xl"
                >
                    <DialogTitle className="sr-only">History</DialogTitle>

                    {/* Header Input */}
                    <div className="flex items-center px-4 py-3 border-b border-[var(--border-subtle)] gap-2">
                        <input
                            type="text"
                            placeholder="Search chats..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] h-8"
                            autoFocus
                        />
                        <button
                            onClick={() => {
                                setIsSearchVisible(false)
                                setSearchQuery('')
                            }}
                            className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-md transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                        <button
                            onClick={() => {
                                if (onNewChat) onNewChat()
                                setIsSearchVisible(false)
                                setSearchQuery('')
                                if (isMobile && onToggle) onToggle()
                            }}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--secondary)] text-[var(--foreground)] transition-colors text-left"
                        >
                            <div className="flex items-center justify-center p-1 rounded-md bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                                <Plus size={16} />
                            </div>
                            <span className="text-sm font-medium">New thread</span>
                        </button>

                        {/* Delete All Threads Button */}
                        <button
                            onClick={() => setIsDeleteConfirmOpen(true)}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--secondary)] text-[var(--foreground)] transition-colors text-left"
                        >
                            <div className="flex items-center justify-center p-1 rounded-md bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                                <Trash2 size={16} />
                            </div>
                            <span className="text-sm font-medium">Delete all threads</span>
                        </button>

                        {searchGroupedHistory.length > 0 ? (
                            <div className="space-y-6 pb-4">
                                {searchGroupedHistory.map((group) => (
                                    <div key={group.label} className="space-y-1.5">
                                        <div className="px-3 text-xs font-semibold text-[var(--muted-foreground)]">
                                            {group.label}
                                        </div>
                                        <div>
                                            {group.items.map((chat) => (
                                                <button
                                                    key={chat.thread_id}
                                                    onClick={() => {
                                                        if (onSelectThread) onSelectThread(chat.thread_id, chat.query)
                                                        setIsSearchVisible(false)
                                                        setSearchQuery('')
                                                        if (isMobile && onToggle) onToggle()
                                                    }}
                                                    className="group relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-[var(--secondary)] text-[var(--foreground)] transition-colors text-left"
                                                >
                                                    <div className="opacity-70 text-[var(--muted-foreground)]">
                                                        {chat.model === 'canvas' ? (
                                                            <Telescope size={16} />
                                                        ) : (
                                                            <MessageSquare size={16} />
                                                        )}
                                                    </div>
                                                    <span className="text-sm truncate flex-1 pr-6">
                                                        {chat.query}
                                                    </span>
                                                    <div
                                                        onClick={(e) => onSingleDeleteClick(e, chat.thread_id)}
                                                        className={`absolute right-3 p-1 hover:bg-[var(--background)] rounded-md text-[var(--muted-foreground)] hover:text-red-500 transition-all ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                                        role="button"
                                                        aria-label="Delete chat"
                                                    >
                                                        <Trash2 size={14} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            searchQuery.trim() && !isSearchPending && (
                                <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                                    No results found
                                </div>
                            )
                        )}
                    </div>
                </DialogContent>
            </Dialog >

            {/* Delete Threads Confirmation Dialog */}
            <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <AlertDialogContent className="bg-[var(--background)] border border-[var(--border-subtle)] rounded-xl shadow-lg max-w-sm p-6">
                    <AlertDialogHeader className="gap-3">
                        <AlertDialogTitle className="text-[var(--foreground)] text-base font-medium flex items-center justify-center mb-1">
                            Clear all history?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[var(--muted-foreground)] text-sm text-center leading-relaxed">
                            {history.length === 0 ? (
                                <span>Your history is already empty.</span>
                            ) : (
                                <span>
                                    This will permanently delete all <strong className="text-[var(--foreground)] font-medium">{history.length}</strong> threads. This action cannot be undone.
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6 flex flex-row w-full gap-2">
                        <AlertDialogCancel
                            disabled={isDeleting}
                            className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors h-10 mt-0"
                        >
                            Cancel
                        </AlertDialogCancel>
                        <button
                            onClick={handleBulkDelete}
                            disabled={isDeleting || history.length === 0}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg h-10 text-sm font-medium transition-colors
                                bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDeleting ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                'Delete all'
                            )}
                        </button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Single Thread Delete Confirmation Dialog */}
            <AlertDialog open={!!threadToDelete} onOpenChange={(open) => !open && setThreadToDelete(null)}>
                <AlertDialogContent className="bg-[var(--background)] border border-[var(--border-subtle)] rounded-xl shadow-lg max-w-sm p-6">
                    <AlertDialogHeader className="gap-3">
                        <AlertDialogTitle className="text-[var(--foreground)] text-base font-medium flex items-center justify-center mb-1">
                            Delete thread?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[var(--muted-foreground)] text-sm text-center leading-relaxed">
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6 flex flex-row w-full gap-2">
                        <AlertDialogCancel
                            disabled={isDeleting}
                            className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors h-10 mt-0"
                        >
                            Cancel
                        </AlertDialogCancel>
                        <button
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg h-10 text-sm font-medium transition-colors
                                bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDeleting ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                'Delete thread'
                            )}
                        </button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
        <>
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
        </>
    )
}
