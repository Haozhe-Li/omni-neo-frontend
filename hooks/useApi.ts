'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'

// Shared with useVoiceSession: the voice WebSocket can't set a custom
// Authorization header (browsers don't allow it on the WS handshake), so it
// needs this same guest id as a raw string to put in the connection URL's
// query string instead of a header.
export function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') return ''
  let guestId = localStorage.getItem('guest_id')
  if (!guestId) {
    guestId = `guest_${uuidv4()}`
    localStorage.setItem('guest_id', guestId)
  }
  return guestId
}

export const useApi = () => {
  const { getToken } = useAuth()

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getToken()
    const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    }

    if (!isFormDataBody && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else {
      headers['X-Guest-Id'] = getOrCreateGuestId()
    }

    return fetch(url, { ...options, headers })
  }, [getToken])

  return { fetchWithAuth }
}
