import { useState } from 'react'
import { X, ClipboardPaste } from 'lucide-react'
import type { PastedItem } from '@/hooks/usePastedContent'
import { describePaste } from '@/lib/pasted-content'

export interface PastedContentAreaProps {
    items: PastedItem[]
    onRemove: (id: string) => void
    className?: string
}

/**
 * Same chip anatomy as `FileUploadArea` / `SourceUrlArea`, so a pasted block
 * reads as one more "thing attached to this turn". The tooltip carries the
 * first lines of the text so a chip can still be told apart from its siblings.
 */
export function PastedContentArea({ items, onRemove, className = '' }: PastedContentAreaProps) {
    const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

    if (!items || items.length === 0) return null

    const handleRemove = (id: string) => {
        setRemovingIds((prev) => new Set(prev).add(id))
        setTimeout(() => {
            onRemove(id)
            setRemovingIds((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        }, 180)
    }

    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            {items.map((item) => {
                const { label, detail } = describePaste(item.text)
                return (
                    <div
                        key={item.id}
                        title={item.text.slice(0, 240)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/50 text-sm text-[var(--foreground)] transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-1 ${removingIds.has(item.id) ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                    >
                        <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded bg-[var(--background)] border border-[var(--border-subtle)]">
                            <ClipboardPaste className="h-4 w-4 text-[var(--muted-foreground)]" />
                        </div>
                        <div className="flex flex-col min-w-0 max-w-[150px] sm:max-w-[200px]">
                            <span className="truncate font-medium text-[13px]">{label}</span>
                            <span className="truncate text-[11px] text-[var(--muted-foreground)]">{detail}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleRemove(item.id)}
                            className="p-1 rounded-md shrink-0 transition-colors ml-1 hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Remove pasted text"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
