import { Suspense } from 'react'
import { Metadata } from 'next'
import { VoicePageClient } from '@/components/voice-page-client'

export const metadata: Metadata = {
    title: { absolute: 'Voice | Omni Knows' },
    robots: { index: false, follow: false },
}

export default function VoicePage() {
    // useSearchParams (the ?thread= resume param) opts a client component
    // into client-side rendering, which Next requires a Suspense boundary
    // for — see app/benchmark/page.tsx for the same pattern.
    return (
        <Suspense fallback={null}>
            <VoicePageClient />
        </Suspense>
    )
}
