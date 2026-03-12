import type { Metadata } from 'next'
import { Inter, Geist_Mono, IBM_Plex_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ClerkProvider } from '@clerk/nextjs'
import { AuthListener } from '@/components/auth-listener'
import { ClerkThemeProvider } from '@/components/clerk-theme-provider'
import './globals.css'
import 'katex/dist/katex.min.css'

const _inter = Inter({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: {
    default: 'Omni Knows - Advanced AI Research Agent',
    template: '%s | Omni Knows',
  },
  description: 'Advanced AI-powered research agent that thinks, searches, and provides comprehensive answers for complex queries.',
  keywords: ['AI', 'Research Agent', 'Artificial Intelligence', 'Search Engine', 'Machine Learning', 'Deep Learning', 'Omni Knows'],
  authors: [{ name: 'Haozhe Li' }],
  creator: 'Haozhe Li',
  metadataBase: new URL('https://omniknows.xyz'),
  openGraph: {
    title: 'Omni Knows - Advanced AI Research Agent',
    description: 'Advanced AI-powered research agent that thinks, searches, and provides comprehensive answers for complex queries.',
    url: 'https://omniknows.xyz',
    siteName: 'Omni Knows',
    images: [
      {
        url: '/omniknows_main.png',
        width: 1200,
        height: 630,
        alt: 'Omni Knows - Advanced AI Research Agent',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Omni Knows - Advanced AI Research Agent',
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

export default function RootTelescope({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={ibmPlexSans.variable}>
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
