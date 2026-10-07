'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { X, Link2, Check, Loader2, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useApi } from '@/hooks/useApi'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

interface ShareThreadDialogProps {
    isOpen: boolean
    onClose: () => void
    threadId: string
    title: string
}

interface SharedLink {
    share_id: string
    title: string | null
    n_messages: number
    created_at: string
}

type Phase = 'form' | 'creating' | 'done'

const linkFor = (shareId: string) => `${window.location.origin}/s/${shareId}`

async function errorDetail(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.json()
        if (typeof body?.detail === 'string') return body.detail
    } catch {}
    return fallback
}

/**
 * Share this conversation by link — a frozen snapshot of the thread, not a live
 * view. Every "Create link" makes a new link; old ones stay valid until revoked
 * here. The sharer's saved memory and location are stripped server-side; what
 * is NOT stripped (attachments included) is spelled out below, because the
 * person pressing the button is the only one who can decide that.
 */
export function ShareThreadDialog({ isOpen, onClose, threadId, title }: ShareThreadDialogProps) {
    const { fetchWithAuth } = useApi()
    const [phase, setPhase] = useState<Phase>('form')
    const [shareUrl, setShareUrl] = useState<string | null>(null)
    const [copied, setCopied] = useState<string | null>(null)
    const [links, setLinks] = useState<SharedLink[]>([])
    const [revoking, setRevoking] = useState<string | null>(null)

    const loadLinks = useCallback(async () => {
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/api/shares`)
            if (res.ok) setLinks((await res.json()).shares ?? [])
        } catch (e) {
            console.error('Load shared links failed', e)
        }
    }, [fetchWithAuth])

    useEffect(() => {
        if (!isOpen) return
        setPhase('form')
        setShareUrl(null)
        setCopied(null)
        loadLinks()
    }, [isOpen, loadLinks])

    if (!isOpen) return null

    const copy = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(url)
            setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
        } catch {}
    }

    const create = async () => {
        setPhase('creating')
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/share`, { method: 'POST' })
            if (!res.ok) {
                toast.error(await errorDetail(res, 'Couldn’t create a link'))
                setPhase('form')
                return
            }
            const { share_id } = await res.json()
            const url = linkFor(share_id)
            setShareUrl(url)
            // Best-effort and not awaited: the clipboard API can stall (a pending
            // permission prompt, an unfocused window), and the link must show
            // either way — it is on screen with its own Copy button.
            void copy(url)
            toast.success('Link created')
            setPhase('done')
            loadLinks()
        } catch (e) {
            console.error('Create share failed', e)
            toast.error('Couldn’t create a link')
            setPhase('form')
        }
    }

    const revoke = async (shareId: string) => {
        setRevoking(shareId)
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/api/shares/${shareId}`, { method: 'DELETE' })
            if (!res.ok) {
                toast.error(await errorDetail(res, 'Couldn’t revoke that link'))
                return
            }
            setLinks((prev) => prev.filter((l) => l.share_id !== shareId))
            if (shareUrl && shareUrl.endsWith(`/${shareId}`)) {
                setShareUrl(null)
                setPhase('form')
            }
            toast.success('Link revoked')
        } catch {
            toast.error('Couldn’t revoke that link')
        } finally {
            setRevoking(null)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-[var(--scrim)] animate-in fade-in duration-200" onClick={onClose} />

            <div className="relative flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg animate-in zoom-in-95 fade-in duration-200 ease-out">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
                            <Link2 className="h-4 w-4 text-accent" />
                        </div>
                        <div>
                            <h3 className="omni-display text-[22px] leading-tight text-[var(--ink)]">Share conversation</h3>
                            <p className="text-[12px] text-muted-foreground">
                                {phase === 'done' ? 'Your link is ready' : 'Anyone with the link can read it'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-4 overflow-y-auto p-5">
                    {phase === 'done' && shareUrl ? (
                        <>
                            <div className="break-all rounded-lg border border-border bg-secondary/30 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-foreground">
                                {shareUrl}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button onClick={() => copy(shareUrl)} variant="outline" className="h-9 flex-1 rounded-lg text-[13px]">
                                    {copied === shareUrl ? <Check className="text-[var(--teal)]" /> : <Copy className="opacity-70" />}
                                    {copied === shareUrl ? 'Copied' : 'Copy link'}
                                </Button>
                                <Button onClick={() => window.open(shareUrl, '_blank')} variant="outline" className="h-9 flex-1 rounded-lg text-[13px]">
                                    <ExternalLink className="opacity-70" />
                                    Open
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            {title && (
                                <div className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5">
                                    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Conversation</span>
                                    <span className="block truncate text-sm font-medium text-foreground">{title}</span>
                                </div>
                            )}
                            <ul className="space-y-2 text-[12.5px] leading-snug text-muted-foreground">
                                <li>
                                    <span className="text-foreground">Everything in it is shared</span>, including files and images you attached.
                                </li>
                                <li>Your saved memory and your location are removed.</li>
                                <li>
                                    It’s a snapshot of right now. Later messages aren’t included, and deleting this conversation
                                    <span className="text-foreground"> doesn’t remove the link</span> — you can revoke links from this dialog.
                                </li>
                                <li>Anyone who continues it gets their own private copy. Yours stays as it is.</li>
                            </ul>
                            <Button
                                onClick={create}
                                disabled={phase === 'creating'}
                                className="h-10 w-full rounded-full bg-[var(--teal)] text-sm text-[var(--accent-foreground)] transition-colors hover:bg-[var(--teal-hover)]"
                            >
                                {phase === 'creating' ? <Loader2 className="animate-spin" /> : 'Create link & copy'}
                            </Button>
                        </>
                    )}

                    {links.length > 0 && (
                        <div className="space-y-2 border-t border-border pt-4">
                            <span className="block text-[12px] font-medium text-muted-foreground">Your shared links</span>
                            <ul className="space-y-1.5">
                                {links.map((l) => {
                                    const url = linkFor(l.share_id)
                                    return (
                                        <li key={l.share_id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2">
                                            <div className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] text-foreground">{l.title || 'Untitled conversation'}</span>
                                                <span className="block text-[11px] text-muted-foreground">
                                                    {new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    {' · '}
                                                    {Math.ceil(l.n_messages / 2)} {Math.ceil(l.n_messages / 2) === 1 ? 'turn' : 'turns'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => copy(url)}
                                                title="Copy link"
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                            >
                                                {copied === url ? <Check className="h-3.5 w-3.5 text-[var(--teal)]" /> : <Copy className="h-3.5 w-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => revoke(l.share_id)}
                                                disabled={revoking === l.share_id}
                                                title="Revoke link"
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50"
                                            >
                                                {revoking === l.share_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
