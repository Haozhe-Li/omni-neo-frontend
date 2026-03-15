'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApi } from './useApi'

export function useAutocomplete(query: string, delay: number = 300, enabled: boolean = true) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { fetchWithAuth } = useApi()

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text.trim() || text.length > 10) {
      setSuggestions([])
      return
    }

    setIsLoading(true)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
      const endpoint = baseUrl.endsWith('/') ? `${baseUrl}auto_complete` : `${baseUrl}/auto_complete`
      
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify({ text }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.texts)) {
          setSuggestions(data.texts)
        }
      }
    } catch (error) {
      console.error('[useAutocomplete] Failed to fetch suggestions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    if (!enabled) {
      setSuggestions([])
      return
    }

    const handler = setTimeout(() => {
      fetchSuggestions(query)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [query, delay, enabled, fetchSuggestions])

  return { suggestions, isLoading, setSuggestions }
}
