'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useApi } from '@/hooks/useApi'
import { useAuth } from '@clerk/nextjs'

export interface UsageData {
  is_guest: boolean
  day_used: number
  day_limit: number
  day_remaining: number
  month_used: number
  month_limit: number
  month_remaining: number
  mode_cost: { fast: number; pro: number }
  resets_day_at: string
  resets_month_at: string
}

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// Module-level cache shared by every useUsage() consumer in this session —
// opening the Usage tab (or remounting the model picker) shouldn't hit the
// backend again; only an explicit refresh() or a sign-in/out transition does.
let cachedUsage: UsageData | null = null
let cachedAt: number | null = null

/**
 * Usage standing for the current caller (guest or signed-in — the backend
 * scopes limits by tier, the shape is identical either way). Cached across
 * the session; call `refresh()` to force a fresh read.
 */
export function useUsage() {
  const { fetchWithAuth } = useApi()
  const { isSignedIn } = useAuth()
  const [usage, setUsage] = useState<UsageData | null>(cachedUsage)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(cachedAt)
  const [isLoading, setIsLoading] = useState(!cachedUsage)
  const prevSignedInRef = useRef(isSignedIn)

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/usage`)
      if (res.ok) {
        const data: UsageData = await res.json()
        cachedUsage = data
        cachedAt = Date.now()
        setUsage(data)
        setLastRefreshedAt(cachedAt)
      }
    } catch (e) {
      console.error('[useUsage] Failed to fetch usage', e)
    } finally {
      setIsLoading(false)
    }
  }, [fetchWithAuth])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await fetchUsage()
  }, [fetchUsage])

  useEffect(() => {
    // A sign-in/out transition changes the caller's tier entirely — the
    // cached numbers from the old identity are meaningless, force a refetch.
    if (prevSignedInRef.current !== isSignedIn) {
      prevSignedInRef.current = isSignedIn
      cachedUsage = null
      cachedAt = null
      fetchUsage()
      return
    }
    if (!cachedUsage) {
      fetchUsage()
    } else {
      setUsage(cachedUsage)
      setLastRefreshedAt(cachedAt)
      setIsLoading(false)
    }
  }, [isSignedIn, fetchUsage])

  // True once either budget hits zero — the frontend never shows the
  // underlying numbers, just this single "you're out" boolean.
  const exceeded = usage ? usage.day_remaining <= 0 || usage.month_remaining <= 0 : false

  return { usage, isLoading, lastRefreshedAt, refresh, exceeded }
}
