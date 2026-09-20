import { Metadata } from 'next'
import { VoicePageClient } from '@/components/voice-page-client'

export const metadata: Metadata = {
    title: { absolute: 'Voice | Omni Knows' },
    robots: { index: false, follow: false },
}

export default function VoicePage() {
    return <VoicePageClient />
}
