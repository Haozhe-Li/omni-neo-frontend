import { redis } from '@/lib/redis'
import Link from 'next/link'
import Image from 'next/image'
import { Metadata } from 'next'
import { ArrowRight, ExternalLink } from 'lucide-react'
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

                {/* ─── Hero section with featured image ─── */}
                <section className="py-12 sm:py-16">
                    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center">
                        <div className="relative w-full lg:w-[60%] aspect-[16/9] rounded-2xl overflow-hidden shadow-lg">
                            <Image
                                src="/omniknows_pages.webp"
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
                                Omni Pages is a new feature that allows you to publish your research from the Omni Canvas.
                            </p>
                            <Link
                                href="https://haozhe.li/blog/omniknows-pages"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--foreground)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition-colors"
                            >
                                Learn More
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                </section>

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
