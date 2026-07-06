'use client'

import { useRef, useEffect, useCallback, type ReactNode } from 'react'
import Link from 'next/link'

interface ThreadStatusScreenProps {
  title: string
  description: string
  primaryAction: { label: string; onClick: () => void }
  secondaryAction?: { label: string; href: string }
  icon?: ReactNode
}

// Branded full-screen state (loading / not-found / no-access / error) for the
// /thread/[id] route. Visually mirrors app/not-found.tsx so these read as the
// same family of "nothing to show here" screens as the rest of the site.
export function ThreadStatusScreen({ title, description, primaryAction, secondaryAction, icon }: ThreadStatusScreenProps) {
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

  return (
    <main className="relative min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 overflow-hidden bg-background font-[family-name:var(--font-plex)] selection:bg-accent/20">
      <style jsx global>{`
        @keyframes thread-status-drift {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(5%, 5%) scale(1.1); }
          100% { transform: translate(-2%, -3%) scale(1); }
        }
        .animate-thread-status-drift {
          animation: thread-status-drift 15s ease-in-out infinite alternate;
        }
      `}</style>

      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -inset-[50%] opacity-[0.05] dark:opacity-[0.1] animate-thread-status-drift"
          style={{
            background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 60%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

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

      <div className="relative z-10 flex flex-col items-center text-center max-w-md mx-auto">
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out flex flex-col items-center">
          {icon && (
            <div className="mb-5 flex items-center justify-center size-11 rounded-full bg-secondary/80 border border-border/50 text-muted-foreground">
              {icon}
            </div>
          )}
          <h1 className="text-xl font-medium tracking-tight text-foreground mb-1">{title}</h1>
          <p className="text-[13px] text-muted-foreground/80 font-normal mb-10 text-balance">{description}</p>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 delay-300 duration-700 ease-out fill-mode-both flex items-center gap-3">
          <button
            onClick={primaryAction.onClick}
            className="inline-flex items-center justify-center px-6 py-2 rounded-full bg-secondary/80 hover:bg-secondary text-[13px] font-medium text-foreground transition-all duration-300 border border-border/50 hover:border-border"
          >
            {primaryAction.label}
          </button>
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground transition-all duration-300"
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      </div>

      <div className="absolute bottom-12 text-[10px] text-muted-foreground/30 tracking-[0.2em] uppercase font-light">
        Omni Knows
      </div>
    </main>
  )
}
