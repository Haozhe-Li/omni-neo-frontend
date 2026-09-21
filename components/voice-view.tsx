'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Menu, Mic, MicOff, Phone, X } from 'lucide-react'
import { useVoiceSession } from '@/hooks/useVoiceSession'
import { useTypewriter } from '@/hooks/useTypewriter'
import { cn } from '@/lib/utils'

const TERMINAL_STATUSES = new Set(['done', 'interrupted', 'error'])
const NEW_UTTERANCE_FADE_MS = 260

export function VoiceView({
    onToggleSidebar,
    isMobile,
    resumeThreadId,
}: {
    onToggleSidebar?: () => void
    isMobile?: boolean
    resumeThreadId?: string | null
}) {
    const router = useRouter()
    const orbRef = useRef<HTMLDivElement>(null)
    const autoStartedRef = useRef(false)
    const {
        connectionState,
        orbMode,
        muted,
        currentTurn,
        liveTranscript,
        errorMessage,
        agentCaption,
        agentCaptionKey,
        activeThreadId,
        start,
        stop,
        toggleMute,
    } = useVoiceSession(orbRef)

    // Enter the page already in "on a call" mode — no separate "tap to
    // start" screen. Guarded by a ref (not an empty-deps-only effect alone)
    // so React StrictMode's dev-only mount->cleanup->mount cycle can't fire
    // `start()` twice; the cleanup from the first synthetic mount still runs
    // (see useVoiceSession's own unmount effect), so the *second* real
    // mount is what settles into the one connection that actually sticks.
    useEffect(() => {
        if (autoStartedRef.current) return
        autoStartedRef.current = true
        start(resumeThreadId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const connected = connectionState === 'connected'
    const inCall = connected || connectionState === 'connecting'

    // Once a call has actually connected, every way it ends — hang-up,
    // dropped connection, server-side error — goes straight back to that
    // thread's text transcript instead of lingering on this page. No
    // feedback prompt: the thread itself is right there to read/continue.
    const wasConnectedRef = useRef(false)
    // handleCallButton's explicit hangup and the disconnect-catching effect
    // below can both fire for the same hangup (stop() flips connectionState,
    // which the effect also reacts to) — guard so that only navigates once.
    const hasNavigatedRef = useRef(false)

    useEffect(() => {
        if (connectionState === 'connected') wasConnectedRef.current = true
    }, [connectionState])

    const goToThread = useCallback(() => {
        if (hasNavigatedRef.current) return
        hasNavigatedRef.current = true
        router.push(activeThreadId ? `/thread/${activeThreadId}` : '/')
    }, [router, activeThreadId])

    useEffect(() => {
        if ((connectionState === 'closed' || connectionState === 'error') && wasConnectedRef.current) {
            wasConnectedRef.current = false
            goToThread()
        }
    }, [connectionState, goToThread])

    const handleCallButton = () => {
        if (!inCall) {
            start(resumeThreadId)
            return
        }
        const hadRealCall = connected
        stop()
        if (hadRealCall) goToThread()
        else router.push('/')
    }

    const visualState =
        connectionState === 'connecting' ? 'connecting' : connectionState !== 'connected' ? 'idle' : orbMode

    const statusLabel =
        connectionState === 'connecting'
            ? 'Connecting…'
            : connectionState === 'error'
              ? 'Connection error'
              : orbMode === 'thinking'
                ? 'Omni is thinking'
                : orbMode === 'speaking'
                  ? 'Omni is speaking'
                  : 'Say something'

    // ── The two-slot transcript display ────────────────────────────────────
    // One "top" slot (small, grey — a settled, past line) and one "main"
    // slot (large, bold — whatever is live right now). What occupies main
    // moves through three phases per turn:
    //   1. user is talking, no turn yet: main = live transcript, top = empty
    //   2. agent starts replying but no caption chunk has landed yet: the
    //      user's now-finalized line slides up into top (small/grey), main
    //      shows the raw growing agent_text (agentCaption is still empty)
    //   3. once threshold-timed captions start (agentCaption,
    //      agentCaptionKey — see useVoiceSession), top collapses and main
    //      becomes a sliding window of the last few fixed-size chunks,
    //      timed to when the agent is actually speaking them rather than
    //      when the text arrived — a single ever-growing reply would run
    //      off the screen for anything longer than a couple sentences.
    //   4. user starts a NEW utterance: the whole old exchange (top + main)
    //      fades out, then main resets to the new live transcript
    // Phase-4 transitions are the only ones that get an explicit fade —
    // every other change (topText appearing, main growing, or the caption
    // window sliding) applies immediately; see isNewUtteranceSwap below.
    const isTerminal = !currentTurn || TERMINAL_STATUSES.has(currentTurn.status)
    const showingLiveUtterance = isTerminal && liveTranscript.length > 0

    const targetTopText = showingLiveUtterance
        ? ''
        : agentCaption
          ? ''
          : currentTurn && currentTurn.agentText
            ? currentTurn.userText
            : ''
    const targetMainText = showingLiveUtterance
        ? liveTranscript
        : agentCaption
          ? agentCaption
          : currentTurn
            ? currentTurn.agentText || currentTurn.userText
            : ''
    const targetMainKey = showingLiveUtterance
        ? 'user-live'
        : agentCaption
          ? agentCaptionKey
          : currentTurn
            ? currentTurn.agentText
                ? `agent-${currentTurn.turnId}`
                : `user-${currentTurn.turnId}`
            : 'empty'

    const [slot, setSlot] = useState({ topText: '', mainText: '', mainKey: 'empty' })
    const [fadingOut, setFadingOut] = useState(false)
    const targetSnapshotRef = useRef({ topText: '', mainText: '', mainKey: 'empty' })
    const lastKeyRef = useRef('empty')
    const fadeTimerRef = useRef<number | null>(null)

    targetSnapshotRef.current = { topText: targetTopText, mainText: targetMainText, mainKey: targetMainKey }

    useEffect(() => {
        // A fresh utterance replacing a finished exchange — fade the old
        // one out first. Anything else (the push-up when the agent starts
        // replying, or agent text simply growing) applies immediately.
        const isNewUtteranceSwap =
            targetMainKey === 'user-live' && lastKeyRef.current !== 'user-live' && lastKeyRef.current !== 'empty'
        lastKeyRef.current = targetMainKey

        if (isNewUtteranceSwap) {
            if (fadeTimerRef.current === null) {
                setFadingOut(true)
                fadeTimerRef.current = window.setTimeout(() => {
                    fadeTimerRef.current = null
                    setFadingOut(false)
                    setSlot(targetSnapshotRef.current)
                }, NEW_UTTERANCE_FADE_MS)
            }
            // else: a fade is already in flight: its callback reads
            // targetSnapshotRef fresh, so this update rides along for free.
        } else if (fadeTimerRef.current === null) {
            setSlot({ topText: targetTopText, mainText: targetMainText, mainKey: targetMainKey })
        }
    }, [targetTopText, targetMainText, targetMainKey])

    useEffect(
        () => () => {
            if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current)
        },
        []
    )

    const { text: mainRevealed, isTyping } = useTypewriter(slot.mainText, slot.mainKey)

    const hasText = slot.topText.length > 0 || slot.mainText.length > 0

    return (
        <div className="relative flex h-full w-full flex-col items-center justify-center bg-[var(--paper)] px-6">
            {isMobile && (
                <button
                    onClick={onToggleSidebar}
                    className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--sand-deep)]"
                >
                    <Menu size={17} />
                </button>
            )}

            {errorMessage && (
                <div className="absolute left-1/2 top-4 z-10 flex w-[min(90%,26rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3.5 py-2.5 text-[13px] text-[var(--destructive)]">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{errorMessage}</span>
                </div>
            )}

            <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center py-10">
                {hasText && (
                    <div
                        className={cn(
                            'mb-6 w-full text-center transition-opacity duration-300 ease-out',
                            fadingOut ? 'opacity-0' : 'opacity-100'
                        )}
                    >
                        <p
                            className={cn(
                                'text-[13px] leading-relaxed text-[var(--ink-faint)] transition-all duration-500 ease-out',
                                slot.topText
                                    ? 'mb-2 max-h-8 -translate-y-0 opacity-100'
                                    : 'mb-0 max-h-0 -translate-y-1 opacity-0'
                            )}
                        >
                            {slot.topText}
                        </p>
                        <p className="whitespace-pre-line text-[24px] font-semibold leading-snug text-[var(--ink)]">
                            {mainRevealed}
                            {isTyping && (
                                <span className="ml-0.5 inline-block h-5 w-[3px] animate-pulse bg-[var(--teal)] align-middle" />
                            )}
                        </p>
                        {currentTurn?.status === 'interrupted' && (
                            <p className="mt-1.5 text-[12.5px] italic text-[var(--ink-faint)]">Interrupted</p>
                        )}
                        {currentTurn?.status === 'error' && (
                            <p className="mt-1.5 text-[12.5px] text-[var(--destructive)]">
                                {currentTurn.errorDetail || 'Something went wrong'}
                            </p>
                        )}
                    </div>
                )}

                {/* The orb itself — connecting starts small and visibly
                    responsive, then grows into its normal breathing/reactive
                    size once the call is actually live (see the module docs
                    on .omni-voice-orb in globals.css for the per-state
                    animation tempo, and useVoiceSession's runOrbLoop for the
                    live audio-reactive scale/glow on top of it). */}
                <div
                    className={cn(
                        'flex items-center justify-center transition-[width,height] duration-500 ease-out',
                        connectionState === 'connecting' ? 'h-24 w-24' : 'h-44 w-44'
                    )}
                >
                    <div ref={orbRef} className={cn('omni-voice-orb h-full w-full', `omni-voice-orb--${visualState}`)} />
                </div>

                <div className="mt-5 flex items-center gap-1.5 text-[14px] font-medium text-[var(--teal)]">
                    <span>{statusLabel}</span>
                    {orbMode === 'thinking' && connected && (
                        <span className="omni-typing-dots">
                            <span />
                            <span />
                            <span />
                        </span>
                    )}
                </div>

                <div className="mt-9 flex items-center gap-4">
                    <button
                        onClick={handleCallButton}
                        className={cn(
                            'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
                            inCall
                                ? 'bg-[var(--destructive)] text-white hover:opacity-90'
                                : 'bg-[var(--teal)] text-[var(--paper)] hover:bg-[var(--teal-hover)]'
                        )}
                        title={inCall ? 'End call' : 'Reconnect'}
                    >
                        {inCall ? <X size={22} /> : <Phone size={20} />}
                    </button>
                    {connected && (
                        <button
                            onClick={toggleMute}
                            className={cn(
                                'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
                                muted
                                    ? 'bg-[var(--destructive)]/15 text-[var(--destructive)]'
                                    : 'bg-[var(--sand-deep)] text-[var(--ink)] hover:bg-[var(--sand)]'
                            )}
                            title={muted ? 'Unmute' : 'Mute microphone'}
                        >
                            {muted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
