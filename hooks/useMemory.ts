'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'
import { isMemoryEnabled, setMemoryEnabled } from '@/lib/memories'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

/**
 * Reads/writes the server-persisted long-term memory document (GET/DELETE
 * /api/memories) plus the client-side on/off preference. Content is only
 * fetched while memory is enabled — no need to hit the backend otherwise.
 */
export function useMemory() {
  const { fetchWithAuth } = useApi()
  const [enabled, setEnabledState] = useState(false)
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setEnabledState(isMemoryEnabled())
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/memories`)
      if (res.ok) {
        const data = await res.json()
        setContent(data.content || '')
      }
    } catch (e) {
      console.error('[useMemory] Failed to fetch memory', e)
    } finally {
      setIsLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    if (enabled) refresh()
  }, [enabled, refresh])

  const clear = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/memories`, { method: 'DELETE' })
      if (res.ok) setContent('')
      return res.ok
    } catch (e) {
      console.error('[useMemory] Failed to clear memory', e)
      return false
    }
  }, [fetchWithAuth])

  const toggle = useCallback((value: boolean) => {
    setEnabledState(value)
    setMemoryEnabled(value)
  }, [])

  return { enabled, toggle, content, isLoading, refresh, clear }
}
