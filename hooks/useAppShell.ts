'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * Shared sidebar/layout chrome (mobile detection + persisted sidebar-open state)
 * used by every top-level page that renders <AppSidebar> (home, thread view, ...).
 */
export function useAppShell() {
  const isMobileCheck = useIsMobile()
  const isMobile = isMobileCheck === undefined ? true : isMobileCheck
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarInitializedRef = useRef(false)

  useEffect(() => {
    if (isMobile === undefined) return
    if (isMobile) {
      setSidebarOpen(false)
      sidebarInitializedRef.current = true
      return
    }
    const saved = localStorage.getItem('omni_sidebar_open')
    const shouldOpen = saved !== '0' // default open on desktop if no preference
    if (!sidebarInitializedRef.current) {
      sidebarInitializedRef.current = true
      if (shouldOpen) {
        setSidebarOpen(false)
        const t = setTimeout(() => setSidebarOpen(true), 200)
        return () => clearTimeout(t)
      }
    } else {
      setSidebarOpen(shouldOpen)
    }
  }, [isMobile])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((p) => {
      const next = !p
      localStorage.setItem('omni_sidebar_open', next ? '1' : '0')
      return next
    })
  }, [])

  return { isMobile, sidebarOpen, setSidebarOpen, toggleSidebar }
}
