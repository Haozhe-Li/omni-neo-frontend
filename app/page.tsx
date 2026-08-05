'use client'

import { useState, useCallback, useEffect } from 'react'
import { SearchHome } from '@/components/search-home'
import { ChatView } from '@/components/chat-view'
import { AppSidebar } from '@/components/app-sidebar'
import { useApi } from '@/hooks/useApi'
import { useUsage } from '@/hooks/useUsage'
import { useAuth } from '@clerk/nextjs'
import { useAppShell } from '@/hooks/useAppShell'
import { useRouter } from 'next/navigation'
import type { AgentMode } from '@/lib/types'

// Swap the visible URL to /thread/{id} without triggering a Next.js navigation,
// so an in-progress/streaming chat is never remounted. A hard reload or a
// freshly-opened link still hits app/thread/[id] and goes through its own
// access-check flow.
function setShareableUrl(threadId: string) {
  if (typeof window === 'undefined' || !threadId) return
  if (threadId.startsWith('local-')) return // not a real backend id, nothing to share yet
  window.history.replaceState({}, '', `/thread/${threadId}`)
}

export default function Home() {
  const [view, setView] = useState<'home' | 'chat'>('home')
  const [currentQuery, setCurrentQuery] = useState('')
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [model, setModel] = useState<AgentMode>('fast')
  const [initialMode, setInitialMode] = useState<AgentMode>('fast')
  const [pendingAttachmentMeta, setPendingAttachmentMeta] = useState<{ id: string; name: string; type: string }[]>([])
  const [pendingSkill, setPendingSkill] = useState<string | null>(null)
  // Seeded from `?fill=` — typed into the home screen's input box for the
  // visitor to review or edit, never auto-submitted. Distinct from `?q=`
  // below, which skips the input box entirely and starts the chat outright;
  // this exists for links that want to hand someone a starting point without
  // speaking on their behalf.
  const [deepLinkFill, setDeepLinkFill] = useState('')

  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const { usage, exceeded, refresh: refreshUsage } = useUsage()
  const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useAppShell()

  // The lock on the home screen's model picker is guest-only — signed-in
  // users get a generous budget and can check standing in Settings > Usage
  // instead of being nagged on every message. There's no per-mode or
  // per-count breakdown shown, just usage available or not.
  const isGuest = !isSignedIn
  const showLocked = isGuest && exceeded

  // Preflight check before starting a turn: if usage is exhausted, surface
  // the usage-limit dialog instead of burning a round trip on a /chat call
  // we already know will 429. Applies to everyone, not just guests — the
  // dialog itself adapts its copy based on isGuest.
  const blockIfOverLimit = useCallback(
    (): boolean => {
      if (!usage || !exceeded) return false
      const dayOver = usage.day_remaining <= 0
      const monthOver = usage.month_remaining <= 0
      window.dispatchEvent(new CustomEvent('omni:usage-limit', {
        detail: {
          scope: dayOver && monthOver ? 'both' : dayOver ? 'day' : 'month',
          isGuest,
          dayUsed: usage.day_used, dayLimit: usage.day_limit,
          monthUsed: usage.month_used, monthLimit: usage.month_limit,
          resetsDayAt: usage.resets_day_at, resetsMonthAt: usage.resets_month_at,
        },
      }))
      return true
    },
    [usage, exceeded, isGuest]
  )

  useEffect(() => {
    const loadModel = () => {
      if (typeof window === 'undefined') return
      const saved = localStorage.getItem('omni_model_preference')
      if (saved === 'fast' || saved === 'pro') setModel(saved)
    }
    loadModel()
    window.addEventListener('storage', loadModel)
    return () => window.removeEventListener('storage', loadModel)
  }, [])

  const handleModelChange = (newModel: AgentMode) => {
    setModel(newModel)
    if (typeof window !== 'undefined') localStorage.setItem('omni_model_preference', newModel)
  }

  const handleSearch = useCallback(
    async (
      query: string,
      threadId: string,
      _attachedFileIds?: string[],
      attachedFileMeta?: { id: string; name: string; type: string }[],
      skill?: string | null
    ) => {
      if (blockIfOverLimit()) return
      setCurrentQuery(query)
      setCurrentThreadId(threadId)
      setPendingAttachmentMeta(attachedFileMeta && attachedFileMeta.length > 0 ? attachedFileMeta : [])
      setPendingSkill(skill || null)
      setInitialMode(model)
      setView('chat')
      setShareableUrl(threadId)
    },
    [model, blockIfOverLimit]
  )

  useEffect(() => {
    if (view === 'home') refreshUsage()
  }, [view, refreshUsage])

  const handleNewSearch = useCallback(() => {
    setView('home')
    setCurrentQuery('')
    setCurrentThreadId('')
    // Undo `setShareableUrl`'s replaceState: the address bar can be showing
    // `/thread/{id}` (faked, without an actual route change) from a prior
    // chat while still mounted on `/` — reset it back to `/` so it doesn't
    // keep pointing at a thread that's no longer shown (or, if the thread
    // was just deleted, at an id that no longer exists and would 404 on
    // refresh).
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/')
  }, [])

  const handleSelectThread = useCallback(
    (threadId: string) => {
      router.push(`/thread/${threadId}`)
    },
    [router]
  )

  // Initial query from URL — `?q=` runs it immediately, `?fill=` only types
  // it into the home screen's box. Checked in the same effect so only one of
  // the two ever wins if a link somehow carried both.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlParams = new URLSearchParams(window.location.search)
    const q = urlParams.get('q')
    const fill = urlParams.get('fill')
    if (!q && !fill) return
    window.history.replaceState({}, '', '/')

    if (!q) {
      // Prefill only: stay on the home screen (view is already 'home' at this
      // point — nothing here has switched it to 'chat') and hand the text to
      // SearchHome, which types it into the box itself via its existing
      // Tab-to-autocomplete animation rather than a plain, instant setValue.
      setDeepLinkFill(fill!)
      return
    }

    const initFromUrl = async () => {
      let newThreadId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      try {
        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
        const res = await fetchWithAuth(`${backendUrl}/get_thread_id`)
        if (res.ok) {
          const data = await res.json()
          if (typeof data === 'string') newThreadId = data
          else if (data?.thread_id) newThreadId = data.thread_id
        }
      } catch {}
      setCurrentThreadId(newThreadId)
      setCurrentQuery(q)
      setInitialMode(model)
      setView('chat')
      setShareableUrl(newThreadId)
    }
    initFromUrl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWithAuth])

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden relative">
      <AppSidebar
        currentThreadId={currentThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewSearch}
        className="flex-shrink-0 z-50 relative"
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        isMobile={isMobile}
      />

      <main className="flex-1 min-w-0 h-full relative overflow-hidden">
        {view === 'chat' ? (
          <ChatView
            key={currentThreadId}
            query={currentQuery}
            threadId={currentThreadId}
            onNewSearch={handleNewSearch}
            onToggleSidebar={toggleSidebar}
            isMobile={isMobile}
            initialMode={initialMode}
            initialAttachedFileMeta={pendingAttachmentMeta}
            initialSkill={pendingSkill as any}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        ) : (
          <SearchHome
            onSearch={handleSearch}
            isAutoDetecting={false}
            onToggleSidebar={toggleSidebar}
            isMobile={isMobile}
            model={model}
            onModelChange={handleModelChange}
            locked={showLocked}
            deepLinkFill={deepLinkFill}
          />
        )}
      </main>
    </div>
  )
}
