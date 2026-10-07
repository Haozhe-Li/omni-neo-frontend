'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/useApi'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export interface SharedLink {
  share_id: string
  source_thread_id: string | null
  title: string | null
  n_messages: number
  created_at: string
}

export const sharedLinkUrl = (shareId: string) => `${window.location.origin}/s/${shareId}`

/**
 * The signed-in user's shared-conversation links (`GET /api/shares`).
 *
 * With `threadId`, only the links that were made from that conversation — what
 * the share dialog and the thread menu care about. Without it, all of them,
 * which is what Settings > Chat history manages. A guest has none (the endpoint
 * refuses them), so a 403 reads as an empty list rather than an error.
 *
 * `enabled: false` defers the request — the thread menu only needs the count
 * once it is actually opened.
 */
export function useSharedLinks({ threadId, enabled = true }: { threadId?: string; enabled?: boolean } = {}) {
  const { fetchWithAuth } = useApi()
  const [links, setLinks] = useState<SharedLink[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/shares`)
      if (res.ok) {
        const all: SharedLink[] = (await res.json()).shares ?? []
        setLinks(threadId ? all.filter((l) => l.source_thread_id === threadId) : all)
      } else {
        setLinks([])
      }
    } catch (e) {
      console.error('Load shared links failed', e)
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [fetchWithAuth, threadId])

  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])

  /** Revoke one link. Resolves to an error message, or null on success. */
  const revoke = useCallback(
    async (shareId: string): Promise<string | null> => {
      try {
        const res = await fetchWithAuth(`${BACKEND_URL}/api/shares/${shareId}`, { method: 'DELETE' })
        if (!res.ok) {
          let detail = 'Couldn’t revoke that link'
          try {
            const body = await res.json()
            if (typeof body?.detail === 'string') detail = body.detail
          } catch {}
          return detail
        }
        setLinks((prev) => prev.filter((l) => l.share_id !== shareId))
        return null
      } catch {
        return 'Couldn’t revoke that link'
      }
    },
    [fetchWithAuth]
  )

  return { links, loading, loaded, reload, revoke }
}
