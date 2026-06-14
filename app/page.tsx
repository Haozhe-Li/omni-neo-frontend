'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { SearchHome } from '@/components/search-home'
import { ChatView } from '@/components/chat-view'
import { AppSidebar } from '@/components/app-sidebar'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'
import { useGuestQuota } from '@/hooks/useGuestQuota'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useIsMobile } from '@/hooks/use-mobile'
import type { AgentMode } from '@/lib/types'

export default function Home() {
  const [view, setView] = useState<'home' | 'chat'>('home')
  const [currentQuery, setCurrentQuery] = useState('')
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [model, setModel] = useState<AgentMode>('fast')
  const [initialMode, setInitialMode] = useState<AgentMode>('fast')
  const [pendingAttachmentMeta, setPendingAttachmentMeta] = useState<{ id: string; name: string; type: string }[]>([])

  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { quota, quotaExceeded, refresh: refreshQuota } = useGuestQuota()

  const isMobileCheck = useIsMobile()
  const isMobile = isMobileCheck === undefined ? true : isMobileCheck
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarInitializedRef = useRef(false)

  useEffect(() => {
    if (isMobile === undefined) return
    if (isMobile) {
      setSidebarOpen(false)
      sidebarInitializedRef.current = true
      return
    }
    const saved = localStorage.getItem('omni_sidebar_open')
    const shouldOpen = saved !== '0' // default open on desktop if no preference
    if (!sidebarInitializedRef.current) {
      sidebarInitializedRef.current = true
      if (shouldOpen) {
        setSidebarOpen(false)
        const t = setTimeout(() => setSidebarOpen(true), 200)
        return () => clearTimeout(t)
      }
    } else {
      setSidebarOpen(shouldOpen)
    }
  }, [isMobile])

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
      attachedFileMeta?: { id: string; name: string; type: string }[]
    ) => {
      if (model === 'pro' && !isSignedIn && quotaExceeded) {
        toast.info('Daily Pro quota reached. Sign in to continue.')
        clerk.openSignIn()
        return
      }
      setCurrentQuery(query)
      setCurrentThreadId(threadId)
      setPendingAttachmentMeta(attachedFileMeta && attachedFileMeta.length > 0 ? attachedFileMeta : [])
      setInitialMode(model)
      setView('chat')
    },
    [model, quotaExceeded, isSignedIn, clerk]
  )

  useEffect(() => {
    if (view === 'home') refreshQuota()
  }, [view, refreshQuota])

  const handleNewSearch = useCallback(() => {
    setView('home')
    setCurrentQuery('')
    setCurrentThreadId('')
  }, [])

  const handleSelectThread = useCallback(async (threadId: string, query: string) => {
    setCurrentThreadId(threadId)
    setCurrentQuery(query)
    setPendingAttachmentMeta([])
    setView('chat')
  }, [])

  // Pending thread from settings-page navigation
  useEffect(() => {
    if (typeof window === 'undefined') return
    const pendingThreadId = localStorage.getItem('pending_thread_id')
    if (pendingThreadId) {
      const pendingQuery = localStorage.getItem('pending_thread_query') || ''
      localStorage.removeItem('pending_thread_id')
      localStorage.removeItem('pending_thread_query')
      setTimeout(() => handleSelectThread(pendingThreadId, pendingQuery), 0)
    }
  }, [handleSelectThread])

  // Initial query from URL (?q=...)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlParams = new URLSearchParams(window.location.search)
    const q = urlParams.get('q')
    if (!q) return
    window.history.replaceState({}, '', '/')

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
    }
    initFromUrl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWithAuth])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((p) => {
      const next = !p
      localStorage.setItem('omni_sidebar_open', next ? '1' : '0')
      return next
    })
  }, [])

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
            quotaExceeded={quotaExceeded}
            remainingQuota={!isSignedIn && quota && quota.remaining > 0 ? quota.remaining : null}
          />
        )}
      </main>
    </div>
  )
}
