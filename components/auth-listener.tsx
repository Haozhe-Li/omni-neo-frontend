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
  const MIGRATION_STARTED_AT_KEY = 'guest_merge_started_at'
  const MIGRATION_RETURN_TO_KEY = 'guest_merge_return_to'
  const MIGRATION_DONE_KEY = 'guest_merge_done'
  // A merge is a single fast API call — if the "in progress" flag is older
  // than this, the tab that set it was closed/crashed before clearing it.
  // Without a staleness check, a stuck flag would redirect every future page
  // load (any route, any tab, e.g. opening a report link from email) to
  // /migrating forever, since nothing else ever clears it.
  const MIGRATION_STALE_MS = 20000

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
        localStorage.removeItem(MIGRATION_STARTED_AT_KEY)
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
    if (!inProgress) return

    const startedAt = Number(localStorage.getItem(MIGRATION_STARTED_AT_KEY) || 0)
    const isStale = !startedAt || Date.now() - startedAt > MIGRATION_STALE_MS
    if (isStale) {
      // Whatever tab set this flag never cleared it (closed mid-request,
      // crashed, etc). Drop it instead of redirecting forever.
      localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
      localStorage.removeItem(MIGRATION_STARTED_AT_KEY)
      return
    }

    if (pathname !== '/migrating') {
      router.replace('/migrating')
    }
  }, [isSignedIn, pathname, router])

  useEffect(() => {
    if (!isSignedIn || !userId || hasMerged.current) return

    const guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null
    if (!guestId) return

    // Set once per mount and never reset on failure below — this effect
    // re-runs on every pathname change (see deps), so if a transient error
    // (backend cold start, network blip) reset this to false, every single
    // route navigation for the rest of the tab's life would retrigger a full
    // migration attempt. One attempt per fresh page load is enough; a real
    // reload gets a fresh `hasMerged` ref anyway.
    hasMerged.current = true
    const currentPath = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/'
    if (typeof window !== 'undefined') {
      localStorage.setItem(MIGRATION_IN_PROGRESS_KEY, '1')
      localStorage.setItem(MIGRATION_STARTED_AT_KEY, String(Date.now()))
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
          localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
          localStorage.removeItem(MIGRATION_STARTED_AT_KEY)
          localStorage.setItem(MIGRATION_DONE_KEY, '1')
        }
      })
  }, [isSignedIn, userId, pathname, router]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
