'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { VoiceView } from '@/components/voice-view'
import { useAppShell } from '@/hooks/useAppShell'

export function VoicePageClient() {
    const router = useRouter()
    const { isMobile, sidebarOpen, toggleSidebar } = useAppShell()

    const goHome = useCallback(() => router.push('/'), [router])
    const selectThread = useCallback((id: string) => router.push(`/thread/${id}`), [router])

    return (
        <div className="omni-app-shell flex h-[100dvh] w-full overflow-hidden relative">
            <AppSidebar
                currentThreadId={null}
                onSelectThread={selectThread}
                onNewChat={goHome}
                className="flex-shrink-0 z-50 relative"
                isOpen={sidebarOpen}
                onToggle={toggleSidebar}
                isMobile={isMobile}
            />

            <main className="flex-1 min-w-0 h-full relative overflow-hidden">
                <VoiceView onToggleSidebar={toggleSidebar} isMobile={isMobile} />
            </main>
        </div>
    )
}
