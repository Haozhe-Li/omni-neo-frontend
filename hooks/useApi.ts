'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

export const useApi = () => {
  const { getToken } = useAuth()

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getToken()
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else {
      let guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null
      if (!guestId) {
        guestId = `guest_${uuidv4()}`
        if (typeof window !== 'undefined') {
          localStorage.setItem('guest_id', guestId)
        }
      }
      headers['X-Guest-Id'] = guestId
    }

    return fetch(url, { ...options, headers })
  }, [getToken])

  return { fetchWithAuth }
}
