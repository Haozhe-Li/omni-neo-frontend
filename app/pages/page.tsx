import { redis } from '@/lib/redis'
import Link from 'next/link'
import Image from 'next/image'
import { Metadata } from 'next'
import { BookOpen, Clock, ArrowRight, ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
    title: 'Omni Pages | Community Research',
    description: 'Explore research and answers published by the Omni Knows community.',
}

export const revalidate = 60 // Revalidate every minute

export default async function OmniPagesList() {
    const pageIds = await redis.zrange('omni_pages:all', 0, 49, { rev: true })

    let pages: any[] = []

    if (pageIds.length > 0) {
        const keys = pageIds.map((id) => `publish:${id}`)
        const rawData = await redis.mget(...keys)

        pages = rawData
            .map((data, index) => {
                if (!data) return null
                const parsed = typeof data === 'string' ? JSON.parse(data) : data
                return {
                    id: pageIds[index],
                    ...parsed,
                }
            })
            .filter(Boolean)
    }

    // ─── No more dynamic "featured" split. ───
    // All fetched pages go to the grid below.
    const rest = pages

    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* ─── Navbar ─── */}
            <header className="sticky top-0 z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]/30">
                <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <Image
                            src="/android-chrome-512x512.png"
                            alt="Omni Knows Logo"
                            width={28}
                            height={28}
                            className="rounded-xl shadow-sm"
                        />
                        <span className="font-[family-name:var(--font-plex)] text-[20px] font-light tracking-tight text-[var(--foreground)] lowercase group-hover:opacity-70 transition-opacity">
                            omni<span className="font-normal" style={{ color: '#20B2AA' }}>knows</span>
                        </span>
                    </Link>

                    <Link
                        href="/"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
                    >
                        Ask anything
                    </Link>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6">

                {/* ─── Hero section with featured image ─── */}
                <section className="py-12 sm:py-16">
                    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center">
                        <div className="relative w-full lg:w-[60%] aspect-[16/9] rounded-2xl overflow-hidden shadow-lg">
                            <Image
                                src="/omniknows_pages.png"
                                alt="Omni Knows"
                                fill
                                className="object-cover"
                                priority
                            />
                            {/* Subtle gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                        </div>

                        <div className="flex-1 space-y-5">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--accent)]">Welcome</span>
                                <span className="w-8 h-px bg-[var(--accent)]" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--foreground)] leading-[1.15]">
                                Introducing Omni Pages
                            </h1>
                            <p className="text-[var(--muted-foreground)] text-base leading-relaxed">
                                Explore insights, reports, and deep dives published by the Omni Knows community. Be the first to share your research from the Omni Canvas.
                            </p>
                            <Link
                                href="/"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--foreground)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition-colors"
                            >
                                Start Researching
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ─── Divider ─── */}
                <div className="border-t border-[var(--border-subtle)]/40" />

                {/* ─── Articles Grid ─── */}
                <section className="py-12 sm:py-16">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-semibold text-[var(--foreground)]">
                            All Articles
                        </h2>
                        <span className="text-sm text-[var(--muted-foreground)]">
                            {pages.length} {pages.length === 1 ? 'article' : 'articles'}
                        </span>
                    </div>

                    {rest.length === 0 && !featured ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <BookOpen className="h-12 w-12 text-[var(--muted-foreground)]/20 mb-5" />
                            <h3 className="text-lg font-medium text-[var(--foreground)]">No pages published yet</h3>
                            <p className="text-[var(--muted-foreground)] mt-2 max-w-md">
                                Be the first to share your research from the Omni Canvas. Published articles will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {rest.map((page) => (
                                <ArticleCard key={page.id} page={page} />
                            ))}
                        </div>
                    )}
                </section>

                {/* ─── Footer ─── */}
                <footer className="border-t border-[var(--border-subtle)]/30 py-10 flex items-center justify-between">
                    <span className="text-xs text-[var(--muted-foreground)] font-[family-name:var(--font-plex)]">
                        © {new Date().getFullYear()} Omni Knows
                    </span>
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                            Home
                        </Link>
                        <Link href="/settings" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                            Settings
                        </Link>
                        <a href="https://haozhe.li" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1">
                            About <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </footer>
            </main>
        </div>
    )
}

/* ─── Helper ─── */

function formatDate(dateStr: string | number | undefined | null) {
    if (!dateStr) return 'Unknown Date'
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

/* ─── Article Card ─── */

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
