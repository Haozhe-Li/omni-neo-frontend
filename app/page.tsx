'use client'

import { useState, useCallback, useEffect } from 'react'
import { SearchHome } from '@/components/search-home'
import { CanvasView } from '@/components/canvas-view'
import { LightChatView } from '@/components/light-chat-view'
import { AppSidebar } from '@/components/app-sidebar'
import { toast } from 'sonner'

// ... imports
import { useIsMobile } from '@/hooks/use-mobile'

type ModelType = 'canvas' | 'light' | 'auto'

export default function Home() {
  const [view, setView] = useState<'home' | 'canvas' | 'light'>('home')
  const [currentQuery, setCurrentQuery] = useState('')
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [model, setModel] = useState<ModelType>('auto')
  const [isAutoDetecting, setIsAutoDetecting] = useState(false)

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
    setModel(newModel)
    localStorage.setItem('omni_model_preference', newModel)
  }

  const handleSearch = useCallback(async (query: string, threadId: string) => {
    setCurrentQuery(query)
    setCurrentThreadId(threadId)

    if (model === 'auto') {
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
      setView(model)
    }
  }, [model])

  const handleNewSearch = useCallback(() => {
    setView('home')
    setCurrentQuery('')
    setCurrentThreadId('')
    setIsAutoDetecting(false)
  }, [])

  const handleSelectThread = useCallback((threadId: string, query: string) => {
    setCurrentThreadId(threadId)
    setCurrentQuery(query)

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(threadId)
      if (stored) {
        const data = JSON.parse(stored)
        if (data.type === 'light') {
          setView('light')
          return
        }
      }
    }

    // Default to canvas if not explicitly light
    setView('canvas')
  }, [])

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
          />
        )}
      </main>
    </div>
  )
}
