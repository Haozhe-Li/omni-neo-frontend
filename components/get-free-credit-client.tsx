'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth, useClerk } from '@clerk/nextjs'
import { ArrowLeft, Check, Copy, Gift, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { ThreadStatusScreen } from '@/components/thread-status-screen'
import { Spinner } from '@/components/ui/spinner'
import { useFreeCredit, type FreeCreditResult } from '@/hooks/useFreeCredit'
import { useUsage } from '@/hooks/useUsage'

type PageState = 'idle' | 'granted' | 'denied' | 'error'

/**
 * /get-free-credit — a standalone page (no sidebar, see the route's own
 * page.tsx) reached either from Settings → Usage's "ran out of credit?" line
 * or a direct link. One button runs the (stub, see backend db_free_credit.py)
 * risk check; on approval it mints a code this account alone can redeem and
 * offers to redeem it immediately without leaving the page.
 */
export function GetFreeCreditClient() {
    const { isLoaded, isSignedIn } = useAuth()
    const clerk = useClerk()
    const { requestFreeCredit, busy } = useFreeCredit()
    const { redeem } = useUsage()

    const [state, setState] = useState<PageState>('idle')
    const [result, setResult] = useState<FreeCreditResult | null>(null)
    const [copied, setCopied] = useState(false)
    const [redeeming, setRedeeming] = useState(false)
    const [redeemed, setRedeemed] = useState<number | null>(null)
    const [redeemError, setRedeemError] = useState(false)

    const handleGetCode = useCallback(async () => {
        const res = await requestFreeCredit()
        setResult(res)
        setState(res.status === 'ok' ? 'granted' : res.status === 'denied' ? 'denied' : 'error')
    }, [requestFreeCredit])

    // Auto-copy the moment a code appears — a manual Copy button stays
    // available right next to it for anyone who dismissed/missed the toast.
    useEffect(() => {
        if (result?.status !== 'ok') return
        navigator.clipboard
            .writeText(result.code)
            .then(() => {
                setCopied(true)
                toast.success('Code copied to clipboard')
            })
            .catch(() => {
                // Clipboard permission can be denied silently — the code is
                // still right there on screen to copy by hand.
            })
    }, [result])

    const handleCopy = useCallback(() => {
        if (result?.status !== 'ok') return
        navigator.clipboard.writeText(result.code)
        setCopied(true)
        toast.success('Code copied to clipboard')
    }, [result])

    const handleRedeemNow = useCallback(async () => {
        if (result?.status !== 'ok' || redeeming) return
        setRedeeming(true)
        setRedeemError(false)
        const res = await redeem(result.code)
        setRedeeming(false)
        if (res.ok) {
            setRedeemed(res.creditsAdded ?? null)
        } else {
            setRedeemError(true)
        }
    }, [result, redeem, redeeming])

    if (!isLoaded) {
        return (
            <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
                <Spinner className="size-6 text-muted-foreground" />
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <ThreadStatusScreen
                icon={<Lock className="size-5" />}
                title="Sign in to get free credit"
                description="This page is only available to signed-in accounts."
                primaryAction={{ label: 'Sign in', onClick: () => clerk.openSignIn() }}
                secondaryAction={{ label: 'Go home', href: '/' }}
            />
        )
    }

    return (
        <main className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-background px-6">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div
                    className="absolute -inset-[50%] opacity-[0.05] dark:opacity-[0.1]"
                    style={{
                        background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 60%)',
                        filter: 'blur(100px)',
                    }}
                />
            </div>

            <Link
                href="/"
                aria-label="Back home"
                className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--sand-deep)]"
            >
                <ArrowLeft size={17} />
            </Link>

            <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                <div className="mb-5 flex size-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--sand)] text-[var(--teal)]">
                    <Gift size={18} />
                </div>
                <h1 className="omni-display mb-2 text-[28px] leading-[1.1] text-[var(--ink)]">Get free credit</h1>
                <p className="mb-8 text-balance text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
                    Ran out of credit? Answer a quick check and we&apos;ll hand you a one-time code, just for this
                    account.
                </p>

                {state === 'idle' && (
                    <button
                        onClick={handleGetCode}
                        disabled={busy}
                        className="omni-pill omni-pill-solid px-6 py-2.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                        {busy ? 'Checking…' : 'Get free credit'}
                    </button>
                )}

                {state === 'denied' && (
                    <>
                        <div className="w-full rounded-2xl border border-[var(--destructive)]/25 bg-[var(--destructive)]/8 px-5 py-4 text-[13.5px] leading-relaxed text-[var(--destructive)]">
                            Sorry we can&apos;t offer this for you right now, please try again later.
                        </div>
                        <Link href="/" className="omni-pill mt-5 px-6 py-2.5 text-[14px]">
                            Back to home
                        </Link>
                    </>
                )}

                {state === 'error' && (
                    <>
                        <div className="w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--sand)]/60 px-5 py-4 text-[13.5px] leading-relaxed text-[var(--ink-muted)]">
                            Something went wrong. Please try again.
                        </div>
                        <button
                            onClick={() => setState('idle')}
                            className="omni-pill mt-5 px-6 py-2.5 text-[14px]"
                        >
                            Try again
                        </button>
                    </>
                )}

                {state === 'granted' && result?.status === 'ok' && (
                    <div className="w-full">
                        <div className="w-full rounded-2xl border border-[var(--line)] bg-[var(--sand)]/60 px-5 py-5 text-left">
                            <p className="mb-3 text-[12px] uppercase tracking-wide text-[var(--ink-faint)]">
                                Your code
                            </p>
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line-strong)] bg-[var(--paper)] px-4 py-3">
                                <span className="min-w-0 truncate font-mono text-[15px] tracking-wide text-[var(--ink)]">
                                    {result.code}
                                </span>
                                <button
                                    onClick={handleCopy}
                                    aria-label="Copy code"
                                    className="shrink-0 text-[var(--ink-muted)] transition-colors hover:text-[var(--teal)]"
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                            <p className="mt-3 text-[12.5px] text-[var(--ink-faint)]">
                                Redeem within 3 days, or it expires.
                            </p>
                        </div>

                        {redeemed !== null ? (
                            <div className="mt-5 flex flex-col items-center gap-3">
                                <p className="text-[13.5px] text-[var(--teal)]">
                                    {redeemed.toLocaleString()} credits added.
                                </p>
                                <Link href="/" className="omni-pill omni-pill-solid px-6 py-2.5 text-[14px]">
                                    Go to chat
                                </Link>
                            </div>
                        ) : (
                            <div className="mt-5 flex flex-col items-center gap-2">
                                <button
                                    onClick={handleRedeemNow}
                                    disabled={redeeming}
                                    className="omni-pill omni-pill-solid px-6 py-2.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {redeeming ? <Loader2 size={14} className="animate-spin" /> : null}
                                    {redeeming ? 'Redeeming…' : 'Redeem now'}
                                </button>
                                {redeemError && (
                                    <p className="text-[12.5px] text-[var(--destructive)]">
                                        Couldn&apos;t redeem it here — paste the code into Settings → Usage instead.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    )
}
