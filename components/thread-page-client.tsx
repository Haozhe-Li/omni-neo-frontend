'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { Lock, MessageSquareOff, MessageSquareDashed, WifiOff } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatView } from '@/components/chat-view'
import { ThreadStatusScreen } from '@/components/thread-status-screen'
import { Spinner } from '@/components/ui/spinner'
import { useApi } from '@/hooks/useApi'
import { useAppShell } from '@/hooks/useAppShell'
import type { ChatMessage } from '@/lib/types'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

type Status = 'checking' | 'ready' | 'empty' | 'unauthenticated' | 'not-found' | 'error'
type PreloadedThread = { messages: ChatMessage[]; is_generating?: boolean }

export function ThreadPageClient({ threadId }: { threadId: string }) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const { fetchWithAuth } = useApi()
  const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useAppShell()

  const [status, setStatus] = useState<Status>('checking')
  const [preloadedThread, setPreloadedThread] = useState<PreloadedThread | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      setStatus('unauthenticated')
      return
    }

    let cancelled = false
    setStatus('checking')

    fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}`)
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 401) {
          setStatus('unauthenticated')
          return
        }
        if (res.status === 403 || res.status === 404) {
          setStatus('not-found')
          return
        }
        if (!res.ok) {
          setStatus('error')
          return
        }
        const data = await res.json().catch(() => null)
        if (Array.isArray(data?.messages) && data.messages.length > 0) {
          setPreloadedThread({ messages: data.messages as ChatMessage[], is_generating: !!data.is_generating })
          setStatus('ready')
        } else {
          setStatus('empty')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, threadId, fetchWithAuth, attempt])

  const goHome = useCallback(() => router.push('/'), [router])
  const selectThread = useCallback((id: string) => router.push(`/thread/${id}`), [router])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (status === 'checking') {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <ThreadStatusScreen
        icon={<Lock className="size-5" />}
        title="Sign in to view this conversation"
        description="This link points to a private conversation. Sign in with the account it belongs to in order to view it."
        primaryAction={{ label: 'Sign in', onClick: () => clerk.openSignIn() }}
        secondaryAction={{ label: 'Go home', href: '/' }}
      />
    )
  }

  if (status === 'not-found') {
    return (
      <ThreadStatusScreen
        icon={<MessageSquareOff className="size-5" />}
        title="Conversation not found"
        description="This conversation doesn't exist, or you don't have access to it."
        primaryAction={{ label: 'New chat', onClick: goHome }}
      />
    )
  }

  if (status === 'empty') {
    return (
      <ThreadStatusScreen
        icon={<MessageSquareDashed className="size-5" />}
        title="This conversation is empty"
        description="Nothing has been said here yet."
        primaryAction={{ label: 'Start a new chat', onClick: goHome }}
      />
    )
  }

  if (status === 'error') {
    return (
      <ThreadStatusScreen
        icon={<WifiOff className="size-5" />}
        title="Couldn't load this conversation"
        description="Something went wrong while fetching this conversation. Check your connection and try again."
        primaryAction={{ label: 'Retry', onClick: retry }}
        secondaryAction={{ label: 'Go home', href: '/' }}
      />
    )
  }

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden relative">
      <AppSidebar
        currentThreadId={threadId}
        onSelectThread={selectThread}
        onNewChat={goHome}
        className="flex-shrink-0 z-50 relative"
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        isMobile={isMobile}
      />

      <main className="flex-1 min-w-0 h-full relative overflow-hidden">
        <ChatView
          key={threadId}
          query={String(preloadedThread?.messages?.[0]?.content ?? '')}
          threadId={threadId}
          onNewSearch={goHome}
          onToggleSidebar={toggleSidebar}
          isMobile={isMobile}
          initialMode="fast"
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          preloadedThread={preloadedThread}
        />
      </main>
    </div>
  )
}
