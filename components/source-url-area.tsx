import { useState } from 'react'
import Image from 'next/image'
import { X, Link2 } from 'lucide-react'
import { SourceUrlEntry } from '@/hooks/useSourceUrls'

export interface SourceUrlAreaProps {
    urls: SourceUrlEntry[]
    onRemove: (id: string) => void
    className?: string
}

function hostAndPath(url: string): { host: string; path: string } {
    try {
        const parsed = new URL(url)
        return { host: parsed.hostname, path: parsed.pathname + parsed.search }
    } catch {
        return { host: url, path: '' }
    }
}

/**
 * Same chip anatomy as `FileUploadArea` (thumbnail box, name/subtext column,
 * remove button, same animate-in/fade-in) so a source-URL chip reads as the
 * same family of "thing attached to this turn" as an uploaded file. The one
 * deliberate divergence: a first-party (omniknows.xyz) URL swaps the generic
 * link icon for Omni's own brand mark and its label for "Following up on
 * this page" — signal that this is Omni re-reading its own content, not
 * fetching an external page, which is exactly the distinction a plain
 * file-style chip can't make.
 */
export function SourceUrlArea({ urls, onRemove, className = '' }: SourceUrlAreaProps) {
    const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

    if (!urls || urls.length === 0) return null

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
            {urls.map((entry) => {
                const isRemoving = removingIds.has(entry.id)
                const { host, path } = hostAndPath(entry.url)
                return (
                    <div
                        key={entry.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-1 ${isRemoving ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${entry.isFirstParty
                            ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--foreground)]'
                            : 'border-[var(--border-subtle)] bg-[var(--secondary)]/50 text-[var(--foreground)]'
                            }`}
                    >
                        <div className="shrink-0 relative w-8 h-8 rounded bg-[var(--background)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
                            {entry.isFirstParty ? (
                                <Image src="/android-chrome-512x512.png" alt="" width={18} height={18} className="rounded-[3px]" />
                            ) : (
                                <Link2 className="h-4 w-4 text-[var(--muted-foreground)]" />
                            )}
                        </div>

                        <div className="flex flex-col min-w-0 max-w-[150px] sm:max-w-[200px]">
                            <span className="truncate font-medium text-[13px]">
                                {entry.isFirstParty ? 'Following up on this page' : host}
                            </span>
                            <span className="truncate text-[11px] text-[var(--muted-foreground)]">
                                {entry.isFirstParty ? path || host : (path || '/')}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={() => handleRemove(entry.id)}
                            className="p-1 rounded-md shrink-0 transition-colors ml-1 hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Remove source"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
