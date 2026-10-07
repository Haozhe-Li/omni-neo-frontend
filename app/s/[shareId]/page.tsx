import { SharedThreadClient } from '@/components/shared-thread-client'
import { Metadata } from 'next'

interface SharedThreadPageProps {
    params: Promise<{ shareId: string }>
}

// A shared conversation is for whoever holds the link, not for search engines.
export async function generateMetadata(): Promise<Metadata> {
    return {
        title: { absolute: 'Shared conversation | Omni Knows' },
        // What a chat app shows under the preview image when the link is pasted.
        openGraph: { title: 'Check out this chat', siteName: 'OmniKnows', type: 'website' },
        twitter: { card: 'summary_large_image', title: 'Check out this chat' },
        robots: { index: false, follow: false },
    }
}

export default async function SharedThreadPage({ params }: SharedThreadPageProps) {
    const { shareId } = await params
    return <SharedThreadClient shareId={shareId} />
}
