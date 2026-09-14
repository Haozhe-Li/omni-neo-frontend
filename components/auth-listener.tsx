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
 *
 * The merge runs in the background on whatever page the user is already on —
 * it used to force a redirect to a dedicated /migrating page, but that was a
 * jarring full-page interruption for what is usually a sub-second API call.
 * Instead it dispatches window events (`omni:guestmerge:start` / `:end`) that
 * the sidebar listens for to show an inline loading state over the thread list.
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

    previousSignedInRef.current = isSignedIn ?? null
  }, [isSignedIn])

  useEffect(() => {
    if (!isSignedIn || !userId || hasMerged.current) return

    const guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null
    if (!guestId) return

    // Set once per mount and never reset on failure below — this effect
    // re-runs on every isSignedIn/userId change, so if a transient error
    // (backend cold start, network blip) reset this to false, it would
    // retrigger a full migration attempt on the same tab repeatedly. One
    // attempt per fresh page load is enough; a real reload gets a fresh
    // `hasMerged` ref anyway.
    hasMerged.current = true

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omni:guestmerge:start'))
    }

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
        // Failure here is left for the next full page load to retry — see
        // the comment above hasMerged.current = true.
      })
      .catch(() => {
        // Network/offline error — same as above, don't retry within this tab.
      })
      .finally(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('omni:guestmerge:end'))
        }
      })
  }, [isSignedIn, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
