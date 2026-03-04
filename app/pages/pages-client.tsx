'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BookOpen, Clock, Search, ArrowUpDown } from 'lucide-react'

function formatDate(dateStr: string | number | undefined | null) {
    if (!dateStr) return 'Unknown Date'
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function ArticleCard({ page }: { page: any }) {
    const description = page.answer
        ? String(page.answer).replace(/<[^>]+>/g, '').replace(/[#*_`~]/g, '').slice(0, 120).trimEnd() + '...'
        : 'No description available.'

    return (
        <Link
            href={`/pages/${page.id}`}
            className="group flex flex-col rounded-2xl border border-[var(--border-subtle)]/50 bg-[var(--card)] hover:shadow-md hover:border-[var(--border-subtle)] transition-all duration-300 overflow-hidden"
        >
            <div className="p-6 flex flex-col flex-1 gap-4">
                <div className="space-y-3 flex-1">
                    <h3 className="text-[17px] font-semibold text-[var(--foreground)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                        {page.title || 'Untitled Research'}
                    </h3>
                    <p className="text-sm text-[var(--muted-foreground)] leading-relaxed line-clamp-3">
                        {description}
                    </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]/30">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {page.authorImage ? (
                            <Image
                                src={page.authorImage}
                                alt={page.authorName || 'User'}
                                width={22}
                                height={22}
                                className="rounded-full shrink-0"
                            />
                        ) : (
                            <div className="w-[22px] h-[22px] rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold">
                                    {(page.authorName || 'A')[0].toUpperCase()}
                                </span>
                            </div>
                        )}
                        <span className="text-xs font-medium text-[var(--foreground)] truncate">
                            {page.authorName || 'Anonymous User'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(page.publishedAt || page.created_at)}</span>
                    </div>
                </div>
            </div>
        </Link>
    )
}

export function PagesClient({ initialPages }: { initialPages: any[] }) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')

    const filteredAndSortedPages = useMemo(() => {
        let result = initialPages.filter(p => p.publishToPages !== false)

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            result = result.filter(
                (p) =>
                    (p.title && p.title.toLowerCase().includes(query)) ||
                    (p.answer && p.answer.toLowerCase().includes(query)) ||
                    (p.authorName && p.authorName.toLowerCase().includes(query))
            )
        }

        result.sort((a, b) => {
            const dateA = new Date(a.publishedAt || a.created_at || 0).getTime()
            const dateB = new Date(b.publishedAt || b.created_at || 0).getTime()
            return sortBy === 'newest' ? dateB - dateA : dateA - dateB
        })

        return result
    }, [initialPages, searchQuery, sortBy])

    return (
        <section className="py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-[var(--foreground)]">
                        All Articles
                    </h2>
                    <span className="text-sm text-[var(--muted-foreground)]">
                        {filteredAndSortedPages.length} {filteredAndSortedPages.length === 1 ? 'article' : 'articles'}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative group/search flex-1 sm:flex-none">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-[var(--muted-foreground)] transition-colors group-focus-within/search:text-[var(--accent)]" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search articles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 pl-9 pr-4 py-2 bg-[var(--card)] border border-[var(--border-subtle)] focus:border-[var(--accent)] rounded-xl outline-none transition-all text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70 shadow-sm"
                        />
                    </div>
                    <button
                        onClick={() => setSortBy(prev => prev === 'newest' ? 'oldest' : 'newest')}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/50 rounded-xl transition-all text-sm text-[var(--foreground)] shadow-sm shrink-0"
                    >
                        <ArrowUpDown className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <span className="hidden sm:inline">Sort: {sortBy === 'newest' ? 'Newest' : 'Oldest'}</span>
                    </button>
                </div>
            </div>

            {filteredAndSortedPages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BookOpen className="h-12 w-12 text-[var(--muted-foreground)]/20 mb-5" />
                    <h3 className="text-lg font-medium text-[var(--foreground)]">No articles found</h3>
                    <p className="text-[var(--muted-foreground)] mt-2 max-w-md">
                        {searchQuery.trim() ? "We couldn't find anything matching your search. Try different keywords." : "Be the first to share your research from the Omni Canvas. Published articles will appear here."}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredAndSortedPages.map((page) => (
                        <ArticleCard key={page.id} page={page} />
                    ))}
                </div>
            )}
        </section>
    )
}
