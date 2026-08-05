'use client'

import { useCallback, useState, type ComponentType } from 'react'
import { ArrowUpRight, Bot, Check, ChevronDown, Copy, FileText } from 'lucide-react'
import { AnchoredPanel, useAnchoredPanel } from '@/components/benchmark/popover'
import { LLMS_TXT_URL, OMNI_CHAT_URL, benchRoutes } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

export interface LlmsTxtAction {
    key: string
    label: string
    icon: ComponentType<{ className?: string; strokeWidth?: number }>
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

    const omniHref =
        `${OMNI_CHAT_URL}/?q=` +
        encodeURIComponent(`Read from ${LLMS_TXT_URL} so I can ask questions about it.`)

    return [
        { key: 'copy', label: copied ? 'Copied' : 'Copy Page', icon: copied ? Check : Copy, onClick: copy },
        { key: 'view', label: 'llms.txt', icon: FileText, href: benchRoutes.llmsTxt(), external: true },
        { key: 'omni', label: 'Open in Omni', icon: Bot, href: omniHref, external: true },
    ]
}

/**
 * One row, usable both inside the desktop dropdown and inline in the mobile
 * sheet. An `href` action renders as a link and closes the menu on click,
 * since navigating away is the row doing its job; the copy action has no
 * `href` and stays open instead, because closing it would hide the checkmark
 * that is the only confirmation the click did anything.
 */
export function LlmsTxtActionRow({ action, onNavigate }: { action: LlmsTxtAction; onNavigate?: () => void }) {
    const Icon = action.icon
    const content = (
        <>
            <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--foreground)]">{action.label}</span>
            {action.external && (
                <ArrowUpRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.75} />
            )}
        </>
    )
    const className =
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--muted)] sm:px-2.5 sm:py-2'

    if (action.href) {
        return (
            <a
                href={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noopener noreferrer' : undefined}
                onClick={onNavigate}
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
 * The desktop control: a split button — the left half runs the default action
 * (copy), the right half opens the other two. Mirrors the "Copy page ▾"
 * pattern docs sites use for exactly this job (copy / view raw / hand to an
 * assistant), reusing `useAnchoredPanel` so it gets the same portal-and-sheet
 * behaviour already proven on the axis dropdown and the trait filter.
 */
export function CopyPageButton({ actions }: { actions: LlmsTxtAction[] }) {
    const panel = useAnchoredPanel('right')
    const { open, setOpen, triggerRef } = panel
    const primary = actions[0]
    const Icon = primary.icon

    return (
        <div className="flex shrink-0 items-stretch">
            <button
                type="button"
                onClick={primary.onClick}
                title="Copy every model's raw scores as Markdown"
                className="inline-flex items-center gap-1.5 rounded-l-lg border border-r-0 border-[var(--border-subtle)] bg-[var(--card)] px-2 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:border-[var(--accent)]/40 sm:px-2.5"
            >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">{primary.label}</span>
            </button>

            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="More ways to get this data"
                className={cn(
                    'inline-flex items-center rounded-r-lg border border-[var(--border-subtle)] bg-[var(--card)] px-1.5 py-1.5 transition-colors hover:border-[var(--accent)]/40',
                    open && 'border-[var(--accent)]'
                )}
            >
                <ChevronDown
                    className={cn(
                        'h-3.5 w-3.5 text-[var(--muted-foreground)] transition-transform',
                        open && 'rotate-180'
                    )}
                    strokeWidth={1.5}
                />
            </button>

            <AnchoredPanel state={panel} ariaLabel="Get this benchmark's data" role="menu">
                {actions.map((action) => (
                    <LlmsTxtActionRow key={action.key} action={action} onNavigate={() => setOpen(false)} />
                ))}
            </AnchoredPanel>
        </div>
    )
}
