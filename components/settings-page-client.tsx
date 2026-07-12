'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { SettingsDialog, SLUG_TO_TAB, TAB_SLUGS, type TabId } from '@/components/settings-dialog'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * Renders the app shell with the settings dialog open on the tab matching
 * `tabSlug` (undefined/unknown -> 'general'). Kept as a real route (not just
 * local dialog state) for bookmarks and links sent outside the app — e.g. the
 * scheduled-research confirmation email links straight to
 * /settings/scheduled-research. Switching tabs while here keeps the URL in
 * sync via router.replace. Closing the dialog goes home.
 */
export function SettingsPageClient({ tabSlug }: { tabSlug?: string }) {
    const router = useRouter()
    const isMobileCheck = useIsMobile()
    const isMobile = isMobileCheck === undefined ? true : isMobileCheck
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(true)

    const activeTab: TabId = (tabSlug && SLUG_TO_TAB[tabSlug]) || 'general'

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

    const handleTabChange = useCallback((tab: TabId) => {
        router.replace(`/settings/${TAB_SLUGS[tab]}`, { scroll: false })
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
            <SettingsDialog
                open={settingsOpen}
                onOpenChange={handleOpenChange}
                initialTab={activeTab}
                onTabChange={handleTabChange}
            />
        </div>
    )
}
