import { SharedThreadClient } from '@/components/shared-thread-client'
import { Metadata } from 'next'

interface SharedThreadPageProps {
    params: Promise<{ shareId: string }>
}

// A shared conversation is for whoever holds the link, not for search engines.
export async function generateMetadata(): Promise<Metadata> {
    return {
        title: { absolute: 'Shared conversation | Omni Knows' },
        robots: { index: false, follow: false },
    }
}

export default async function SharedThreadPage({ params }: SharedThreadPageProps) {
    const { shareId } = await params
    return <SharedThreadClient shareId={shareId} />
}
