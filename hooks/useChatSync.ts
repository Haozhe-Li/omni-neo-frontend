'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useApi } from './useApi'

export function useChatSync(threadId: string | null, title?: string) {
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
  const [messages, setMessages] = useState<unknown[]>([])
  const { fetchWithAuth } = useApi()
  const { userId, isSignedIn } = useAuth()

  // Build a stable local storage key scoped to auth state
  const getLocalKey = useCallback(() => {
    if (typeof window === 'undefined') return null
    const id = isSignedIn && userId ? userId : (localStorage.getItem('guest_id') ?? 'anon')
    return `${id}_chat_${threadId}`
  }, [threadId, isSignedIn, userId])

  useEffect(() => {
    if (!threadId) return

    const localKey = getLocalKey()
    if (!localKey) return

    // 1. Instantly render from local cache
    const cached = localStorage.getItem(localKey)
    if (cached) {
      try {
        setMessages(JSON.parse(cached))
      } catch {
        // corrupted cache, ignore
      }
    }

    // 2. Silently fetch from cloud and override if newer
    // GET /api/threads/{thread_id} — the read endpoint (not /sync)
    if (isMockMode || !isSignedIn) return

    fetchWithAuth(`/api/threads/${threadId}`)
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data: { messages?: unknown[] } | null) => {
        if (data?.messages && data.messages.length > 0) {
          setMessages(data.messages)
          if (localKey) {
            localStorage.setItem(localKey, JSON.stringify(data.messages))
          }
        }
      })
      .catch(() => {
        // Non-critical: fall back to local cache silently
      })
  }, [threadId, getLocalKey, isMockMode, isSignedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveMessages = useCallback(
    async (newMessages: unknown[], overrideTitle?: string) => {
      if (!threadId) return
      const localKey = getLocalKey()

      setMessages(newMessages)

      if (localKey) {
        localStorage.setItem(localKey, JSON.stringify(newMessages))
      }

      if (isMockMode || !isSignedIn) return

      try {
        const body: { messages: unknown[]; title?: string } = { messages: newMessages }
        const resolvedTitle = overrideTitle ?? title
        if (resolvedTitle) body.title = resolvedTitle

        await fetchWithAuth(`/api/threads/${threadId}/sync`, {
          method: 'POST',
          body: JSON.stringify(body),
        })
      } catch {
        // Non-critical: data is already persisted locally
      }
    },
    [threadId, title, getLocalKey, isMockMode, isSignedIn] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return { messages, saveMessages }
}
