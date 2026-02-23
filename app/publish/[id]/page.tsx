import { redis } from '@/lib/redis'
import { FinalAnswer } from '@/components/final-answer'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'

interface PublishPageProps {
    params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PublishPageProps): Promise<Metadata> {
    const { id } = await params
    const rawData = await redis.get(`publish:${id}`)

    if (!rawData) {
        return {
            title: 'Report Not Found',
        }
    }

    const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    return {
        title: data.title || 'Canvas Report',
        description: 'A shared canvas report.',
    }
}

export default async function PublishPage({ params }: PublishPageProps) {
    const { id } = await params
    const rawData = await redis.get(`publish:${id}`)

    if (!rawData) {
        notFound()
    }

    const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData

    return (
        <div className="min-h-screen bg-[var(--background)] py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-[1200px] mx-auto">
                <FinalAnswer
                    answer={data.answer}
                    sources={data.sources}
                    assets={data.assets}
                    title={data.title}
                    isReadOnly={true}
                />
            </div>
        </div>
    )
}
