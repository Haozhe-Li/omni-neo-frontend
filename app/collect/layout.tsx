import type { Metadata } from 'next'

// A tool for annotators, not a page of the product: out of search results and out of
// link previews. (proxy.ts keeps it behind a password; this is for the login page too.)
export const metadata: Metadata = {
  title: 'Collector',
  robots: { index: false, follow: false, nocache: true },
}

export default function CollectLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">{children}</div>
}
