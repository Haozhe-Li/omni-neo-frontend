'use client'

import { useState, useCallback, useEffect } from 'react'
import { SearchHome } from '@/components/search-home'
import { CanvasView } from '@/components/canvas-view'
import { LightChatView } from '@/components/light-chat-view'
import { AppSidebar } from '@/components/app-sidebar'
import { toast } from 'sonner'
import { useApi } from '@/hooks/useApi'
import { useGuestQuota } from '@/hooks/useGuestQuota'
import { useAuth, useClerk } from '@clerk/nextjs'

// ... imports
import { useIsMobile } from '@/hooks/use-mobile'

type ModelType = 'canvas' | 'light' | 'auto'

export default function Home() {
  const [view, setView] = useState<'home' | 'canvas' | 'light'>('home')
  const [currentQuery, setCurrentQuery] = useState('')
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [model, setModel] = useState<ModelType>('auto')
  const [isAutoDetecting, setIsAutoDetecting] = useState(false)
  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { quota, quotaExceeded, refresh: refreshQuota } = useGuestQuota()

  // Sidebar state
  const isMobileCheck = useIsMobile()
  const isMobile = isMobileCheck === undefined ? true : isMobileCheck
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initialize sidebar state based on device
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    } else {
      setSidebarOpen(true)
    }
  }, [isMobile])

  // Load model preference from local storage (and re-read on window focus for settings page sync)
  useEffect(() => {
    const loadModel = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('omni_model_preference')
        if (saved === 'canvas' || saved === 'light' || saved === 'auto') {
          setModel(saved)
        }
      }
    }
    loadModel()
    window.addEventListener('focus', loadModel)
    window.addEventListener('storage', loadModel)
    return () => {
      window.removeEventListener('focus', loadModel)
      window.removeEventListener('storage', loadModel)
    }
  }, [])

  const handleModelChange = (newModel: ModelType) => {
    // If quota exceeded for guests: Canvas/Auto selection should trigger sign-in modal
    if (!isSignedIn && quotaExceeded) {
      if (newModel === 'auto') {
        toast.info('Daily quota reached. Sign in to continue with Auto mode.')
        clerk.openSignIn()
        return
      }
      if (newModel === 'canvas') {
        toast.info('Daily quota reached. Sign in to continue with Canvas mode.')
        clerk.openSignIn()
        return
      }
    }
    setModel(newModel)
    localStorage.setItem('omni_model_preference', newModel)
  }

  const handleSearch = useCallback(async (query: string, threadId: string) => {
    setCurrentQuery(query)
    setCurrentThreadId(threadId)

    if (model === 'auto') {
      // If guest quota exceeded, selecting/using Auto should prompt sign-in
      if (!isSignedIn && quotaExceeded) {
        toast.info('Daily quota reached. Sign in to continue with Auto mode.')
        clerk.openSignIn()
        return
      }
      // Auto mode: call /get_model first
      setIsAutoDetecting(true)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
        const endpoint = baseUrl.endsWith('/') ? `${baseUrl}get_model` : `${baseUrl}/get_model`

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, thread_id: threadId })
        })

        if (!res.ok) throw new Error('Failed to get model recommendation')

        let data = await res.json()
        // Handle double-encoded JSON (backend might return a JSON string)
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data)
          } catch (e) {
            // Not double-encoded, use as-is
          }
        }

        console.log('[Auto Model] Raw response:', data)

        // Extract model from response - handle various response formats
        let recommendedModel: 'canvas' | 'light' = 'canvas'
        if (typeof data === 'object' && data !== null) {
          const rawModel = data.model
          if (typeof rawModel === 'string' && rawModel.toLowerCase().includes('light')) {
            recommendedModel = 'light'
          } else if (typeof rawModel === 'string' && rawModel.toLowerCase().includes('canvas')) {
            recommendedModel = 'canvas'
          }
        } else if (typeof data === 'string') {
          if (data.toLowerCase().includes('light')) {
            recommendedModel = 'light'
          }
        }

        console.log('[Auto Model] Resolved model:', recommendedModel)

        setIsAutoDetecting(false)

        if (recommendedModel === 'light') {
          setView('light')
        } else {
          setView('canvas')
        }
      } catch (e) {
        console.error('Failed to auto-detect model, falling back to canvas', e)
        setIsAutoDetecting(false)
        toast.error('Auto detection failed, using Canvas mode')
        setView('canvas')
      }
    } else {
      // Manual mode: use the selected model directly
      // Guard: when guest quota is exceeded and Canvas is selected, prompt sign-in
      if (!isSignedIn && quotaExceeded && model === 'canvas') {
        toast.info('Daily quota reached. Sign in to continue with Canvas mode.')
        clerk.openSignIn()
        return
      }
      setView(model)
    }
  }, [model, quotaExceeded, isSignedIn, clerk])

  // Refresh quota every time user lands on home page
  useEffect(() => {
    if (view === 'home') {
      refreshQuota()
    }
  }, [view, refreshQuota])

  const handleNewSearch = useCallback(() => {
    setView('home')
    setCurrentQuery('')
    setCurrentThreadId('')
    setIsAutoDetecting(false)
  }, [])

  const handleSelectThread = useCallback(async (threadId: string, query: string) => {
    setCurrentThreadId(threadId)
    setCurrentQuery(query)

    if (isSignedIn) {
      try {
        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
        const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadId}`)
        if (res.ok) {
          const data = await res.json()
          const remoteMessages = Array.isArray(data?.messages) ? data.messages : []
          const remoteMode = typeof remoteMessages?.[0]?.mode === 'string' ? remoteMessages[0].mode : null

          if (remoteMode === 'light') {
            setView('light')
            return
          }
          if (remoteMode === 'canvas') {
            setView('canvas')
            return
          }
        }
      } catch {
        // Fallback to local cache detection below
      }
    }

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(threadId)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          if (data.type === 'light' || data.model === 'light') {
            setView('light')
            return
          }
          if (data.type === 'canvas' || data.model === 'canvas') {
            setView('canvas')
            return
          }
        } catch {
          // ignore parse error, fallback below
        }
      }
    }

    // Default to canvas if not explicitly light
    setView('canvas')
  }, [fetchWithAuth, isSignedIn])

  // Check for pending thread from settings page navigation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pendingThreadId = localStorage.getItem('pending_thread_id')
      if (pendingThreadId) {
        const pendingQuery = localStorage.getItem('pending_thread_query') || ''
        localStorage.removeItem('pending_thread_id')
        localStorage.removeItem('pending_thread_query')

        // Timeout prevents possible race conditions with initial render
        setTimeout(() => {
          handleSelectThread(pendingThreadId, pendingQuery)
        }, 0)
      }
    }
  }, [handleSelectThread])

  // Check for initial query from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const q = urlParams.get('q')
      const m = urlParams.get('model') as ModelType

      if (q) {
        // Clear params from URL
        window.history.replaceState({}, '', '/')

        const initFromUrl = async () => {
          let newThreadId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
          if (process.env.NEXT_PUBLIC_USE_MOCK !== 'true') {
            try {
              const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
              const res = await fetchWithAuth(`${backendUrl}/get_thread_id`)
              if (res.ok) {
                const data = await res.json()
                if (data && typeof data === 'string') newThreadId = data
                else if (data && data.thread_id) newThreadId = data.thread_id
              }
            } catch (e) { }
          }

          setCurrentThreadId(newThreadId)
          setCurrentQuery(q)
          if (m === 'light' || m === 'canvas') {
            setModel(m)
            setView(m)
          } else if (m === 'auto') {
            setModel(m)
            setView('light') // Fallback to light view when auto is selected from URL
          } else {
            setView('light')
          }
        }

        initFromUrl()
      }
    }
  }, [fetchWithAuth])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
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
        {view === 'canvas' ? (
          <CanvasView
            key={currentThreadId}
            query={currentQuery}
            threadId={currentThreadId}
            onNewSearch={handleNewSearch}
            onToggleSidebar={toggleSidebar}
            isMobile={isMobile}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        ) : view === 'light' ? (
          <LightChatView
            key={currentThreadId}
            query={currentQuery}
            threadId={currentThreadId}
            onNewSearch={handleNewSearch}
            onToggleSidebar={toggleSidebar}
            isMobile={isMobile}
          />
        ) : (
          <SearchHome
            onSearch={handleSearch}
            isAutoDetecting={isAutoDetecting}
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
