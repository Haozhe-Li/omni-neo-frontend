'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth, useClerk } from '@clerk/nextjs'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { FreeCreditView, type FreeCreditViewState } from '@/components/free-credit-view'
import { ThreadStatusScreen } from '@/components/thread-status-screen'
import { Spinner } from '@/components/ui/spinner'
import { useFreeCredit, type FreeCreditStatus } from '@/hooks/useFreeCredit'
import { useUsage, type RedeemError } from '@/hooks/useUsage'

// Matches the backend's grant cooldown (db_free_credit.py), used only to date
// the next code after a grab or a redeem made on this very page — on load the
// backend reports the real remaining time.
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000

const REDEEM_ERROR_COPY: Partial<Record<RedeemError, string>> = {
    code_expired: 'This code has expired.',
    invalid_code: 'This code isn’t valid.',
}

function viewFromStatus(s: FreeCreditStatus): FreeCreditViewState {
    switch (s.status) {
        case 'available':
            return { kind: 'available' }
        case 'denied':
            return { kind: 'denied', availableAt: s.availableAt }
        case 'cooldown':
            return s.redeemed
                ? { kind: 'redeemed', code: s.code, availableAt: s.availableAt, creditsAdded: null }
                : { kind: 'code', code: s.code, expiresAt: s.expiresAt }
        default:
            return { kind: 'error' }
    }
}

/**
 * /get-free-credit — a standalone page (no sidebar, see the route's own
 * page.tsx) reached from Settings → Usage's "ran out of credit?" line or a
 * direct link. A code can be grabbed once every 3 days: with nothing on file
 * the page offers the button; once a code has been handed out it shows that
 * code instead (redeemable, or marked redeemed until the cooldown lapses).
 */
export function GetFreeCreditClient() {
    const { isLoaded, isSignedIn } = useAuth()
    const clerk = useClerk()
    const { fetchStatus, requestFreeCredit, busy } = useFreeCredit()
    const { redeem } = useUsage()

    const [view, setView] = useState<FreeCreditViewState>({ kind: 'loading' })
    const [copied, setCopied] = useState(false)
    const [redeeming, setRedeeming] = useState(false)
    const [redeemError, setRedeemError] = useState<string | null>(null)

    const loadStatus = useCallback(async () => {
        setView({ kind: 'loading' })
        setView(viewFromStatus(await fetchStatus()))
    }, [fetchStatus])

    useEffect(() => {
        if (isLoaded && isSignedIn) void loadStatus()
    }, [isLoaded, isSignedIn, loadStatus])

    const handleGrab = useCallback(async () => {
        const res = await requestFreeCredit()
        if (res.status === 'ok') {
            setCopied(false)
            setRedeemError(null)
            setView({ kind: 'code', code: res.code, expiresAt: res.expiresAt })
            // Auto-copy the moment a code appears — a Copy button stays on
            // the ticket for anyone who dismissed the toast.
            navigator.clipboard
                .writeText(res.code)
                .then(() => {
                    setCopied(true)
                    toast.success('Code copied to clipboard')
                })
                .catch(() => {
                    // Clipboard permission can be denied silently — the code is
                    // still on screen to copy by hand.
                })
        } else if (res.status === 'denied') {
            setView({ kind: 'denied', availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        } else {
            setView({ kind: 'error' })
        }
    }, [requestFreeCredit])

    const handleCopy = useCallback(() => {
        if (view.kind !== 'code') return
        navigator.clipboard.writeText(view.code)
        setCopied(true)
        toast.success('Code copied to clipboard')
    }, [view])

    const handleRedeem = useCallback(async () => {
        if (view.kind !== 'code' || redeeming) return
        setRedeeming(true)
        setRedeemError(null)
        const res = await redeem(view.code)
        setRedeeming(false)
        if (res.ok) {
            setView({
                kind: 'redeemed',
                code: view.code,
                availableAt: new Date(Date.now() + COOLDOWN_MS).toISOString(),
                creditsAdded: res.creditsAdded ?? null,
            })
        } else if (res.error === 'already_redeemed') {
            // Claimed elsewhere (e.g. pasted into Settings) — show the real state.
            void loadStatus()
        } else {
            setRedeemError(
                (res.error && REDEEM_ERROR_COPY[res.error]) ||
                    'Couldn’t redeem it here — paste the code into Settings → Usage instead.',
            )
        }
    }, [view, redeem, redeeming, loadStatus])

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
        <FreeCreditView
            view={view}
            busy={busy}
            copied={copied}
            redeeming={redeeming}
            redeemError={redeemError}
            onGrab={handleGrab}
            onCopy={handleCopy}
            onRedeem={handleRedeem}
            onRetry={loadStatus}
        />
    )
}
