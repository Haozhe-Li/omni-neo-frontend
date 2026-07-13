'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { Lock, FileWarning, Loader2, WifiOff } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { ScheduleReportView } from '@/components/schedule-report-view'
import { ThreadStatusScreen } from '@/components/thread-status-screen'
import { Spinner } from '@/components/ui/spinner'
import { useApi } from '@/hooks/useApi'
import { useAppShell } from '@/hooks/useAppShell'
import type { Source } from '@/lib/types'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

type Status = 'checking' | 'ready' | 'pending' | 'failed' | 'unauthenticated' | 'not-found' | 'error'

interface RunReport {
    run_id: string
    task_name: string
    title: string | null
    report: string | null
    sources: Source[]
    summary: string | null
    error: string | null
    created_at: string
}

/**
 * /schedule/{run_id} — private, owner-only view of one scheduled-research
 * report. Unlike /pages/{id}, this is never public: the backend's
 * GET /schedule_task/run/{id} 404s for anyone but the task's own user, so
 * this always goes through fetchWithAuth (no guest/anonymous fallback path).
 */
export function SchedulePageClient({ runId }: { runId: string }) {
    const router = useRouter()
    const { isLoaded, isSignedIn } = useAuth()
    const clerk = useClerk()
    const { fetchWithAuth } = useApi()
    const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useAppShell()

    const [status, setStatus] = useState<Status>('checking')
    const [report, setReport] = useState<RunReport | null>(null)
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        if (!isLoaded) return

        if (!isSignedIn) {
            setStatus('unauthenticated')
            return
        }

        let cancelled = false
        setStatus('checking')

        fetchWithAuth(`${BACKEND_URL}/schedule_task/run/${runId}`)
            .then(async (res) => {
                if (cancelled) return
                if (res.status === 401) {
                    setStatus('unauthenticated')
                    return
                }
                if (res.status === 404) {
                    setStatus('not-found')
                    return
                }
                if (!res.ok) {
                    setStatus('error')
                    return
                }
                const data = await res.json().catch(() => null)
                if (!data) {
                    setStatus('error')
                    return
                }
                setReport(data as RunReport)
                if (data.status === 'success') setStatus('ready')
                else if (data.status === 'failed') setStatus('failed')
                else setStatus('pending')
            })
            .catch(() => {
                if (!cancelled) setStatus('error')
            })

        return () => {
            cancelled = true
        }
    }, [isLoaded, isSignedIn, runId, fetchWithAuth, attempt])

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
                title="Sign in to view this report"
                description="Scheduled reports are private to the account that created them. Sign in with that account to view it."
                primaryAction={{ label: 'Sign in', onClick: () => clerk.openSignIn() }}
                secondaryAction={{ label: 'Go home', href: '/' }}
            />
        )
    }

    if (status === 'not-found') {
        return (
            <ThreadStatusScreen
                icon={<FileWarning className="size-5" />}
                title="Report not found"
                description="This report doesn't exist, or you don't have access to it."
                primaryAction={{ label: 'Go home', onClick: goHome }}
            />
        )
    }

    if (status === 'pending') {
        return (
            <ThreadStatusScreen
                icon={<Loader2 className="size-5 animate-spin" />}
                title="Still generating"
                description="This report hasn't finished running yet. Check back in a bit."
                primaryAction={{ label: 'Refresh', onClick: retry }}
                secondaryAction={{ label: 'Go home', href: '/' }}
            />
        )
    }

    if (status === 'failed') {
        return (
            <ThreadStatusScreen
                icon={<FileWarning className="size-5" />}
                title="This run failed"
                description={report?.error || 'Something went wrong while generating this report.'}
                primaryAction={{ label: 'Go home', onClick: goHome }}
            />
        )
    }

    if (status === 'error') {
        return (
            <ThreadStatusScreen
                icon={<WifiOff className="size-5" />}
                title="Couldn't load this report"
                description="Something went wrong while fetching this report. Check your connection and try again."
                primaryAction={{ label: 'Retry', onClick: retry }}
                secondaryAction={{ label: 'Go home', href: '/' }}
            />
        )
    }

    if (!report) return null

    return (
        <div className="flex h-[100dvh] w-full bg-background overflow-hidden relative">
            <AppSidebar
                onSelectThread={selectThread}
                onNewChat={goHome}
                className="flex-shrink-0 z-50 relative"
                isOpen={sidebarOpen}
                onToggle={toggleSidebar}
                isMobile={isMobile}
            />

            <main className="flex-1 min-w-0 h-full relative overflow-hidden">
                <ScheduleReportView
                    runId={report.run_id}
                    taskName={report.task_name}
                    title={report.title || 'Untitled Research'}
                    markdown={report.report || ''}
                    sources={report.sources}
                    publishedAt={report.created_at}
                    isMobile={isMobile}
                    onToggleSidebar={toggleSidebar}
                />
            </main>
        </div>
    )
}
