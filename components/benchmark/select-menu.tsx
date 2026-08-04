'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { AnchoredPanel, useAnchoredPanel } from '@/components/benchmark/popover'
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

/**
 * The section's dropdown.
 *
 * Replaces the native `<select>`, which could only render one string per row —
 * and the useful thing to say about an option is usually two: an axis metric's
 * name plus which direction is better. `hint` is that second line.
 *
 * Positioning lives in `useAnchoredPanel`, shared with the filter menu.
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
    const panel = useAnchoredPanel(align)
    const { open, setOpen, triggerRef } = panel
    const [active, setActive] = useState(0)

    const current = options.find((o) => o.value === value)

    // Arrow-key movement is this component's own, not the shared panel's: a
    // listbox moves a cursor between options, while the filter menu next door
    // is a set of independent checkboxes with no cursor at all.
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
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
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, active, options, onChange, setOpen])

    return (
        <div className={cn('relative', className)}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                    setOpen(!open)
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

            <AnchoredPanel state={panel} ariaLabel={ariaLabel} role="listbox">
                {options.map((option, i) => {
                    const selected = option.value === value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => {
                                onChange(option.value)
                                setOpen(false)
                            }}
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
            </AnchoredPanel>
        </div>
    )
}
