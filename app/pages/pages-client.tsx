'use client'

import { useState, useMemo } from 'react'
import { BookOpen, Search, ArrowUpDown } from 'lucide-react'
import { PagesGrid, PagesHero, type PageSummary } from '@/components/pages-grid'

export function PagesClient({ initialPages }: { initialPages: PageSummary[] }) {
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

        result = [...result].sort((a, b) => {
            const dateA = new Date(a.publishedAt || a.created_at || 0).getTime()
            const dateB = new Date(b.publishedAt || b.created_at || 0).getTime()
            return sortBy === 'newest' ? dateB - dateA : dateA - dateB
        })

        return result
    }, [initialPages, searchQuery, sortBy])

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto px-6">
        <PagesHero />
        <div className="border-t border-[var(--border-subtle)]/40" />
        <section className="py-8 sm:py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                        All Pages
                    </h2>
                    <span className="text-sm text-[var(--muted-foreground)]">
                        {filteredAndSortedPages.length} {filteredAndSortedPages.length === 1 ? 'page' : 'pages'}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative group/search flex-1 sm:flex-none">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)] transition-colors group-focus-within/search:text-[var(--accent)]" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search pages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 pl-8 pr-4 py-2 bg-[var(--card)] border border-[var(--border-subtle)] focus:border-[var(--accent)] rounded-xl outline-none transition-all text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
                        />
                    </div>
                    <button
                        onClick={() => setSortBy(prev => prev === 'newest' ? 'oldest' : 'newest')}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/50 rounded-xl transition-all text-sm text-[var(--foreground)] shrink-0"
                    >
                        <ArrowUpDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                        <span className="hidden sm:inline">Sort: {sortBy === 'newest' ? 'Newest' : 'Oldest'}</span>
                    </button>
                </div>
            </div>

            {filteredAndSortedPages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BookOpen className="h-12 w-12 text-[var(--muted-foreground)]/20 mb-5" />
                    <h3 className="text-lg font-medium text-[var(--foreground)]">No pages found</h3>
                    <p className="text-[var(--muted-foreground)] mt-2 max-w-md">
                        {searchQuery.trim() ? "We couldn't find anything matching your search. Try different keywords." : "Be the first to share your research from the Omni Canvas. Published pages will appear here."}
                    </p>
                </div>
            ) : (
                <PagesGrid pages={filteredAndSortedPages} getHref={(p) => `/pages/${p.id}`} />
            )}
        </section>
        <footer className="w-full py-6 hidden md:flex flex-col gap-4 justify-center items-center animate-fade-up">
            <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground/60">
                <p>
                    &copy; {new Date().getFullYear()}{' '}
                    <a href="https://omniknows.xyz" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-muted-foreground/30 hover:decoration-foreground hover:text-foreground transition-colors font-[family-name:var(--font-plex)]">Omni Knows</a>
                    {'. All rights reserved.'}
                </p>
                <p>
                    Made with love by{' '}
                    <a href="https://haozhe.li" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-muted-foreground/30 hover:decoration-foreground hover:text-foreground transition-colors">Haozhe Li</a>
                </p>
            </div>
        </footer>
        </div>
        </div>
    )
}
