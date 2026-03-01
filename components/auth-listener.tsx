'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
  const pathname = usePathname()
  const router = useRouter()
  const hasMerged = useRef(false)
  const previousSignedInRef = useRef<boolean | null>(null)

  const MIGRATION_IN_PROGRESS_KEY = 'guest_merge_in_progress'
  const MIGRATION_RETURN_TO_KEY = 'guest_merge_return_to'
  const MIGRATION_DONE_KEY = 'guest_merge_done'

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
      if (typeof window !== 'undefined') {
        localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
        localStorage.removeItem(MIGRATION_RETURN_TO_KEY)
        localStorage.removeItem(MIGRATION_DONE_KEY)
      }
      console.log('[AuthListener] User signed out. Local chat cache cleared.')
    }

    previousSignedInRef.current = isSignedIn ?? null
  }, [isSignedIn])

  useEffect(() => {
    if (!isSignedIn || typeof window === 'undefined') return
    const inProgress = localStorage.getItem(MIGRATION_IN_PROGRESS_KEY) === '1'
    if (inProgress && pathname !== '/migrating') {
      router.replace('/migrating')
    }
  }, [isSignedIn, pathname, router])

  useEffect(() => {
    if (!isSignedIn || !userId || hasMerged.current) return

    const guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null
    if (!guestId) return

    hasMerged.current = true
    const currentPath = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/'
    if (typeof window !== 'undefined') {
      localStorage.setItem(MIGRATION_IN_PROGRESS_KEY, '1')
      localStorage.removeItem(MIGRATION_DONE_KEY)
      if (currentPath !== '/migrating') {
        localStorage.setItem(MIGRATION_RETURN_TO_KEY, currentPath)
      }
    }

    if (pathname !== '/migrating') {
      router.replace('/migrating')
    }

    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

    fetchWithAuth(`${backendUrl}/api/users/merge`, {
      method: 'POST',
      body: JSON.stringify({ guest_id: guestId }),
    })
      .then((res) => {
        if (res.ok) {
          localStorage.removeItem('guest_id')
          localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
          localStorage.setItem(MIGRATION_DONE_KEY, '1')
          console.log('[AuthListener] Guest assets merged into user account.')
        } else {
          localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
          localStorage.setItem(MIGRATION_DONE_KEY, '1')
          hasMerged.current = false
        }
      })
      .catch(() => {
        // Reset flag so it can retry on next render cycle
        if (typeof window !== 'undefined') {
          localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
          localStorage.setItem(MIGRATION_DONE_KEY, '1')
        }
        hasMerged.current = false
      })
  }, [isSignedIn, userId, pathname, router]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
