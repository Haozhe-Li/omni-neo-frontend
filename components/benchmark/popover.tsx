'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Keep the panel this far from the edge of the window. */
const VIEWPORT_MARGIN = 12
/** Matches Tailwind's `sm`. Below it the panel becomes a sheet. */
const SM = 640

/**
 * A panel that hangs off a trigger without any ancestor being able to break it.
 *
 * Shared by the dropdown and the filter rather than written twice, because the
 * positioning here is not obvious and got two bugs' worth of attention. An
 * in-flow panel was clipped by an `overflow-x-auto` toolbar; and because the
 * chart cards are wrapped in `.omni-rise`, whose animation leaves a `transform`
 * behind, even `position: fixed` would have resolved against that wrapper
 * rather than the window. Portalling out and measuring the trigger sidesteps
 * both — no ancestor can clip it, none can capture it.
 *
 * Below `sm` it becomes a sheet pinned to the bottom of the window. An anchored
 * panel cannot be made safe at that width: it is positioned against the trigger
 * but sized by its own content, so a trigger on the left of a narrow screen
 * sends a right-aligned panel off the left edge.
 */
export interface AnchoredState {
    open: boolean
    setOpen: (open: boolean) => void
    triggerRef: React.RefObject<HTMLButtonElement | null>
    panelRef: React.RefObject<HTMLDivElement | null>
    anchor: { sheet: boolean; style: React.CSSProperties } | null
    mounted: boolean
}

export function useAnchoredPanel(align: 'left' | 'right' = 'right'): AnchoredState {
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [anchor, setAnchor] = useState<AnchoredState['anchor']>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Portals need a DOM to attach to, so nothing renders on the server pass.
    useEffect(() => setMounted(true), [])

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
                          // Bounded by the distance to the far edge, so the
                          // panel can never cross it however wide it wants to be.
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
            // — both have to be checked, or clicking a control inside the panel
            // would count as an outside click and unmount it before it fired.
            if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
            setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false)
                triggerRef.current?.focus()
            }
        }

        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        // `true` catches scrolling in any container, not just the page, so the
        // panel follows its trigger instead of freezing where it opened.
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [open, place])

    return { open, setOpen, triggerRef, panelRef, anchor, mounted }
}

export function AnchoredPanel({
    state,
    ariaLabel,
    role,
    children,
}: {
    state: AnchoredState
    ariaLabel: string
    role?: string
    children: ReactNode
}) {
    const { open, setOpen, anchor, panelRef, mounted } = state
    if (!open || !mounted || !anchor) return null

    return createPortal(
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
                role={role}
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
                    // On a phone the trigger sits behind the backdrop, so
                    // without this the panel has nothing naming it.
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
                {children}
            </div>
        </>,
        document.body
    )
}
