'use client'

import { useEffect, useState, useCallback } from 'react'
import { useClerk } from '@clerk/nextjs'
import { Sparkles, Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface UsageLimitEventDetail {
    scope: 'day' | 'month' | 'both'
    isGuest: boolean
    dayUsed: number
    dayLimit: number
    monthUsed: number
    monthLimit: number
    resetsDayAt: string
    resetsMonthAt: string
}

declare global {
    interface WindowEventMap {
        'omni:usage-limit': CustomEvent<UsageLimitEventDetail>
    }
}

function formatResetTime(iso: string, scope: 'day' | 'month'): string {
    try {
        const date = new Date(iso)
        if (scope === 'day') {
            return `tomorrow at ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)}`
        }
        return `on ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date)}`
    } catch {
        return scope === 'day' ? 'tomorrow' : 'next month'
    }
}

/**
 * Global modal for when a /chat or /rewind call is rejected for exceeding
 * the usage limit. Mounted once (see app-sidebar.tsx) and driven entirely
 * by the `omni:usage-limit` window event, so any call site can trigger it
 * without prop-drilling — same pattern as the gen:start/gen:stop events.
 */
export function UsageLimitDialog() {
    const clerk = useClerk()
    const [detail, setDetail] = useState<UsageLimitEventDetail | null>(null)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const onLimit = (e: CustomEvent<UsageLimitEventDetail>) => {
            setDetail(e.detail)
            setOpen(true)
        }
        window.addEventListener('omni:usage-limit', onLimit)
        return () => window.removeEventListener('omni:usage-limit', onLimit)
    }, [])

    const handleSignIn = useCallback(() => {
        setOpen(false)
        clerk.openSignIn()
    }, [clerk])

    if (!detail) return null

    const scope = detail.scope === 'both' ? 'month' : detail.scope
    const resetText = formatResetTime(
        scope === 'day' ? detail.resetsDayAt : detail.resetsMonthAt,
        scope
    )
    const scopeLabel = scope === 'day' ? 'today' : 'this month'

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="bg-black/5 dark:bg-black/40"
                className="p-0 border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl overflow-hidden
                    w-[92vw] max-w-[400px] rounded-2xl gap-0"
            >
                <DialogTitle className="sr-only">Usage limit reached</DialogTitle>

                <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center gap-4">
                    <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        detail.isGuest ? 'bg-[var(--accent)]/10' : 'bg-[var(--secondary)]'
                    )}>
                        {detail.isGuest
                            ? <Sparkles size={20} className="text-[var(--accent)]" />
                            : <Clock size={20} className="text-[var(--muted-foreground)]" />}
                    </div>

                    {detail.isGuest ? (
                        <>
                            <div className="space-y-1.5">
                                <h2 className="text-base font-medium text-[var(--foreground)]">
                                    You've reached your usage limit for {scopeLabel}
                                </h2>
                                <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                                    Sign in for free to get 10× more usage every month, plus chat history synced
                                    across all your devices.
                                </p>
                            </div>
                            <div className="flex flex-col w-full gap-2 pt-1">
                                <button
                                    onClick={handleSignIn}
                                    className="w-full h-10 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    Sign in
                                </button>
                                <button
                                    onClick={() => setOpen(false)}
                                    className="w-full h-10 rounded-xl text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors"
                                >
                                    Maybe later
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <h2 className="text-base font-medium text-[var(--foreground)]">
                                    You've reached your usage limit for {scopeLabel}
                                </h2>
                                <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                                    More usage unlocks {resetText}. Thanks for being an active user of Omni.
                                </p>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-full h-10 rounded-xl bg-[var(--secondary)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--secondary)]/70 transition-colors"
                            >
                                Got it
                            </button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
