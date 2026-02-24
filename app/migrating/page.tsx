'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MigratingPage() {
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [progress, setProgress] = useState(10)
  const [mergeDone, setMergeDone] = useState(false)
  const [statusText, setStatusText] = useState('Preparing secure migration...')
  const mountedAtRef = useRef<number>(Date.now())
  const redirectingRef = useRef(false)

  const MIGRATION_IN_PROGRESS_KEY = 'guest_merge_in_progress'
  const MIGRATION_RETURN_TO_KEY = 'guest_merge_return_to'
  const MIGRATION_DONE_KEY = 'guest_merge_done'

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 20)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        const cap = mergeDone ? 97 : 92
        const delta = mergeDone ? (Math.random() * 2 + 0.4) : (Math.random() * 4 + 1.2)
        return Math.min(prev + delta, cap)
      })
    }, 180)
    return () => clearInterval(timer)
  }, [mergeDone])

  useEffect(() => {
    const warmMessages = [
      'Migrating your guest chats...',
      'Almost there, preparing your synced workspace...',
      'Bringing your history and settings together...',
    ]

    const timer = setInterval(() => {
      if (typeof window === 'undefined') return
      const done = localStorage.getItem(MIGRATION_DONE_KEY) === '1'
      const inProgress = localStorage.getItem(MIGRATION_IN_PROGRESS_KEY) === '1'

      if (done) {
        setMergeDone(true)
        setStatusText('Finalizing your synced history...')
      } else if (inProgress) {
        const idx = Math.floor(Date.now() / 1100) % warmMessages.length
        setStatusText(warmMessages[idx])
      }
    }, 160)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!mergeDone || redirectingRef.current) return

    redirectingRef.current = true
    const elapsed = Date.now() - mountedAtRef.current
    const remaining = Math.max(0, 5000 - elapsed)

    const waitTimer = setTimeout(() => {
      setStatusText('Redirecting...')
      setProgress(100)
      setIsVisible(false)

      const leaveTimer = setTimeout(() => {
        if (typeof window !== 'undefined') {
          const returnTo = localStorage.getItem(MIGRATION_RETURN_TO_KEY) || '/'
          localStorage.removeItem(MIGRATION_DONE_KEY)
          localStorage.removeItem(MIGRATION_RETURN_TO_KEY)
          localStorage.removeItem(MIGRATION_IN_PROGRESS_KEY)
          router.replace(returnTo)
        }
      }, 420)

      return () => clearTimeout(leaveTimer)
    }, remaining)

    return () => clearTimeout(waitTimer)
  }, [mergeDone, router])

  return (
    <main className={`relative min-h-screen flex items-center justify-center bg-[var(--background)] px-6 overflow-hidden transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 via-transparent to-[var(--accent)]/5 animate-pulse" style={{ animationDuration: '3.2s' }} />

      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)]/80 backdrop-blur-sm p-6 sm:p-7 shadow-sm transition-all duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[var(--accent)]/12 flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-[1.5px] border-[var(--accent)] border-t-transparent animate-spin" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--foreground)]">Syncing your chats</h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">We’re securely migrating your guest history to your account.</p>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full bg-[var(--secondary)] overflow-hidden">
          <div
            className="h-full bg-[var(--accent)]/65 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
          />
        </div>

        <p className="mt-3 text-xs text-[var(--muted-foreground)] min-h-[16px]">
          {statusText}
        </p>
      </div>
    </main>
  )
}
