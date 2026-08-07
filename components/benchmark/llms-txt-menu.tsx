'use client'

import { useCallback, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { ArrowUpRight, Check, ChevronDown, Copy, FileText } from 'lucide-react'
import { AnchoredPanel, useAnchoredPanel } from '@/components/benchmark/popover'
import { LLMS_TXT_URL, OMNI_CHAT_URL, benchRoutes } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

export interface LlmsTxtAction {
    key: string
    label: string
    /** Second line under the label — what the click actually does. */
    hint: string
    /**
     * A fully-built element, not a component reference — one of these four is
     * a raster image (Omni's own mark), which takes `src`/`width`/`height`
     * rather than a Lucide icon's `className`/`strokeWidth`, so there is no
     * single prop shape a shared renderer could pass through uniformly. Each
     * action builds its own icon at its own size and color; the row that
     * displays it only handles layout (see `LlmsTxtActionRow`).
     */
    icon: ReactNode
    onClick?: () => void
    href?: string
    external?: boolean
}

/**
 * The three ways to hand this benchmark off to something else, as one list —
 * shared by the desktop split button and the mobile menu so both read from
 * the same copy state instead of each keeping its own, which would let a copy
 * made from one show as "not copied" on the other.
 */
export function useLlmsTxtActions(): LlmsTxtAction[] {
    const [copied, setCopied] = useState(false)
    const [pending, setPending] = useState(false)

    const copy = useCallback(async () => {
        if (pending) return
        setPending(true)
        try {
            // This page's own llms.txt — same origin, whatever is actually on
            // screen (dev, staging, prod) — not the fixed production URL below.
            // "Copy" means "give me what I'm looking at"; only handing the URL
            // to a different service (Open in Omni) needs an address that
            // service can reach itself.
            const res = await fetch(benchRoutes.llmsTxt())
            const text = await res.text()
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // Fetch failed or the clipboard permission was denied — nothing to
            // recover into. The "llms.txt" row right below this one is the
            // fallback: open it and copy manually.
        } finally {
            setPending(false)
        }
    }, [pending])

    // `source_url` alone, no `q` and no `fill`: this hands the reader a
    // loaded starting point, it doesn't speak for them. `q` would run a
    // message immediately; `fill` used to type suggested prose into the box,
    // but the URL chip already says "this document is attached" far more
    // legibly than a sentence about it does — so the box is left empty for
    // the reader's own question. The chip queues LLMS_TXT_URL in the URL
    // picker (see hooks/useSourceUrls.ts) so the backend actually reads it
    // via first_party_redis_shortcut rather than relying on the model to
    // decide to fetch it.
    const omniHref = `${OMNI_CHAT_URL}/?source_url=${encodeURIComponent(LLMS_TXT_URL)}`

    // Kicks off a fresh render of llms.txt into the Redis mirror the agent
    // actually reads (see lib/llms-txt.ts) — fire-and-forget, must not delay
    // or block the navigation this click is really for. By the time the
    // reader lands on Omni's chat, reviews the pre-filled prompt and hits
    // send, this has almost always already landed; worst case the agent
    // reads a copy up to AGENT_LLMS_TXT_TTL_SECONDS old.
    const triggerAgentCacheRefresh = useCallback(() => {
        fetch('/api/benchmark/llms-txt/refresh', { method: 'POST' }).catch(() => {})
    }, [])

    const iconClass = 'h-3.5 w-3.5 text-[var(--muted-foreground)]'

    return [
        {
            key: 'copy',
            label: copied ? 'Copied' : 'Copy Page',
            hint: 'Markdown, copied to your clipboard',
            icon: copied ? (
                <Check className={iconClass} strokeWidth={1.5} />
            ) : (
                <Copy className={iconClass} strokeWidth={1.5} />
            ),
            onClick: copy,
        },
        {
            key: 'view',
            label: 'llms.txt',
            hint: 'The raw file, opened in a new tab',
            icon: <FileText className={iconClass} strokeWidth={1.5} />,
            href: benchRoutes.llmsTxt(),
            external: true,
        },
        {
            key: 'omni',
            label: 'Ask Omni',
            hint: 'Starts a chat with this data ready to ask about',
            // Omni's own mark, not a generic bot icon — this is the one action
            // that hands off to a different product entirely, and the brand
            // mark is what makes that legible at a glance rather than reading
            // as a fourth abstract icon among the others. Same asset the nav's
            // own BrandMark uses, so the two don't disagree on what "Omni"
            // looks like within one page.
            icon: (
                <Image
                    src="/android-chrome-512x512.png"
                    alt=""
                    width={14}
                    height={14}
                    className="rounded-[3px]"
                />
            ),
            onClick: triggerAgentCacheRefresh,
            href: omniHref,
            external: true,
        },
    ]
}

/**
 * One row, usable both inside the desktop dropdown and inline in the mobile
 * sheet. Deliberately the same anatomy as the option rows in `SelectMenu` and
 * `ModelFilter` — icon, then a two-line label-over-hint block — because a
 * reader who opens all three menus in this same header should feel one
 * design, not three similar-but-different ones: same `gap-2.5`, same
 * `hover:bg-[var(--muted)]`, same 12px label over 10px muted hint.
 *
 * An `href` action renders as a link and closes the menu on click, since
 * navigating away is the row doing its job; the copy action has no `href` and
 * stays open instead, because closing it would hide the checkmark that is the
 * only confirmation the click did anything.
 */
export function LlmsTxtActionRow({ action, onNavigate }: { action: LlmsTxtAction; onNavigate?: () => void }) {
    const content = (
        <>
            {/* Alignment is the row's job, not the icon's — see the note on
                `LlmsTxtAction.icon` for why each action builds its own icon
                rather than handing this a component to size uniformly. */}
            <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">{action.icon}</span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                    <span className="truncate text-[12px] text-[var(--foreground)]">{action.label}</span>
                    {action.external && (
                        <ArrowUpRight
                            className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]"
                            strokeWidth={1.75}
                        />
                    )}
                </span>
                <span className="block truncate text-[10px] text-[var(--muted-foreground)]">{action.hint}</span>
            </span>
        </>
    )
    const className =
        'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--muted)] sm:px-2.5 sm:py-2'

    if (action.href) {
        return (
            <a
                href={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noopener noreferrer' : undefined}
                onClick={() => {
                    // Both fire: the row's own side effect (e.g. the "Ask
                    // Omni" cache-refresh trigger), then the menu-close
                    // handler. Neither calls preventDefault, so the browser's
                    // own navigation to `href` proceeds unaffected.
                    action.onClick?.()
                    onNavigate?.()
                }}
                className={className}
            >
                {content}
            </a>
        )
    }
    return (
        <button type="button" onClick={action.onClick} className={className}>
            {content}
        </button>
    )
}

/**
 * The desktop control: a split button whose primary half is "Ask Omni" and
 * whose chevron opens the rest (Copy Page, raw llms.txt).
 *
 * Ask Omni leads because it is the one action here that is a destination
 * rather than a utility — it hands the whole benchmark to the product this
 * site is for, where Copy Page and llms.txt are plumbing for a reader who
 * already knows they want the raw numbers. Splitting rather than stacking
 * keeps that hierarchy in one control instead of two competing pills.
 *
 * Same solid `--foreground` fill and `rounded-[8px]` as the Pages detail
 * view's own Ask Omni button (components/pages-detail-view.tsx), so the
 * action looks identical wherever it appears; the secondary menus on both
 * surfaces are correspondingly subdued. Hover tint is derived from
 * `--background` rather than a fixed white/black overlay, which would be
 * invisible in one of the two themes. `focus-visible:ring-inset` is
 * load-bearing, not decorative: an outward ring would be clipped by this
 * container's own `overflow-hidden`.
 *
 * Desktop-only — the parent only mounts this at `sm` and up, and the mobile
 * menu renders all three actions as flat rows instead.
 */
export function AskOmniButton({ actions }: { actions: LlmsTxtAction[] }) {
    const panel = useAnchoredPanel('right')
    const { open, setOpen, triggerRef } = panel
    const omni = actions.find((a) => a.key === 'omni')
    const secondary = actions.filter((a) => a.key !== 'omni')
    if (!omni) return null

    const segment =
        'inline-flex items-center transition-colors hover:bg-[var(--background)]/15 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]'

    return (
        <div className="flex items-stretch overflow-hidden rounded-[8px] bg-[var(--foreground)] text-[var(--background)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <a
                href={omni.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={omni.onClick}
                title={omni.hint}
                className={cn(segment, 'gap-1.5 px-3 py-1.5 text-[12px] font-medium')}
            >
                {omni.icon}
                {omni.label}
            </a>

            <span aria-hidden className="w-px shrink-0 self-stretch bg-[var(--background)]/25" />

            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="More ways to get this data"
                className={cn(segment, 'px-1.5', open && 'bg-[var(--background)]/15')}
            >
                <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
                    strokeWidth={2}
                />
            </button>

            <AnchoredPanel state={panel} ariaLabel="Get this benchmark's data" role="menu">
                {secondary.map((action) => (
                    <LlmsTxtActionRow key={action.key} action={action} onNavigate={() => setOpen(false)} />
                ))}
            </AnchoredPanel>
        </div>
    )
}
