'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Layers } from 'lucide-react'
import { useBenchmarkData } from '@/components/benchmark/benchmark-provider'
import { fmtDate } from '@/lib/benchmark'
import { cn } from '@/lib/utils'

/**
 * Which run batch the page is showing.
 *
 * Hand-built rather than a native `<select>` or the app's Radix dropdown, for
 * two different reasons.
 *
 * A native select can only render a string per row, and the string is the least
 * useful part: `nightly-2026-08` does not say whether that batch was a full
 * matrix or a two-model smoke test, which is the actual question when you pick
 * one. Each row here carries its run count and when it last ran. It also cannot
 * be styled — the screenshot that prompted this was a system menu dropped into
 * the middle of a designed page.
 *
 * And it avoids `components/ui/*` on purpose: every other file under
 * components/benchmark is free of app-level imports, which is what makes this
 * section liftable into a standalone site in one move. A dropdown is not worth
 * being the single import that breaks that.
 */
export function BatchSelect() {
    const { batches, label, setLabel } = useBenchmarkData()
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
    const [active, setActive] = useState(0)

    // Every batch, plus the "no filter" row, as one list so keyboard movement
    // and the rendering loop agree on what index means.
    const options = [{ label: '', runs: 0, latest: '' }, ...batches]
    const current = batches.find((b) => b.label === label)

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
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                setLabel(options[active]?.label ?? '')
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open, active, options, setLabel])

    // Nothing to filter by — one batch is the same as no batches.
    if (batches.length === 0) return null

    const choose = (value: string) => {
        setLabel(value)
        setOpen(false)
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => {
                    setOpen((v) => !v)
                    setActive(Math.max(options.findIndex((o) => o.label === label), 0))
                }}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={cn(
                    'inline-flex max-w-[70vw] items-center gap-2 rounded-lg border bg-[var(--card)]',
                    'px-2.5 py-1.5 text-[12px] transition-colors sm:max-w-none',
                    open
                        ? 'border-[var(--accent)] text-[var(--foreground)]'
                        : 'border-[var(--border-subtle)] text-[var(--foreground)] hover:border-[var(--accent)]/40'
                )}
            >
                <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <span className="truncate">{current ? current.label : 'All run batches'}</span>
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
                    aria-label="Run batch"
                    // Right-aligned: this sits at the right edge of a page
                    // header, and a left-aligned panel would hang off screen on
                    // a phone.
                    className={cn(
                        'absolute right-0 z-50 mt-1.5 max-h-[60vh] w-[min(19rem,80vw)] overflow-y-auto',
                        'rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-1 shadow-lg',
                        'omni-rise'
                    )}
                    style={{ ['--rise-delay' as string]: '0ms' }}
                >
                    {options.map((option, i) => {
                        const selected = option.label === label
                        const all = option.label === ''
                        return (
                            <button
                                key={option.label || '__all__'}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => choose(option.label)}
                                className={cn(
                                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                                    i === active ? 'bg-[var(--muted)]' : 'bg-transparent'
                                )}
                            >
                                <Check
                                    className={cn(
                                        'mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]',
                                        selected ? 'opacity-100' : 'opacity-0'
                                    )}
                                    strokeWidth={2.5}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12px] text-[var(--foreground)]">
                                        {all ? 'All run batches' : option.label}
                                    </span>
                                    <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                                        {all ? (
                                            <>
                                                Every run ever recorded — the newest per model wins
                                            </>
                                        ) : (
                                            <>
                                                {option.runs} run{option.runs === 1 ? '' : 's'} ·{' '}
                                                {fmtDate(option.latest)}
                                            </>
                                        )}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
