import { redis } from '@/lib/redis'
import Link from 'next/link'
import Image from 'next/image'
import { Metadata } from 'next'
import { ExternalLink } from 'lucide-react'
import { PagesHero } from '@/components/pages-grid'
import { PagesClient } from './pages-client'

export const metadata: Metadata = {
    title: 'Explore Pages',
    description: 'Explore research, insights, and comprehensive answers published by the Omni Knows community.',
    openGraph: {
        title: 'Explore Pages | Omni Knows',
        description: 'Explore research, insights, and comprehensive answers published by the Omni Knows community.',
        images: ['/omniknows_pages_home.png'],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Explore Pages | Omni Knows',
        description: 'Explore research, insights, and comprehensive answers published by the Omni Knows community.',
        images: ['/omniknows_pages_home.png'],
    }
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
                    <Link href="/pages" className="flex items-center gap-2.5 group">
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

                <PagesHero />

                {/* ─── Divider ─── */}
                <div className="border-t border-[var(--border-subtle)]/40" />

                {/* ─── Articles Grid ─── */}
                <PagesClient initialPages={rest} />

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
