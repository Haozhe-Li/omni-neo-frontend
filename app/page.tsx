'use client'

import { useState, useCallback } from 'react'
import { SearchHome } from '@/components/search-home'
import { CanvasView } from '@/components/canvas-view'

export default function Home() {
  const [view, setView] = useState<'home' | 'canvas'>('home')
  const [currentQuery, setCurrentQuery] = useState('')

  const handleSearch = useCallback((query: string) => {
    setCurrentQuery(query)
    setView('canvas')
  }, [])

  const handleNewSearch = useCallback(() => {
    setView('home')
    setCurrentQuery('')
  }, [])

  if (view === 'canvas') {
    return <CanvasView query={currentQuery} onNewSearch={handleNewSearch} />
  }

  return <SearchHome onSearch={handleSearch} />
}
