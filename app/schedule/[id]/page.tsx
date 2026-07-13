import { SchedulePageClient } from '@/components/schedule-page-client'
import { Metadata } from 'next'

interface SchedulePageProps {
    params: Promise<{ id: string }>
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: { absolute: 'Scheduled Report | Omni Knows' },
        robots: { index: false, follow: false },
    }
}

export default async function SchedulePage({ params }: SchedulePageProps) {
    const { id } = await params
    return <SchedulePageClient runId={id} />
}
