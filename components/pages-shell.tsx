'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { useAppShell } from '@/hooks/useAppShell'

interface PagesShellControls {
  isMobile: boolean
  toggleSidebar: () => void
}

const PagesShellContext = createContext<PagesShellControls | null>(null)

/**
 * On mobile, <AppSidebar> no longer renders its own hamburger button — each
 * page header is responsible for one (see chat-view.tsx). Pages' own routes
 * (list + detail) render inside <PagesShell>, several components deep from
 * where the sidebar state actually lives, so it's exposed via context rather
 * than threaded through props.
 */
export function usePagesShellControls(): PagesShellControls {
  const ctx = useContext(PagesShellContext)
  if (!ctx) throw new Error('usePagesShellControls must be used within PagesShell')
  return ctx
}

/**
 * Shared app shell for every /pages route (list + detail) — mounts the same
 * <AppSidebar> used by the home/thread views so Pages never renders its own
 * standalone header, and the sidebar stays put regardless of how the route
 * was entered (in-app nav, direct URL, or a pasted link).
 */
export function PagesShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar } = useAppShell()

  const goHome = useCallback(() => router.push('/'), [router])
  const selectThread = useCallback((id: string) => router.push(`/thread/${id}`), [router])

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden relative">
      <AppSidebar
        onSelectThread={selectThread}
        onNewChat={goHome}
        className="flex-shrink-0 z-50 relative"
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        isMobile={isMobile}
      />

      <main className="flex-1 min-w-0 h-full relative overflow-hidden">
        <PagesShellContext.Provider value={{ isMobile: !!isMobile, toggleSidebar }}>
          {children}
        </PagesShellContext.Provider>
      </main>
    </div>
  )
}
