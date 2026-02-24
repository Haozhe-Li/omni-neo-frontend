'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@clerk/nextjs'

interface GuestQuota {
  daily_limit: number
  used: number
  remaining: number
}

/**
 * Hook to fetch and track guest user daily quota for canvas/auto modes.
 * Signed-in users always get unlimited (-1), so `quotaExceeded` is always false for them.
 */
export function useGuestQuota() {
  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const [quota, setQuota] = useState<GuestQuota | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const backendUrl = (
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
      ).replace(/\/$/, '')
      const res = await fetchWithAuth(`${backendUrl}/api/guests/daily-quota`)
      if (res.ok) {
        const data: GuestQuota = await res.json()
        setQuota(data)
      }
    } catch (e) {
      console.error('[GuestQuota] Failed to fetch quota', e)
    } finally {
      setIsLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    refresh()
  }, [refresh])

  const isGuest = isSignedIn === false
  const quotaExceeded = isGuest && quota !== null && quota.remaining === 0

  return { quota, isLoading, isGuest, quotaExceeded, refresh }
}
