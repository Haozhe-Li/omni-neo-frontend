'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
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
    /** Which edge the panel is anchored to. Right by default. */
    align?: 'left' | 'right'
    ariaLabel: string
    className?: string
}

/**
 * The section's dropdown.
 *
 * Replaces the native `<select>`, which had two problems. It renders an
 * unstyleable OS menu in the middle of a designed page — and more importantly
 * it can only show one string per row, when the useful thing to say about an
 * option is usually two: a run batch's name plus how many runs it holds, an
 * axis metric's name plus which direction is better. `hint` is that second line.
 *
 * Built here rather than on the app's Radix dropdown so that every file under
 * components/benchmark stays free of app-level imports — that is what lets this
 * whole directory be lifted into a standalone site in one move, and a dropdown
 * is not worth being the single import that breaks it. Nothing here needs a
 * library: it is a button, a list, and the keyboard contract for a listbox.
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
    const rootRef = useRef<HTMLDivElement>(null)
    const id = useId()

    const current = options.find((o) => o.value === value)

    useEffect(() => {
        if (!open) return

        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false)
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
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open, active, options, onChange])

    return (
        <div ref={rootRef} className={cn('relative', className)}>
            <button
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
                {prefix && (
                    <span className="shrink-0 text-[var(--muted-foreground)]">{prefix}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                    {current?.label ?? '—'}
                </span>
                <ChevronDown
                    className={cn(
                        'h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform',
                        open && 'rotate-180'
                    )}
                    strokeWidth={1.5}
                />
            </button>

            {open && (
                <div
                    role="listbox"
                    id={id}
                    aria-label={ariaLabel}
                    className={cn(
                        'absolute z-50 mt-1.5 max-h-[60vh] w-max min-w-full max-w-[80vw] overflow-y-auto',
                        'rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-1 shadow-lg',
                        'omni-rise',
                        // Anchored to an edge rather than centred: these sit at
                        // the end of a header row, and a panel wider than its
                        // trigger would otherwise hang off a phone screen.
                        align === 'right' ? 'right-0' : 'left-0'
                    )}
                    style={{ ['--rise-delay' as string]: '0ms' }}
                >
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
                                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                                    i === active ? 'bg-[var(--muted)]' : 'bg-transparent'
                                )}
                            >
                                <Check
                                    className={cn(
                                        'mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]',
                                        // Always laid out, only sometimes visible:
                                        // hiding it entirely would shift every label
                                        // sideways as the selection moves.
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
            )}
        </div>
    )
}
