'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowRight, Sparkles, Menu } from 'lucide-react'

interface SearchHomeProps {
  onSearch: (query: string, threadId: string) => void
  isAutoDetecting?: boolean
  onToggleSidebar?: () => void
  isMobile?: boolean
}

export function SearchHome({ onSearch, isAutoDetecting = false, onToggleSidebar, isMobile = false }: SearchHomeProps) {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [threadId, setThreadId] = useState<string>('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Mouse glow state — we track both "target" (instant mouse) and "rendered" (smoothed)
  const glowRef = useRef<HTMLDivElement>(null)
  const mousePos = useRef({ x: 0, y: 0 })
  const renderedPos = useRef({ x: 0, y: 0 })
  const rafId = useRef<number>(0)

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const animateGlow = useCallback(() => {
    renderedPos.current.x = lerp(renderedPos.current.x, mousePos.current.x, 0.08)
    renderedPos.current.y = lerp(renderedPos.current.y, mousePos.current.y, 0.08)

    if (glowRef.current) {
      glowRef.current.style.transform = `translate(${renderedPos.current.x}px, ${renderedPos.current.y}px) translate(-50%, -50%)`
    }

    rafId.current = requestAnimationFrame(animateGlow)
  }, [])

  useEffect(() => {
    // Init glow position to center
    if (typeof window !== 'undefined') {
      mousePos.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      renderedPos.current = { ...mousePos.current }
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY }
    }

    window.addEventListener('mousemove', handleMouseMove)
    rafId.current = requestAnimationFrame(animateGlow)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(rafId.current)
    }
  }, [animateGlow])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 600)
    return () => clearTimeout(timer)
  }, [])


  const [backendStatus, setBackendStatus] = useState<'unknown' | 'ready' | 'not-ready'>('unknown')
  const [isCheckPending, setIsCheckPending] = useState(true)

  // Use refs for the interval ID to keep it accessible in cleanup
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Determine backend URL
    const backendUrl = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
      ? '/api/health'
      : process.env.NEXT_PUBLIC_BACKEND_URL
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/health`
        : '/api/health'

    if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
      setBackendStatus('ready')
      setIsCheckPending(false)
      return
    }

    const STORAGE_KEY = 'backend_health_status'
    const EXPIRY_KEY = 'backend_health_expiry'
    const EXPIRY_TIME = 10 * 60 * 1000 // 10 minutes

    const getStoredStatus = () => {
      if (typeof window === 'undefined') return null
      const status = localStorage.getItem(STORAGE_KEY)
      const expiry = localStorage.getItem(EXPIRY_KEY)
      if (status === 'ready' && expiry && parseInt(expiry) > Date.now()) {
        return 'ready'
      }
      return null
    }

    const setStoredStatus = () => {
      localStorage.setItem(STORAGE_KEY, 'ready')
      localStorage.setItem(EXPIRY_KEY, (Date.now() + EXPIRY_TIME).toString())
    }

    const checkHealth = async () => {
      try {
        const res = await fetch(backendUrl)
        if (res.ok) {
          setBackendStatus('ready')
          setIsCheckPending(false)
          setStoredStatus()
          // Stop polling if we become ready
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current)
            intervalIdRef.current = null
          }
        } else {
          setBackendStatus('not-ready')
          setIsCheckPending(false)
        }
      } catch (error) {
        setBackendStatus('not-ready')
        setIsCheckPending(false)
      }
    }

    // Initialize thread ID
    const fetchThreadId = async () => {
      if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
        const mockId = 'mock-thread-id-' + Date.now()
        setThreadId(mockId)
        return mockId
      }

      const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/get_thread_id`
        : '/api/get_thread_id'

      try {
        const res = await fetch(endpoint)
        if (res.ok) {
          const data = await res.json()
          if (data && typeof data === 'string') {
            setThreadId(data)
            return data
          } else if (data && data.thread_id) {
            setThreadId(data.thread_id)
            return data.thread_id as string
          }
        }
      } catch (e) {
        console.error('Failed to fetch thread ID', e)
      }
      return null
    }

    // 1. Check local storage first
    const stored = getStoredStatus()
    if (stored === 'ready') {
      setBackendStatus('ready')
      setIsCheckPending(false)
    } else {
      // 2. If not stored/expired, check immediately
      checkHealth()
      // 3. And start polling every 5s
      intervalIdRef.current = setInterval(checkHealth, 5000)
    }

    fetchThreadId()

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current)
      }
    }
  }, [])

  // Re-fetch thread ID if backend becomes ready and we don't have one
  useEffect(() => {
    if (backendStatus === 'ready' && !threadId) {
      const fetchAgain = async () => {
        const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL
          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/get_thread_id`
          : '/api/get_thread_id'
        try {
          const res = await fetch(endpoint)
          if (res.ok) {
            const data = await res.json()
            if (data && typeof data === 'string') setThreadId(data)
            else if (data && data.thread_id) setThreadId(data.thread_id)
          }
        } catch (e) { }
      }
      fetchAgain()
    }
  }, [backendStatus, threadId])


  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      // Reset height to auto to correctly calculate shrink
      inputRef.current.style.height = 'auto'
      const newHeight = inputRef.current.scrollHeight
      // Max height ~ 200px (more expansion)
      const maxHeight = 200

      inputRef.current.style.height = `${Math.min(newHeight, maxHeight)}px`
      inputRef.current.style.overflowY = newHeight > maxHeight ? 'auto' : 'hidden'
    }
  }, [query])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (backendStatus !== 'ready') return

    // Ensure threadId is present
    if (!threadId) {
      console.warn("Thread ID missing, attempting to fetch...")
      // We can't easily await here without refactoring `fetchThreadId` out of useEffect
      // But the useEffect above should catch it.
      // If still missing, we might want to block or show error.
      return
    }

    if (query.trim()) {
      onSearch(query.trim(), threadId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-between px-4 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 h-14 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-center z-40 md:hidden">
        <button
          onClick={onToggleSidebar}
          className="absolute left-4 p-2 -ml-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
        >
          <Menu size={20} />
        </button>
      </header>

      {/* Auto-detecting overlay */}
      {isAutoDetecting && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-500 fade-out duration-500">
          <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center">
                <div className="h-6 w-6 rounded-full border-[2px] border-[var(--accent)] border-t-transparent animate-spin opacity-80" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Selecting best model...</p>
              <p className="text-xs text-muted-foreground mt-1">Analyzing your query</p>
            </div>
          </div>
        </div>
      )}
      {/* Mouse-following glow — sits behind everything via z-0 */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-0 will-change-transform"
        style={{
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(32,178,170,0.12) 0%, rgba(32,178,170,0.04) 40%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Spacer for centering content properly */}
      <div className="flex-1 w-full flex flex-col items-center justify-center">
        {/* Content — sits above the glow */}
        <div className="relative z-10 flex flex-col items-center w-full">
          {/* Brand */}
          <div className="animate-fade-up mb-12 text-center">
            <h1 className="text-[2.5rem] sm:text-5xl font-light tracking-tight text-foreground lowercase">
              omni knows{' '}
              <span
                className="font-normal"
                style={{ color: '#20B2AA' }}
              >
                neo
              </span>
            </h1>
            <p className="mt-3 text-muted-foreground text-sm tracking-wide">
              Research anything. Get answers with sources.
            </p>
          </div>

          {/* Search Input */}
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[680px] animate-fade-up"
            style={{ animationDelay: '150ms' }}
          >
            <div
              className={`
                relative rounded-2xl bg-card transition-all duration-300
                ${isFocused
                  ? 'shadow-[0_0_0_1px_var(--accent),0_4px_24px_rgba(32,178,170,0.08)]'
                  : 'shadow-[0_0_0_1px_var(--border),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_var(--border),0_4px_16px_rgba(0,0,0,0.06)]'
                }
              `}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                disabled={backendStatus !== 'ready' || !threadId}
                placeholder={
                  backendStatus === 'ready'
                    ? (threadId ? "Ask anything..." : "Initializing session...")
                    : isCheckPending
                      ? "Connecting to brain..."
                      : "Backend is not ready, please wait..."
                }
                className={`w-full resize-none bg-transparent px-6 pt-5 pb-14 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar`}
                style={{ minHeight: '84px' }}
              />

              {/* Bottom bar */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!query.trim() || backendStatus !== 'ready' || !threadId}
                  className={`
                    flex items-center justify-center h-9 w-9 rounded-xl transition-all duration-200
                    ${query.trim() && backendStatus === 'ready'
                      ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }
                  `}
                  aria-label="Submit search"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>

          {/* Suggested queries */}
          <div
            className={`mt-8 flex flex-wrap justify-center gap-2 max-w-[680px] animate-fade-up ${backendStatus !== 'ready' ? 'opacity-50 pointer-events-none' : ''}`}
            style={{ animationDelay: '300ms' }}
          >
            {[
              'What is quantum computing?',
              'Latest AI breakthroughs in 2026',
              'How does mRNA vaccine work?',
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => threadId && onSearch(suggestion, threadId)}
                className="px-4 py-2 text-xs text-muted-foreground rounded-full border border-border bg-card hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Status */}
      <footer className="w-full py-6 flex flex-col gap-4 justify-center items-center animate-fade-up" style={{ animationDelay: '500ms' }}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full backdrop-blur-sm border border-border/50">
          <div className={`w-2 h-2 rounded-full ${backendStatus === 'ready' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
            backendStatus === 'not-ready' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
              'bg-gray-400'
            }`} />
          <span>
            {backendStatus === 'ready' ? 'System Operational' :
              backendStatus === 'not-ready' ? 'System Offline / Starting' :
                'Connecting...'}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground/60">
          <p>
            &copy; {new Date().getFullYear()} <a href="/" className="hover:text-foreground transition-colors">Omni Knows</a>. All rights reserved.
          </p>
          <p>
            Made with love by <a href="https://haozhe.li" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline decoration-border hover:decoration-foreground">Haozhe Li</a>
          </p>
        </div>
      </footer>
    </main>
  )
}
