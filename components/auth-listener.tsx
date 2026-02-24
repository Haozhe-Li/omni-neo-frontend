'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'
import { useApi } from '@/hooks/useApi'

/**
 * AuthListener
 *
 * Mounts at the top of the app (in layout.tsx).
 * When a guest user signs in, it automatically migrates all their
 * locally-stored chat history from the guest_id to their new user account,
 * then clears the guest_id from localStorage.
 */
export function AuthListener() {
  const { isSignedIn, userId } = useAuth()
  const { fetchWithAuth } = useApi()
  const hasMerged = useRef(false)
  const previousSignedInRef = useRef<boolean | null>(null)

  const clearLocalChatRecords = () => {
    if (typeof window === 'undefined') return

    const chatLikeKeys = new Set([
      'pending_thread_id',
      'pending_thread_query',
    ])

    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (chatLikeKeys.has(key) || key.includes('_chat_')) {
        localStorage.removeItem(key)
        continue
      }

      const value = localStorage.getItem(key)
      if (!value) continue

      try {
        const data = JSON.parse(value)
        const isChatRecord =
          data &&
          typeof data === 'object' &&
          typeof data.thread_id === 'string' &&
          typeof data.timestamp === 'number' &&
          (
            Array.isArray(data.chat_history) ||
            Array.isArray(data.chatMessages) ||
            Array.isArray(data.messages)
          )

        if (isChatRecord) {
          localStorage.removeItem(key)
        }
      } catch {
        // non-json values are ignored
      }
    }
  }

  useEffect(() => {
    const prevSignedIn = previousSignedInRef.current

    if (prevSignedIn === true && !isSignedIn) {
      clearLocalChatRecords()
      hasMerged.current = false
      console.log('[AuthListener] User signed out. Local chat cache cleared.')
    }

    previousSignedInRef.current = isSignedIn
  }, [isSignedIn])

  useEffect(() => {
    if (!isSignedIn || !userId || hasMerged.current) return

    const guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null
    if (!guestId) return

    hasMerged.current = true
    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

    fetchWithAuth(`${backendUrl}/api/users/merge`, {
      method: 'POST',
      body: JSON.stringify({ guest_id: guestId }),
    })
      .then((res) => {
        if (res.ok) {
          localStorage.removeItem('guest_id')
          console.log('[AuthListener] Guest assets merged into user account.')
        }
      })
      .catch(() => {
        // Reset flag so it can retry on next render cycle
        hasMerged.current = false
      })
  }, [isSignedIn, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
