'use client'

import { useState, useCallback, useEffect } from 'react'
import { SearchHome } from '@/components/search-home'
import { CanvasView } from '@/components/canvas-view'
import { LightChatView } from '@/components/light-chat-view'
import { AppSidebar } from '@/components/app-sidebar'
import { SettingsModal } from '@/components/settings-modal'

type ModelType = 'canvas' | 'light'

export default function Home() {
  const [view, setView] = useState<'home' | 'canvas' | 'light'>('home')
  const [currentQuery, setCurrentQuery] = useState('')
  const [currentThreadId, setCurrentThreadId] = useState('')
  const [model, setModel] = useState<ModelType>('canvas')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Load model preference from local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omni_model_preference')
      if (saved === 'canvas' || saved === 'light') {
        setModel(saved)
      }
    }
  }, [])

  const handleModelChange = (newModel: ModelType) => {
    setModel(newModel)
    localStorage.setItem('omni_model_preference', newModel)
  }

  const handleSearch = useCallback((query: string, threadId: string) => {
    setCurrentQuery(query)
    setCurrentThreadId(threadId)
    // Use the current model setting to determine view
    setView(model)
  }, [model])

  const handleNewSearch = useCallback(() => {
    setView('home')
    setCurrentQuery('')
    setCurrentThreadId('')
  }, [])

  const handleSelectThread = useCallback((threadId: string, query: string) => {
    setCurrentThreadId(threadId)
    setCurrentQuery(query)

    // Determine model from saved history if possible, or default to current model?
    // Ideally we check history type. But for now let's just use current model or try to detect.
    // LightChatView and CanvasView have logic to load history.
    // If we load a Canvas history in Light view, it might be weird.
    // Let's see if we can peek at storage?
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

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      <AppSidebar
        currentThreadId={currentThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewSearch}
        onOpenSettings={() => setIsSettingsOpen(true)}
        className="flex-shrink-0 z-50 relative"
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        model={model}
        onModelChange={handleModelChange}
      />

      <main className="flex-1 min-w-0 h-full relative overflow-hidden">
        {view === 'canvas' ? (
          <CanvasView
            key={currentThreadId}
            query={currentQuery}
            threadId={currentThreadId}
            onNewSearch={handleNewSearch}
          />
        ) : view === 'light' ? (
          <LightChatView
            key={currentThreadId}
            query={currentQuery}
            threadId={currentThreadId}
            onNewSearch={handleNewSearch}
          />
        ) : (
          <SearchHome onSearch={handleSearch} />
        )}
      </main>
    </div>
  )
}
