'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
    value: string
    label: string
    /** Second line under the label — the reason to pick this one. */
    hint?: string
}

interface SelectMenuProps {
    value: string
    onChange: (value: string) => void
    options: SelectOption[]
    /** Small muted text inside the trigger, before the value (e.g. "X"). */
    prefix?: string
    /** Icon rendered at the start of the trigger. */
    leading?: ReactNode
    /** Which edge of the trigger the panel hangs from, on desktop. */
    align?: 'left' | 'right'
    ariaLabel: string
    className?: string
}

/** Keep the panel this far from the edge of the window. */
const VIEWPORT_MARGIN = 12
/** Matches Tailwind's `sm`. Below it the panel becomes a sheet. */
const SM = 640

/**
 * The section's dropdown.
 *
 * Replaces the native `<select>`, which could only render one string per row —
 * and the useful thing to say about an option is usually two: a run batch's
 * name plus how many runs it holds, an axis metric's name plus which direction
 * is better. `hint` is that second line.
 *
 * The panel renders in a portal and positions itself against the viewport,
 * rather than being an absolutely-positioned child of the trigger. That is not
 * over-engineering; an in-flow panel broke twice here for two different
 * reasons. It was clipped by an `overflow-x-auto` toolbar, and — because the
 * chart cards are wrapped in `.omni-rise`, whose animation leaves a `transform`
 * on the element — even `position: fixed` would have resolved against that
 * wrapper instead of the window. Portalling sidesteps both: no ancestor can
 * clip it and no ancestor can capture it.
 *
 * Built here rather than on the app's Radix dropdown so every file under
 * components/benchmark stays free of app-level imports, which is what lets this
 * directory be lifted into a standalone site in one move.
 */
export function SelectMenu({
    value,
    onChange,
    options,
    prefix,
    leading,
    align = 'right',
    ariaLabel,
    className,
}: SelectMenuProps) {
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(0)
    const [mounted, setMounted] = useState(false)
    const [anchor, setAnchor] = useState<{ sheet: boolean; style: React.CSSProperties } | null>(null)

    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const id = useId()

    const current = options.find((o) => o.value === value)

    // Portals need a DOM to attach to, so nothing renders on the server pass.
    useEffect(() => setMounted(true), [])

    /**
     * Where the panel goes, measured from the trigger.
     *
     * Below `sm` it is a sheet pinned to the bottom of the window — an anchored
     * panel cannot be made safe at that width, because it is positioned against
     * the trigger but sized by its own content, so a trigger on the left of a
     * narrow screen sends a right-aligned panel off the left edge. Above `sm`
     * it hangs under the trigger, with `max-width` set from the distance to the
     * far edge so it can never cross it.
     */
    const place = useCallback(() => {
        const el = triggerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const vw = window.innerWidth

        if (vw < SM) {
            setAnchor({ sheet: true, style: {} })
            return
        }

        const top = r.bottom + 6
        setAnchor({
            sheet: false,
            style:
                align === 'right'
                    ? {
                          top,
                          right: Math.max(vw - r.right, VIEWPORT_MARGIN),
                          minWidth: r.width,
                          maxWidth: Math.max(r.right - VIEWPORT_MARGIN, 160),
                      }
                    : {
                          top,
                          left: Math.max(r.left, VIEWPORT_MARGIN),
                          minWidth: r.width,
                          maxWidth: Math.max(vw - r.left - VIEWPORT_MARGIN, 160),
                      },
        })
    }, [align])

    useEffect(() => {
        if (!open) return
        place()

        const onDown = (e: MouseEvent) => {
            const t = e.target as Node
            // The panel is portalled, so it is not inside the trigger's subtree
            // — both have to be checked or picking an option would count as an
            // outside click and unmount the option before it fires.
            if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
            setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false)
                triggerRef.current?.focus()
                return
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => {
                    const next = e.key === 'ArrowDown' ? i + 1 : i - 1
                    return (next + options.length) % options.length
                })
                return
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                const picked = options[active]
                if (picked) onChange(picked.value)
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        // Follow the trigger rather than freezing at the position it had when
        // opened: `true` catches scrolling in any container, not just the page.
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [open, active, options, onChange, place])

    const choose = (next: string) => {
        onChange(next)
        setOpen(false)
    }

    const panel = anchor && (
        <>
            {/* Backdrop for the sheet only, and the tap that dismisses it —
                reaching the trigger again is awkward once the sheet covers the
                bottom of the screen. */}
            {anchor.sheet && (
                <div
                    className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
                    onClick={() => setOpen(false)}
                    aria-hidden
                />
            )}

            <div
                ref={panelRef}
                role="listbox"
                id={id}
                aria-label={ariaLabel}
                style={anchor.style}
                className={cn(
                    'omni-rise fixed z-50 overflow-y-auto border border-[var(--border-subtle)]',
                    'bg-[var(--card)] p-1 shadow-lg',
                    anchor.sheet
                        ? 'inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl pb-[max(0.5rem,env(safe-area-inset-bottom))]'
                        : 'max-h-[60vh] rounded-xl'
                )}
            >
                {anchor.sheet && (
                    // On a phone the trigger is behind the backdrop, so without
                    // this the list has nothing naming it.
                    <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2">
                        <span className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                            {ariaLabel}
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-md p-1 text-[var(--muted-foreground)]"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                    </div>
                )}

                {options.map((option, i) => {
                    const selected = option.value === value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => choose(option.value)}
                            className={cn(
                                // Roomier rows in the sheet, where these are tap
                                // targets rather than hover targets.
                                'flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                                'sm:px-2.5 sm:py-2',
                                i === active ? 'bg-[var(--muted)]' : 'bg-transparent'
                            )}
                        >
                            <Check
                                className={cn(
                                    'mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]',
                                    // Always laid out, only sometimes visible:
                                    // hiding it would shift every label sideways
                                    // as the selection moves.
                                    selected ? 'opacity-100' : 'opacity-0'
                                )}
                                strokeWidth={2.5}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] text-[var(--foreground)]">
                                    {option.label}
                                </span>
                                {option.hint && (
                                    <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                                        {option.hint}
                                    </span>
                                )}
                            </span>
                        </button>
                    )
                })}
            </div>
        </>
    )

    return (
        <div className={cn('relative', className)}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                    setOpen((v) => !v)
                    // Open with the current choice under the keyboard cursor, so
                    // one arrow press moves from where you are, not from the top.
                    setActive(Math.max(options.findIndex((o) => o.value === value), 0))
                }}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                className={cn(
                    'inline-flex w-full max-w-full items-center gap-2 rounded-lg border bg-[var(--card)]',
                    'px-2.5 py-1.5 text-[12px] transition-colors',
                    open
                        ? 'border-[var(--accent)] text-[var(--foreground)]'
                        : 'border-[var(--border-subtle)] text-[var(--foreground)] hover:border-[var(--accent)]/40'
                )}
            >
                {leading}
                {prefix && <span className="shrink-0 text-[var(--muted-foreground)]">{prefix}</span>}
                <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? '—'}</span>
                <ChevronDown
                    className={cn(
                        'h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform',
                        open && 'rotate-180'
                    )}
                    strokeWidth={1.5}
                />
            </button>

            {open && mounted && panel && createPortal(panel, document.body)}
        </div>
    )
}
