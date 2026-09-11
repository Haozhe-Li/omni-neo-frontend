'use client'

import { useState, useMemo } from 'react'
import { BookOpen, Search, ArrowUpDown, Menu } from 'lucide-react'
import { PagesGrid, type PageSummary } from '@/components/pages-grid'
import { usePagesShellControls } from '@/components/pages-shell'

export function PagesClient({ initialPages }: { initialPages: PageSummary[] }) {
    const { isMobile, toggleSidebar } = usePagesShellControls()
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

    const today = useMemo(
        () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
        []
    )

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
        {isMobile && (
            <div className="sticky top-0 z-20 flex h-[52px] items-center border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_93%,transparent)] px-4 backdrop-blur-[8px]">
                <button
                    onClick={toggleSidebar}
                    className="-ml-2 rounded-full p-2 text-[var(--ink-muted)] transition-colors hover:bg-[var(--sand)] hover:text-[var(--ink)]"
                    title="Menu"
                >
                    <Menu size={20} />
                </button>
            </div>
        )}
        <div className="mx-auto max-w-[1000px] px-6 sm:px-10">
        {/* ── Masthead ─────────────────────────────────────────────────────
            Today's date over a serif wordmark, with the controls sitting on
            the baseline beside it — a front page, not a file listing. */}
        <section className="flex flex-wrap items-end justify-between gap-6 pb-7 pt-10 sm:pt-11">
            <div>
                <div className="omni-eyebrow mb-3" style={{ letterSpacing: '0.14em', fontSize: 11 }}>
                    {today}
                </div>
                <h1 className="omni-display text-[clamp(32px,4vw,46px)] text-[var(--ink)]">Pages</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="group/search relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                        <Search className="h-3.5 w-3.5 text-[var(--ink-faint)] transition-colors group-focus-within/search:text-[var(--teal)]" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search pages"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-full border border-[var(--line-strong)] bg-transparent py-[7px] pl-9 pr-4 text-[13px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--teal)] sm:w-56"
                    />
                </div>
                <button
                    onClick={() => setSortBy(prev => prev === 'newest' ? 'oldest' : 'newest')}
                    className="omni-pill shrink-0 gap-2 py-[7px]"
                >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{sortBy === 'newest' ? 'Newest' : 'Oldest'}</span>
                </button>
            </div>
        </section>

        <section className="pb-10">
            {filteredAndSortedPages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <BookOpen className="mb-5 h-10 w-10 text-[var(--ink-fainter)]" strokeWidth={1.25} />
                    <h3 className="omni-display text-[24px] text-[var(--ink)]">Nothing published yet</h3>
                    <p className="mt-2.5 max-w-md text-[15px] leading-[1.65] text-[var(--ink-muted)]">
                        {searchQuery.trim()
                            ? "Nothing here matches that search. Try fewer or different words."
                            : 'Publish a report from a thread and it lands here, ready to share.'}
                    </p>
                </div>
            ) : (
                <PagesGrid pages={filteredAndSortedPages} />
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
