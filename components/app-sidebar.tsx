'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { MessageSquare, Plus, Settings, Trash2, PanelLeftClose, PanelLeftOpen, Newspaper, History, Telescope, X, LogOut, Loader2, User, CalendarClock, Lock, BarChart3, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { OmniMark, useMarkBurst } from '@/components/omni-mark'
import { SignUpButton, useAuth, useUser, useClerk } from '@clerk/nextjs'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'
import type { TodoItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useEdgeFade } from '@/hooks/useEdgeFade'
import { formatDistanceToNow } from 'date-fns'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SettingsDialog, TAB_SLUGS, type TabId } from '@/components/settings-dialog'
import { UsageLimitDialog } from '@/components/usage-limit-dialog'
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
    /** Locked for safety (core/stream.py's SAFETY_TERMINATED path) — no more sends/regenerates on this thread. */
    isLocked?: boolean
}

/* Real icons, not the abstract glyph set this rail shipped with first.
   Distinguishable shapes are not the same thing as recognizable ones: six
   9px outlines differing only in corner radius told you the rows were
   different from each other but never what any of them did. These say it. */
function NavRow({
    icon: Icon,
    label,
    active,
    expanded,
    onClick,
}: {
    icon: LucideIcon
    label: string
    active: boolean
    expanded: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`
                flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px] whitespace-nowrap transition-colors
                ${active
                    ? 'bg-[var(--teal-tint)] text-[var(--teal)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--sand-deep)] hover:text-[var(--ink)]'}
                ${expanded ? '' : 'justify-center'}
            `}
        >
            {/* 1.5 stroke, not lucide's default 2 — the heavier weight reads
                as a toolbar and fights the hairlines everywhere else here. */}
            <Icon size={17} strokeWidth={1.5} className="shrink-0" />
            {expanded && <span>{label}</span>}
        </button>
    )
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
    // Same hidden scrollbar as the sources rail, so the same soft edge — a
    // long history otherwise ends mid-title against a hard line.
    const recentFade = useEdgeFade<HTMLDivElement>()
    const markBurst = useMarkBurst()
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
    const [settingsInitialTab, setSettingsInitialTab] = useState<TabId>('general')
    const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [loadingAction, setLoadingAction] = useState<string | null>(null)
    const pagesActive = !!pathname && (pathname === '/pages' || pathname.startsWith('/pages/'))

    // Settings opens as an overlay on top of whatever page you're on (a chat
    // thread, /pages, etc.) — it must NOT navigate away and unmount that page.
    // We still want the address bar to reflect it (bookmarkable, and matches
    // /settings/<tab> being a real route — see app/settings/[[...tab]]), so we
    // push/replace history state directly instead of going through the
    // Next.js router, which would tear down the current route tree.
    const openSettings = useCallback((tab: TabId) => {
        setSettingsInitialTab(tab)
        setIsSettingsOpen(true)
        if (typeof window !== 'undefined') {
            window.history.pushState({ omniSettings: true }, '', `/settings/${TAB_SLUGS[tab]}`)
        }
    }, [])

    const handleSettingsOpenChange = useCallback((open: boolean) => {
        setIsSettingsOpen(open)
        // Closing pops the history entry openSettings pushed, restoring the
        // URL you were on before Settings opened (rather than growing the
        // stack with a second, opposite pushState).
        if (!open && typeof window !== 'undefined' && window.location.pathname.startsWith('/settings')) {
            window.history.back()
        }
    }, [])

    const handleSettingsTabChange = useCallback((tab: TabId) => {
        if (typeof window !== 'undefined') {
            window.history.replaceState({ omniSettings: true }, '', `/settings/${TAB_SLUGS[tab]}`)
        }
    }, [])

    // The browser's own back/forward buttons bypass handleSettingsOpenChange —
    // keep the dialog in sync whenever navigation lands outside /settings
    // while it's open (e.g. the user pressed back instead of clicking X).
    useEffect(() => {
        const onPopState = () => {
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/settings')) {
                setIsSettingsOpen(false)
            }
        }
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])

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

    // ── 2. Backend sync (runs once on mount + on auth change) ────────
    // Guests are backend-synced too: fetchWithAuth sends X-Guest-Id, which
    // get_current_user resolves into a real user_id just like a signed-in
    // Clerk user — every thread synced via chat-view.tsx's syncToBackend
    // already lands here regardless of auth state, so reading it back must
    // not be gated on isSignedIn either.
    const syncFromBackend = useCallback(async () => {
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
                    isLocked: !!t.is_locked,
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
    }, [fetchWithAuth])

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
                        isLocked: !!r.is_locked,
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
            syncFromBackend()
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
    }, [syncFromBackend])

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

    // Sync from backend once on mount and whenever auth state changes (a
    // guest signing in mid-session gets a new identity, so it must re-sync
    // under that identity). Pre-populate from cache first so there's no
    // blank flash while the network request is in flight — this applies to
    // guests too now, since their threads are backend-persisted exactly the
    // same way (see syncFromBackend above).
    useEffect(() => {
        if (!mounted) return
        try {
            const cached = localStorage.getItem('omni:threadlist')
            if (cached) setHistory(JSON.parse(cached))
        } catch {}
        syncFromBackend()
    }, [mounted, isSignedIn, syncFromBackend])

    // Keep the list fresh for multi-device/multi-tab usage (controlled interval)
    useEffect(() => {
        if (!mounted) return
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
            // Guest threads are backend-persisted exactly like signed-in ones
            // (fetchWithAuth sends X-Guest-Id) — the delete must hit the
            // server for everyone, or the row survives and resurfaces on the
            // next sync.
            const removedLocalItems = removeThreadLocalCache(threadToDelete)
            setHistory(prev => prev.filter(item => item.thread_id !== threadToDelete))
            setSearchResults(prev => prev ? prev.filter(item => item.thread_id !== threadToDelete) : prev)

            try {
                const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
                const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadToDelete}`, { method: 'DELETE' })
                if (!res.ok) {
                    restoreRemovedLocalCache(removedLocalItems)
                    syncFromBackend()
                    toast.error('Delete failed on server')
                    setThreadToDelete(null)
                    setIsDeleting(false)
                    return
                }

                // If deleted active thread, go to new chat
                if (threadToDelete === currentThreadId && onNewChat) {
                    onNewChat()
                }

                syncFromBackend()
            } catch {
                restoreRemovedLocalCache(removedLocalItems)
                syncFromBackend()
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

        // Guest threads are backend-persisted too — batch-delete must run for
        // everyone, not just signed-in users (see handleDeleteConfirm).
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
        await syncFromBackend()

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
            {/* ── Mark + collapse ────────────────────────────────────────────
                Three offset rings rather than a raster logo, so the mark takes
                its ink and teal from the theme instead of needing a second
                file for dark mode.

                The toggle rides the mark in both states, which is why it is
                not a row of its own: expanded it sits opposite the wordmark;
                collapsed there is no room beside a 22px mark, so the mark
                itself becomes the control — it fades out under the cursor and
                the expand icon fades in behind it. One affordance, in the
                place your eye already goes. */}
            <div className={`flex items-center px-5 pt-6 pb-1 ${isExpanded ? 'justify-between gap-3' : 'justify-center'}`}>
                {isExpanded ? (
                    <>
                        <Link
                            href="/"
                            className="group flex min-h-[28px] items-center gap-2.5"
                            aria-label="Omni — home"
                            /* The rings take a turn on the way home. Nothing
                               depends on it and nothing waits for it — the
                               navigation is unchanged, and on the layout the
                               sidebar lives in the mark does not unmount, so
                               the spin finishes wherever you land. */
                            onClick={markBurst.trigger}
                        >
                            <OmniMark key={markBurst.run} size={22} {...markBurst.mark} />
                            <span className="font-[family-name:var(--font-plex)] pt-[2px] text-[25px] leading-none tracking-[-0.01em] text-[var(--ink)] transition-colors group-hover:text-[var(--teal)]">
                                omni
                            </span>
                        </Link>
                        <div className="flex items-center gap-1">
                            {isSyncing && (
                                <span title="Syncing…" className="flex items-center px-1">
                                    <Loader2 size={13} className="animate-spin text-[var(--ink-faint)]" />
                                </span>
                            )}
                            {!isMobile && (
                                <button
                                    onClick={onToggle}
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--sand-deep)] hover:text-[var(--teal)]"
                                    title="Collapse sidebar"
                                >
                                    <PanelLeftClose size={16} strokeWidth={1.5} />
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <button
                        onClick={onToggle}
                        className="group relative flex h-7 w-7 items-center justify-center"
                        title="Expand sidebar"
                        aria-label="Expand sidebar"
                    >
                        <span className="transition-opacity duration-200 group-hover:opacity-0">
                            <OmniMark size={22} />
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center rounded-full text-[var(--teal)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <PanelLeftOpen size={16} strokeWidth={1.5} />
                        </span>
                    </button>
                )}
            </div>

            {/* ── New thread ─────────────────────────────────────────────── */}
            <div className="px-3.5 pt-5">
                <button
                    onClick={() => {
                        setLoadingAction('new-chat')
                        if (onNewChat) onNewChat()
                        setTimeout(() => setLoadingAction(null), 1000)
                        if (isMobile && onToggle) onToggle()
                    }}
                    className={`
                        flex w-full items-center gap-3 rounded-full border border-[var(--line-strong)]
                        bg-[var(--paper-raised)] px-3.5 py-2.5 text-[15px] text-[var(--ink)]
                        whitespace-nowrap transition-colors
                        hover:border-[var(--teal)] hover:text-[var(--teal)]
                        ${isExpanded ? '' : 'justify-center px-0'}
                    `}
                    title="New thread"
                >
                    <span className="text-[18px] leading-none -mt-0.5">+</span>
                    {isExpanded && (
                        <span className="flex flex-1 items-center justify-between min-w-0">
                            <span>New thread</span>
                            {loadingAction === 'new-chat' && (
                                <Loader2 size={14} className="animate-spin text-[var(--ink-faint)]" />
                            )}
                        </span>
                    )}
                </button>
            </div>

            {/* ── Destinations ───────────────────────────────────────────────
                "Ask" is gone: the mark and "New thread" directly above it both
                already lead there, so it was a third control for the same
                destination sitting at the top of a list of five. */}
            <nav className="flex flex-col gap-0.5 px-3.5 pt-6">
                <NavRow
                    icon={Newspaper}
                    label="Pages"
                    active={pagesActive}
                    expanded={isExpanded}
                    onClick={() => {
                        if (pathname !== '/pages') router.push('/pages')
                        if (isMobile && onToggle) onToggle()
                    }}
                />
                <NavRow
                    icon={CalendarClock}
                    label="Scheduled"
                    active={false}
                    expanded={isExpanded}
                    onClick={() => {
                        openSettings('scheduled')
                        if (isMobile && onToggle) onToggle()
                    }}
                />
                <NavRow
                    icon={History}
                    label="History"
                    active={false}
                    expanded={isExpanded}
                    onClick={() => setIsSearchVisible(true)}
                />
                {/* Benchmarks is a destination of its own — a separate section
                    meant to become a separate site — so it stays an anchor
                    that opens in a new tab rather than a router push that
                    would tear down a thread mid-stream. */}
                <a
                    href="/benchmark"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => { if (isMobile && onToggle) onToggle() }}
                    className={`
                        group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px]
                        whitespace-nowrap text-[var(--ink-muted)] transition-colors
                        hover:bg-[var(--sand-deep)] hover:text-[var(--ink)]
                        ${isExpanded ? '' : 'justify-center'}
                    `}
                    title="Benchmarks — opens in a new tab"
                >
                    <BarChart3 size={17} strokeWidth={1.5} className="shrink-0" />
                    {isExpanded && (
                        <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
                            <span>Benchmarks</span>
                            <ArrowUpRight
                                size={13}
                                className="shrink-0 text-[var(--ink-fainter)] transition-colors group-hover:text-[var(--teal)]"
                            />
                        </span>
                    )}
                </a>
                <NavRow
                    icon={Settings}
                    label="Settings"
                    active={isSettingsOpen}
                    expanded={isExpanded}
                    onClick={() => {
                        openSettings('general')
                        if (isMobile && onToggle) onToggle()
                    }}
                />
            </nav>

            {/* ── Recent ─────────────────────────────────────────────────────
                Titles only, separated by hairlines rather than sat in their
                own hover cards. A thread you can already see is one line of
                text; the affordances (delete, live dot) surface on hover so
                the resting state stays a readable list. */}
            {/* Same treatment as the sources rail: a classic scrollbar in a
                narrow column of hairline-separated text lands a grey track
                right where the titles end and reads as a second border. */}
            <div
                ref={recentFade.ref}
                style={recentFade.style}
                className="omni-hide-scrollbar omni-edge-fade flex-1 overflow-y-auto overflow-x-hidden px-5 pt-7 pb-2"
            >
                {isExpanded && (
                    <>
                        <div className="omni-eyebrow pb-2">Recent</div>
                        <div className="flex flex-col">
                            {filteredHistory.map((chat) => {
                                const isCurrent = currentThreadId === chat.thread_id
                                return (
                                    <div
                                        key={chat.thread_id}
                                        className="group relative border-b border-[var(--line-hair)] last:border-b-0"
                                    >
                                        <button
                                            onClick={() => {
                                                if (!isCurrent) {
                                                    setLoadingAction(`thread_${chat.thread_id}`)
                                                    if (onSelectThread) onSelectThread(chat.thread_id, chat.query)
                                                }
                                                if (isMobile && onToggle) onToggle()
                                            }}
                                            className={`
                                                w-full py-[7px] pr-6 text-left text-[14px] leading-[1.45] transition-colors
                                                ${isCurrent ? 'text-[var(--teal)]' : 'text-[var(--ink-muted)] hover:text-[var(--teal)]'}
                                            `}
                                            title={chat.query}
                                        >
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <span className="truncate">{chat.query}</span>
                                                {chat.isLocked && (
                                                    <Lock size={10} className="shrink-0 opacity-70" aria-label="Locked" />
                                                )}
                                                {generatingThreadIds.has(chat.thread_id) && (
                                                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--teal)] opacity-75" />
                                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
                                                    </span>
                                                )}
                                                {loadingAction === `thread_${chat.thread_id}` && (
                                                    <Loader2 size={11} className="shrink-0 animate-spin text-[var(--ink-faint)]" />
                                                )}
                                                {chat.isExpiring && (
                                                    <span
                                                        className="shrink-0 h-1 w-1 rounded-full bg-[var(--warning)]"
                                                        title="Will disappear if unused for 3 days"
                                                    />
                                                )}
                                            </span>
                                        </button>
                                        <div
                                            onClick={(e) => onSingleDeleteClick(e, chat.thread_id)}
                                            className={`absolute right-0 top-1.5 rounded-full p-1 text-[var(--ink-fainter)] transition-all hover:text-[var(--destructive)] ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                            role="button"
                                            aria-label="Delete chat"
                                        >
                                            <Trash2 size={11} />
                                        </div>
                                    </div>
                                )
                            })}
                            {filteredHistory.length === 0 && (
                                <p className="py-3 text-[13.5px] leading-relaxed text-[var(--ink-faint)]">
                                    Nothing yet. Your threads collect here.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Rail footer ─────────────────────────────────────────────
                Just the account now — the collapse toggle moved up to the
                mark, where it is one control instead of a second row. */}
            <div className="mt-auto flex flex-col gap-1 px-3.5 pb-5 pt-3">
                {/* Auth row — only after mount, to avoid an SSR/client mismatch */}
                {mounted && (
                    isSignedIn ? (
                        <div className={`group flex items-center gap-2.5 px-2 pt-1.5 ${isExpanded ? '' : 'justify-center'}`}>
                            {user?.imageUrl ? (
                                <img
                                    src={user.imageUrl}
                                    alt=""
                                    className="h-[26px] w-[26px] shrink-0 rounded-full ring-1 ring-[var(--line-strong)]"
                                />
                            ) : (
                                <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--clay)] text-[12px] text-[var(--clay-ink)]">
                                    {(user?.firstName?.[0] ?? 'A').toUpperCase()}
                                </div>
                            )}
                            {isExpanded && (
                                <>
                                    <span className="flex-1 truncate text-[14px] text-[var(--ink-muted)]">
                                        {user?.firstName || 'Account'}
                                    </span>
                                    <button
                                        onClick={async () => {
                                            await clerk.signOut()
                                            if (typeof window !== 'undefined') window.location.reload()
                                        }}
                                        className="shrink-0 rounded-full p-1 text-[var(--ink-fainter)] opacity-0 transition-all hover:text-[var(--destructive)] group-hover:opacity-100"
                                        title="Sign out"
                                    >
                                        <LogOut size={13} />
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <SignUpButton mode="modal">
                            <button
                                className={`flex items-center gap-2.5 px-2 pt-1.5 text-[14px] text-[var(--ink-muted)] transition-colors hover:text-[var(--teal)] ${isExpanded ? '' : 'justify-center'}`}
                                title="Get started to sync your history and settings"
                            >
                                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--clay)] text-[var(--clay-ink)]">
                                    <User size={12} />
                                </span>
                                {isExpanded && <span>Sign in</span>}
                            </button>
                        </SignUpButton>
                    )
                )}
            </div>

            {/* Settings Dialog */}
            <SettingsDialog
                open={isSettingsOpen}
                onOpenChange={handleSettingsOpenChange}
                initialTab={settingsInitialTab}
                onTabChange={handleSettingsTabChange}
            />

            {/* Usage-limit-reached Dialog — self-driven via window event, see usage-limit-dialog.tsx */}
            <UsageLimitDialog />

            {/* Search Dialog Modal */}
            < Dialog open={isSearchVisible} onOpenChange={(open) => {
                setIsSearchVisible(open)
                if (!open) setSearchQuery('')
            }}>
                <DialogContent
                    showCloseButton={false}
                    overlayClassName="bg-[var(--scrim)]"
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
                                                    <span className="text-sm truncate flex-1 pr-6 flex items-center gap-1.5">
                                                        <span className="truncate">{chat.query}</span>
                                                        {chat.isLocked && (
                                                            <Lock size={11} className="shrink-0 opacity-70" aria-label="Locked" />
                                                        )}
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
                        "fixed inset-y-0 left-0 z-50 flex h-full w-[272px] flex-col shadow-[18px_0_44px_-32px_rgba(43,39,36,0.5)]",
                        "bg-[var(--paper-rail)] border-r border-[var(--line)]",
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
                    "relative flex h-full flex-col overflow-x-hidden",
                    "bg-[var(--paper-rail)] border-r border-[var(--line)]",
                    "transition-[width] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                    isExpanded ? 'w-[264px]' : 'w-[76px]',
                    className
                )}
            >
                {SidebarContent}
            </aside>
        </>
    )
}
