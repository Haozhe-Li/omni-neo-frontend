import { SettingsPageClient } from '@/components/settings-page-client'
import { Metadata } from 'next'

interface SettingsPageProps {
    params: Promise<{ tab?: string[] }>
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: { absolute: 'Settings | Omni Knows' },
        robots: { index: false, follow: false },
    }
}

export default async function SettingsPage({ params }: SettingsPageProps) {
    const { tab } = await params
    return <SettingsPageClient tabSlug={tab?.[0]} />
}
