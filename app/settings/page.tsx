'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { SettingsDialog } from '@/components/settings-dialog'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * /settings is kept for old links and bookmarks: it renders the app shell
 * with the settings dialog open, and closing the dialog goes home.
 */
export default function SettingsPage() {
    const router = useRouter()
    const isMobileCheck = useIsMobile()
    const isMobile = isMobileCheck === undefined ? true : isMobileCheck
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(true)

    useEffect(() => {
        setSidebarOpen(!isMobile)
    }, [isMobile])

    const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), [])
    const handleNewChat = useCallback(() => router.push('/'), [router])
    const handleSelectThread = useCallback((threadId: string) => router.push(`/thread/${threadId}`), [router])

    const handleOpenChange = useCallback((open: boolean) => {
        setSettingsOpen(open)
        if (!open) router.push('/')
    }, [router])

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden relative">
            <AppSidebar
                className="flex-shrink-0 z-50 relative"
                isOpen={sidebarOpen}
                onToggle={toggleSidebar}
                isMobile={isMobile}
                onNewChat={handleNewChat}
                onSelectThread={handleSelectThread}
            />
            <main className="flex-1 min-w-0 h-full bg-[var(--background)]" />
            <SettingsDialog open={settingsOpen} onOpenChange={handleOpenChange} />
        </div>
    )
}
