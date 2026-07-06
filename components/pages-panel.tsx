'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, Loader2, Search, ArrowUpDown, X } from 'lucide-react'
import { MarkdownMessage } from '@/components/markdown-message'
import { SourceItem } from '@/components/source-item'
import { PagesGrid, PagesHero, type PageSummary } from '@/components/pages-grid'
import type { Source } from '@/lib/types'

interface PageDetail extends PageSummary {
    tags?: string[]
    sources?: Source[]
}

function PagesList({ onOpen }: { onOpen: (id: string) => void }) {
    const [pages, setPages] = useState<PageSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        fetch('/api/pages')
            .then((res) => res.json())
            .then((data) => { if (!cancelled) setPages(Array.isArray(data.pages) ? data.pages : []) })
            .catch(() => { if (!cancelled) setPages([]) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [])

    const filteredAndSorted = useMemo(() => {
        let result = pages.filter((p) => p.publishToPages !== false)
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            result = result.filter((p) =>
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.answer && p.answer.toLowerCase().includes(q)) ||
                (p.authorName && p.authorName.toLowerCase().includes(q))
            )
        }
        result = [...result].sort((a, b) => {
            const dateA = new Date(a.publishedAt || a.created_at || 0).getTime()
            const dateB = new Date(b.publishedAt || b.created_at || 0).getTime()
            return sortBy === 'newest' ? dateB - dateA : dateA - dateB
        })
        return result
    }, [pages, searchQuery, sortBy])

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 max-w-6xl mx-auto w-full">
            <PagesHero />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 mt-2">
                <h2 className="text-[15px] font-medium text-[var(--foreground)]">
                    All Pages <span className="text-[var(--muted-foreground)] font-normal">({filteredAndSorted.length})</span>
                </h2>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                        <input
                            type="text"
                            placeholder="Search pages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-[var(--secondary)]/50 border border-[var(--border-subtle)] focus:border-[var(--accent)] rounded-lg outline-none transition-all text-[13px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
                        />
                    </div>
                    <button
                        onClick={() => setSortBy((p) => (p === 'newest' ? 'oldest' : 'newest'))}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--secondary)]/50 border border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/40 rounded-lg transition-all text-[13px] text-[var(--foreground)] shrink-0"
                    >
                        <ArrowUpDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                        {sortBy === 'newest' ? 'Newest' : 'Oldest'}
                    </button>
                </div>
            </div>

            {filteredAndSorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BookOpen className="h-10 w-10 text-[var(--muted-foreground)]/25 mb-4" />
                    <h3 className="text-[15px] font-medium text-[var(--foreground)]">No pages found</h3>
                    <p className="text-[13px] text-[var(--muted-foreground)] mt-1.5 max-w-xs">
                        {searchQuery.trim() ? 'Try a different search term.' : 'Published reports will show up here.'}
                    </p>
                </div>
            ) : (
                <PagesGrid pages={filteredAndSorted} onOpen={(p) => onOpen(p.id)} />
            )}
        </div>
    )
}

// Renders a published page the same way an in-progress report reads inside the
// chat/artifact panel (same title treatment, same MarkdownMessage renderer) so
// opening a page from the sidebar doesn't feel like a different app.
function PageDetailView({ id }: { id: string }) {
    const [data, setData] = useState<PageDetail | null>(null)
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

    useEffect(() => {
        let cancelled = false
        setStatus('loading')
        fetch(`/api/pages/${id}`)
            .then((res) => {
                if (!res.ok) throw new Error('not found')
                return res.json()
            })
            .then((json) => { if (!cancelled) { setData(json); setStatus('ready') } })
            .catch(() => { if (!cancelled) setStatus('error') })
        return () => { cancelled = true }
    }, [id])

    if (status === 'loading') {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
        )
    }

    if (status === 'error' || !data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
                <p className="text-[14px] font-medium text-[var(--foreground)]">Page not found</p>
                <p className="text-[13px] text-[var(--muted-foreground)]">This page may have expired or been unpublished.</p>
            </div>
        )
    }

    const date = typeof data.publishedAt === 'string' ? data.publishedAt : (typeof data.created_at === 'string' ? data.created_at : undefined)
    const sources = Array.isArray(data.sources) ? data.sources : []

    return (
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <article className="max-w-3xl mx-auto">
                <h1 className="text-[28px] leading-tight font-semibold text-[var(--foreground)] mb-2 tracking-tight opacity-90">
                    {data.title || 'AI Research Report'}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--muted-foreground)] mb-8">
                    <span>{data.authorName || 'Generated by Omni AI'}</span>
                    {date && <span>· {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))}</span>}
                </div>

                {data.answer ? <MarkdownMessage content={data.answer} /> : null}

                {sources.length > 0 && (
                    <div className="mt-12 border-t border-[var(--border-subtle)] pt-8">
                        <h3 className="mb-5 text-lg font-semibold tracking-tight text-[var(--foreground)]">References</h3>
                        <div className="flex flex-col gap-3">
                            {sources.map((source, idx) => (
                                <SourceItem key={idx} source={source} index={idx} />
                            ))}
                        </div>
                    </div>
                )}
            </article>
        </div>
    )
}

interface PagesPanelProps {
    isOpen: boolean
    onClose: () => void
    leftOffset: string
}

export function PagesPanel({ isOpen, onClose, leftOffset }: PagesPanelProps) {
    const [activeId, setActiveId] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) setActiveId(null)
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-y-0 right-0 z-40 flex flex-col bg-[var(--background)] transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ left: leftOffset }}
        >
            <div className="flex items-center h-14 px-4 border-b border-[var(--border-subtle)] shrink-0 gap-3">
                {activeId ? (
                    <button
                        onClick={() => setActiveId(null)}
                        className="flex items-center gap-1.5 px-2 py-1.5 -ml-1.5 rounded-md text-[13px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                    >
                        <ArrowLeft size={14} />
                        Pages
                    </button>
                ) : (
                    <span className="text-[14px] font-medium text-[var(--foreground)] opacity-90">Pages</span>
                )}
                <div className="flex-1" />
                <button onClick={onClose} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors" title="Close">
                    <X size={18} strokeWidth={1.5} />
                </button>
            </div>

            {activeId ? <PageDetailView key={activeId} id={activeId} /> : <PagesList onOpen={setActiveId} />}
        </div>
    )
}
