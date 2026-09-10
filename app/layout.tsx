import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk, Instrument_Serif, IBM_Plex_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ClerkProvider } from '@clerk/nextjs'
import { AuthListener } from '@/components/auth-listener'
import { ClerkThemeProvider } from '@/components/clerk-theme-provider'
import './globals.css'
import 'katex/dist/katex.min.css'

/* ── Omni type system ─────────────────────────────────────────────────────
   Three faces, three jobs. Hanken Grotesk is the UI voice (everything you
   read to operate the product); Instrument Serif is the display voice —
   headlines, questions, the wordmark, the big numbers in a widget — and is
   the single strongest signal that a screen is Omni's; IBM Plex Mono carries
   labels, source hosts, code and anything that should read as machine
   output. `--font-plex` is kept as an alias for the display face because a
   dozen call sites already reach for it by that name. */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-hanken',
  display: 'swap',
})
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/* Mobile browser chrome takes the paper ground in each theme, so the address
   bar blends into the page instead of framing it in white or black. */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF6EF' },
    { media: '(prefers-color-scheme: dark)', color: '#191614' },
  ],
}

export const metadata: Metadata = {
  title: {
    default: 'Omni Knows',
    template: '%s | Omni Knows',
  },
  description: 'Advanced AI-powered research agent that thinks, searches, and provides comprehensive answers for complex queries.',
  keywords: ['AI', 'Research Agent', 'Artificial Intelligence', 'Search Engine', 'Machine Learning', 'Deep Learning', 'Omni Knows'],
  authors: [{ name: 'Haozhe Li' }],
  creator: 'Haozhe Li',
  metadataBase: new URL('https://omniknows.xyz'),
  openGraph: {
    title: 'Omni Knows',
    description: 'Advanced AI-powered research agent that thinks, searches, and provides comprehensive answers for complex queries.',
    url: 'https://omniknows.xyz',
    siteName: 'Omni Knows',
    images: [
      {
        url: '/omniknows_main.png',
        width: 1200,
        height: 630,
        alt: 'Omni Knows',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Omni Knows',
    description: 'Advanced AI-powered research agent that thinks, searches, and provides comprehensive answers for complex queries.',
    images: ['/omniknows_main.png'],
    creator: '@omniknows',
  },
  /* All of these are the three-ring mark, generated from public/omni-mark.svg
     — see the note in that file for the geometry.

     The SVG is listed first and is what any current browser will use: it is
     the only one that can follow the tab strip's own light/dark, and it stays
     sharp at whatever size the browser asks for. The raster sizes below it
     are the fallback, and the ones iOS and Android actually install.

     `?v=2` is not decoration. Browsers cache a favicon far past a normal
     asset, keyed on URL, so replacing the file at the same path leaves
     returning visitors on the old icon indefinitely. */
  icons: {
    icon: [
      { url: '/omni-mark.svg?v=2', type: 'image/svg+xml' },
      { url: '/favicon.ico?v=2', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=2', sizes: '180x180' },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

export default function Rootlayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${hankenGrotesk.variable} ${instrumentSerif.variable} ${plexMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkThemeProvider>
            <AuthListener />
            {children}
            <Toaster />
          </ClerkThemeProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
