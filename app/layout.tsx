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
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
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
