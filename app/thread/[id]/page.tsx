import { ThreadPageClient } from '@/components/thread-page-client'
import { Metadata } from 'next'

interface ThreadPageProps {
    params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ThreadPageProps): Promise<Metadata> {
    const { id } = await params
    return {
        title: { absolute: 'Conversation | Omni Knows' },
        robots: { index: false, follow: false },
        alternates: { canonical: `https://omniknows.xyz/thread/${id}` },
    }
}

export default async function ThreadPage({ params }: ThreadPageProps) {
    const { id } = await params
    return <ThreadPageClient threadId={id} />
}
