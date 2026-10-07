'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { MessageSquareOff, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatView } from '@/components/chat-view'
import { ThreadStatusScreen } from '@/components/thread-status-screen'
import { Spinner } from '@/components/ui/spinner'
import { useApi } from '@/hooks/useApi'
import { useAppShell } from '@/hooks/useAppShell'
import { DEFAULT_MODEL } from '@/lib/models'
import type { ChatMessage } from '@/lib/types'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

type Status = 'loading' | 'ready' | 'not-found' | 'error'

interface SharedThread {
  title?: string
  messages: ChatMessage[]
}

/**
 * /s/{shareId}: a shared conversation, read-only. Anyone can open it, signed in
 * or not — the data comes from a public endpoint that returns only what the page
 * renders. Continuing it is the one action, and it creates a private copy owned
 * by whoever clicked (POST /api/shared/{id}/fork), so signing in is required for
 * that step and nothing else.
 */
export function SharedThreadClient({ shareId }: { shareId: string }) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { fetchWithAuth } = useApi()
  const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useAppShell()

  const [status, setStatus] = useState<Status>('loading')
  const [thread, setThread] = useState<SharedThread | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    // Plain fetch, no auth header: this endpoint is public by design.
    fetch(`${BACKEND_URL}/api/shared/${encodeURIComponent(shareId)}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) return setStatus('not-found')
        if (!res.ok) return setStatus('error')
        const data = await res.json().catch(() => null)
        if (!Array.isArray(data?.messages) || data.messages.length === 0) return setStatus('not-found')
        setThread({ title: typeof data.title === 'string' ? data.title : undefined, messages: data.messages as ChatMessage[] })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [shareId, attempt])

  const goHome = useCallback(() => router.push('/'), [router])
  const selectThread = useCallback((id: string) => router.push(`/thread/${id}`), [router])

  const handleContinue = useCallback(async () => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    setContinuing(true)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/shared/${encodeURIComponent(shareId)}/fork`, { method: 'POST' })
      if (!res.ok) {
        let detail = 'Couldn’t copy this conversation. Please try again.'
        try {
          const body = await res.json()
          if (typeof body?.detail === 'string') detail = body.detail
        } catch {}
        toast.error(detail)
        setContinuing(false)
        return
      }
      const { thread_id } = await res.json()
      router.push(`/thread/${thread_id}`)
    } catch {
      toast.error('Couldn’t copy this conversation. Please try again.')
      setContinuing(false)
    }
  }, [isSignedIn, clerk, fetchWithAuth, shareId, router])

  if (status === 'not-found') {
    return (
      <ThreadStatusScreen
        icon={<MessageSquareOff className="size-5" />}
        title="This link doesn't work anymore"
        description="The conversation was never shared, or its owner has revoked the link."
        primaryAction={{ label: 'New chat', onClick: goHome }}
      />
    )
  }

  if (status === 'error') {
    return (
      <ThreadStatusScreen
        icon={<WifiOff className="size-5" />}
        title="Couldn't load this conversation"
        description="Something went wrong while fetching it. Check your connection and try again."
        primaryAction={{ label: 'Retry', onClick: () => setAttempt((n) => n + 1) }}
        secondaryAction={{ label: 'Go home', href: '/' }}
      />
    )
  }

  const loading = status === 'loading' || !thread
  return (
    <div className="omni-app-shell flex h-[100dvh] w-full overflow-hidden relative">
      <AppSidebar
        currentThreadId=""
        onSelectThread={selectThread}
        onNewChat={goHome}
        className="flex-shrink-0 z-50 relative"
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        isMobile={isMobile}
      />

      <main className={`flex-1 min-w-0 h-full relative overflow-hidden ${loading ? '' : 'omni-fade-in'}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : (
          <ChatView
            key={shareId}
            query={String(thread.messages[0]?.content ?? '')}
            // Not a real thread id, and nothing sends it anywhere: read-only mode
            // turns off every call that would use it. It only has to be stable.
            threadId={`shared-${shareId}`}
            onNewSearch={goHome}
            onToggleSidebar={toggleSidebar}
            isMobile={isMobile}
            initialMode={DEFAULT_MODEL}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            preloadedThread={{ messages: thread.messages, title: thread.title, is_generating: false }}
            readOnly
            onContinue={handleContinue}
            continuing={continuing}
          />
        )}
      </main>
    </div>
  )
}
