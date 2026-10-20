'use client'

import { useCallback, useState } from 'react'
import { useApi } from '@/hooks/useApi'

export type FreeCreditResult =
  | { status: 'ok'; code: string; expiresAt: string }
  | { status: 'denied' }
  | { status: 'error' }

/**
 * Where this account stands in the 3-day cooldown (GET /api/free_credit):
 * `available` — nothing on file, a new code may be requested;
 * `cooldown` — a code was handed out within the window (`redeemed` says whether
 * it has been claimed yet); `availableAt` is when a new one can be requested;
 * `denied` — a denial is on file until `availableAt`.
 */
export type FreeCreditStatus =
  | { status: 'available' }
  | { status: 'cooldown'; code: string; expiresAt: string | null; redeemed: boolean; availableAt: string }
  | { status: 'denied'; availableAt: string }
  | { status: 'error' }

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

/**
 * Backs the /get-free-credit page: GET /api/free_credit reports the cooldown
 * state on load, and POST /api/free_credit runs (or replays,
 * within its cooldown — see core/database/db_free_credit.py) a risk check and
 * either mints a code only this user can redeem or turns us away. Signed-in
 * only; the page itself gates on that before this is ever called.
 */
export function useFreeCredit() {
  const { fetchWithAuth } = useApi()
  const [busy, setBusy] = useState(false)

  const fetchStatus = useCallback(async (): Promise<FreeCreditStatus> => {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/free_credit`)
      const data = await res.json().catch(() => null)
      if (!res.ok) return { status: 'error' }
      if (data?.status === 'available') return { status: 'available' }
      if (data?.status === 'denied') return { status: 'denied', availableAt: data.available_at }
      if (data?.status === 'cooldown' && typeof data.code === 'string') {
        return {
          status: 'cooldown',
          code: data.code,
          expiresAt: data.expires_at ?? null,
          redeemed: !!data.redeemed,
          availableAt: data.available_at,
        }
      }
      return { status: 'error' }
    } catch (e) {
      console.error('[useFreeCredit] status failed', e)
      return { status: 'error' }
    }
  }, [fetchWithAuth])

  const requestFreeCredit = useCallback(async (): Promise<FreeCreditResult> => {
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/free_credit`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) return { status: 'error' }
      if (data?.status === 'ok' && typeof data.code === 'string') {
        return { status: 'ok', code: data.code, expiresAt: data.expires_at }
      }
      if (data?.status === 'denied') return { status: 'denied' }
      return { status: 'error' }
    } catch (e) {
      console.error('[useFreeCredit] request failed', e)
      return { status: 'error' }
    } finally {
      setBusy(false)
    }
  }, [fetchWithAuth])

  return { fetchStatus, requestFreeCredit, busy }
}
