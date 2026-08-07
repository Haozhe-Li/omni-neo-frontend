'use client'

import { useState } from 'react'
import { X, Plus as PlusIcon, Link2 } from 'lucide-react'
import { MAX_SOURCE_URLS, normalizeUrl } from '@/hooks/useSourceUrls'

export interface AddUrlPopoverProps {
    /** How many source URLs are already attached to this turn — bounds how many rows this popover can add. */
    existingCount: number
    onAdd: (urls: string[]) => void
    onClose: () => void
    className?: string
}

/**
 * The panel behind the + menu's "Add URL" row. Anatomy mirrors the + menu
 * dropdown it replaces (same card/border/shadow, same anchor point) so it
 * doesn't read as a foreign popup — see search-home.tsx / chat-view.tsx for
 * where this is mounted.
 */
export function AddUrlPopover({ existingCount, onAdd, onClose, className = '' }: AddUrlPopoverProps) {
    const remaining = Math.max(0, MAX_SOURCE_URLS - existingCount)
    const [rows, setRows] = useState<string[]>(() =>
        Array.from({ length: Math.max(1, Math.min(remaining, 3)) }, () => '')
    )

    const updateRow = (i: number, value: string) => {
        setRows((prev) => {
            // A paste of several lines into one row splits across rows instead
            // of being treated as one (invalid) URL containing newlines.
            const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
            if (lines.length > 1) {
                const next = [...prev]
                next.splice(i, 1, ...lines)
                return next.slice(0, Math.max(remaining, next.length > remaining ? remaining : next.length))
            }
            const next = [...prev]
            next[i] = value
            return next
        })
    }

    const addRow = () => setRows((prev) => (prev.length < remaining ? [...prev, ''] : prev))
    const removeRow = (i: number) => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))

    const validCount = rows.filter((r) => normalizeUrl(r)).length

    const handleConfirm = () => {
        const urls = rows.map((r) => r.trim()).filter(Boolean)
        if (urls.length) onAdd(urls)
        onClose()
    }

    if (remaining === 0) {
        return (
            <div className={`p-4 text-sm text-[var(--muted-foreground)] ${className}`}>
                You&apos;ve reached the limit of {MAX_SOURCE_URLS} URLs for this turn.
            </div>
        )
    }

    return (
        <div className={`p-3 ${className}`}>
            <div className="px-1 pb-2">
                <span className="block text-sm font-medium text-[var(--foreground)]">Add URL</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                    Up to {MAX_SOURCE_URLS} pages Omni should prioritize reading
                </span>
            </div>

            <div className="flex flex-col gap-1.5">
                {rows.map((row, i) => {
                    const isInvalid = row.trim().length > 0 && !normalizeUrl(row)
                    return (
                        <div key={i} className="flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
                            <input
                                type="text"
                                value={row}
                                onChange={(e) => updateRow(i, e.target.value)}
                                placeholder="https://example.com/article"
                                className={`flex-1 min-w-0 bg-transparent text-sm px-2 py-1.5 rounded-md border outline-none ${
                                    isInvalid
                                        ? 'border-destructive/50'
                                        : 'border-[var(--border-subtle)] focus:border-[var(--accent)]/50'
                                }`}
                            />
                            {rows.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeRow(i)}
                                    className="p-1 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
                <button
                    type="button"
                    onClick={addRow}
                    disabled={rows.length >= remaining}
                    className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <PlusIcon className="h-3 w-3" /> Add another
                </button>
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={validCount === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] text-[var(--accent-foreground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Add{validCount > 0 ? ` (${validCount})` : ''}
                </button>
            </div>
        </div>
    )
}
