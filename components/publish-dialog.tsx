'use client'

import React, { useEffect, useState } from 'react'
import { X, Clock, Calendar, Infinity, Globe, Check, Loader2, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { PublishDuration, Source } from '@/lib/types'

interface PublishDialogProps {
    isOpen: boolean
    onClose: () => void
    title: string
    content: string
    /** Sources referenced by `[n]` in `content` — carried along so the published page can render citation badges instead of bare bracket numbers. */
    sources?: Source[]
    /**
     * Overrides what /api/publish hashes into the page id — by default it's
     * `userId:title`, so re-sharing two different reports that happen to get
     * the same title (e.g. two scheduled runs on the same recurring topic)
     * would silently overwrite each other's published page. Pass something
     * unique to the source content (e.g. `schedule:{run_id}`) when the caller
     * isn't the single-artifact-per-title chat share flow this defaulted for.
     */
    idSeed?: string
}

type Phase = 'checking' | 'form' | 'publishing' | 'done'

const DURATIONS: { id: PublishDuration; label: string; desc: string; icon: React.ReactNode }[] = [
    { id: '7d', label: '7 Days', desc: 'Link expires in 1 week', icon: <Clock className="w-4 h-4" /> },
    { id: '30d', label: '1 Month', desc: 'Link expires in 30 days', icon: <Calendar className="w-4 h-4" /> },
    { id: 'permanent', label: 'Permanent', desc: 'Link never expires', icon: <Infinity className="w-4 h-4" /> },
]

export function PublishDialog({ isOpen, onClose, title, content, sources, idSeed }: PublishDialogProps) {
    const [phase, setPhase] = useState<Phase>('checking')
    const [duration, setDuration] = useState<PublishDuration>('7d')
    const [publishToPages, setPublishToPages] = useState(true)
    const [shareUrl, setShareUrl] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    // Opening the dialog always starts by asking whether this exact report
    // was already published, so a re-share of the same title lands straight
    // on the "here's your link" view instead of the duration/visibility form.
    useEffect(() => {
        if (!isOpen) return
        let cancelled = false
        setPhase('checking')
        setShareUrl(null)
        setCopied(false)
        ;(async () => {
            try {
                const res = await fetch('/api/publish', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, idSeed, checkOnly: true }),
                })
                if (!cancelled && res.ok) {
                    const { id, exists } = await res.json()
                    if (exists) {
                        setShareUrl(`${window.location.origin}/pages/${id}`)
                        setPhase('done')
                        return
                    }
                }
            } catch (e) {
                console.error('Check share status failed', e)
            }
            if (!cancelled) setPhase('form')
        })()
        return () => {
            cancelled = true
        }
    }, [isOpen, title, idSeed])

    if (!isOpen) return null

    const copyUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {}
    }

    const handlePublish = async () => {
        setPhase('publishing')
        try {
            const res = await fetch('/api/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, idSeed, answer: content, duration, publishToPages, forceUpdate: true, sources }),
            })
            if (!res.ok) throw new Error('publish failed')
            const { id } = await res.json()
            const url = `${window.location.origin}/pages/${id}`
            setShareUrl(url)
            await copyUrl(url)
            toast.success('Published — link copied')
            setPhase('done')
        } catch (e) {
            console.error('Publish failed', e)
            toast.error('Failed to publish to Pages')
            setPhase('form')
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[var(--scrim)] animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-[420px] bg-background border border-border rounded-xl overflow-hidden animate-in zoom-in-95 fade-in duration-200 ease-out shadow-lg">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center">
                            <Globe className="w-4 h-4 text-accent" />
                        </div>
                        <div>
                            <h3 className="omni-display text-[22px] leading-tight text-[var(--ink)]">Share report</h3>
                            <p className="text-[12px] text-muted-foreground">
                                {phase === 'done' ? 'Your link is ready' : 'Share your research'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {phase === 'checking' ? (
                    <div className="flex items-center justify-center py-14">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : phase === 'done' && shareUrl ? (
                    <div className="p-5 space-y-4">
                        {title && (
                            <div className="px-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60">
                                <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Report</span>
                                <span className="block text-sm text-foreground font-medium truncate">{title}</span>
                            </div>
                        )}
                        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-[12px] font-mono break-all leading-relaxed text-foreground">
                            {shareUrl}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={() => copyUrl(shareUrl)}
                                variant="outline"
                                className="flex-1 h-9 rounded-lg text-[13px]"
                            >
                                {copied ? <Check className="text-[var(--teal)]" /> : <Copy className="opacity-70" />}
                                {copied ? 'Copied' : 'Copy link'}
                            </Button>
                            <Button
                                onClick={() => window.open(shareUrl, '_blank')}
                                variant="outline"
                                className="flex-1 h-9 rounded-lg text-[13px]"
                            >
                                <ExternalLink className="opacity-70" />
                                Open
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Content */}
                        <div className="p-5 space-y-4">
                            {/* Report title preview */}
                            {title && (
                                <div className="px-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60">
                                    <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Report</span>
                                    <span className="block text-sm text-foreground font-medium truncate">{title}</span>
                                </div>
                            )}

                            {/* Duration picker */}
                            <div className="space-y-2">
                                <span className="block text-[12px] font-medium text-muted-foreground">Link duration</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {DURATIONS.map((opt) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setDuration(opt.id)}
                                            className={`
                                                relative flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all duration-150
                                                ${duration === opt.id
                                                    ? 'border-accent bg-accent/[0.07] text-foreground'
                                                    : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:bg-muted/40 hover:text-foreground'
                                                }
                                            `}
                                        >
                                            <span className={`p-1.5 rounded-md transition-colors ${duration === opt.id ? 'bg-accent text-[var(--accent-foreground)]' : 'bg-muted text-muted-foreground'}`}>
                                                {opt.icon}
                                            </span>
                                            <span className="text-[12px] font-semibold leading-tight">{opt.label}</span>
                                            <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                                            {duration === opt.id && (
                                                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                                                    <Check className="h-2.5 w-2.5 text-[var(--accent-foreground)]" strokeWidth={3} />
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Visibility — the only place this decision is made, so nothing
                                elsewhere in the dialog can end up asserting the opposite of
                                whatever the person picks here. */}
                            <label className="flex items-start gap-2.5 cursor-pointer group px-3 py-2.5 rounded-lg border border-border/60 bg-secondary/20">
                                <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={publishToPages}
                                        onChange={(e) => setPublishToPages(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-4 h-4 rounded border border-border bg-background peer-checked:bg-accent peer-checked:border-accent transition-colors"></div>
                                    <Check className="absolute inset-0 m-auto h-3 w-3 text-[var(--accent-foreground)] opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
                                </div>
                                <span>
                                    <span className="block text-[13px] font-medium text-foreground group-hover:text-foreground/80 transition-colors">
                                        List on Pages home
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                                        {publishToPages
                                            ? 'Public — shown on the Pages feed under your name.'
                                            : 'Unlisted — only people with the link can open it.'}
                                    </span>
                                </span>
                            </label>
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-5">
                            <Button
                                onClick={handlePublish}
                                disabled={phase === 'publishing'}
                                className="h-10 w-full rounded-full bg-[var(--teal)] text-sm text-[var(--accent-foreground)] transition-colors hover:bg-[var(--teal-hover)]"
                            >
                                {phase === 'publishing' ? <Loader2 className="animate-spin" /> : 'Publish & Copy Link'}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
