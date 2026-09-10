'use client'

import { useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'

export default function NotFound() {
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
        <main className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-background px-4">
            {/* Background Gradient Animation */}
            <style jsx global>{`
        @keyframes drift {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(5%, 5%) scale(1.1); }
          100% { transform: translate(-2%, -3%) scale(1); }
        }
        .animate-drift {
          animation: drift 15s ease-in-out infinite alternate;
        }
      `}</style>

            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div
                    className="absolute -inset-[50%] opacity-[0.05] dark:opacity-[0.1] animate-drift"
                    style={{
                        background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 60%)',
                        filter: 'blur(100px)',
                    }}
                />
            </div>

            {/* Mouse-following cyan glow — replicated from SearchHome UI */}
            <div
                ref={glowRef}
                aria-hidden="true"
                className="pointer-events-none fixed top-0 left-0 z-0 will-change-transform"
                style={{
                    width: '600px',
                    height: '600px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, color-mix(in srgb, var(--teal) 10%, transparent) 0%, color-mix(in srgb, var(--teal) 3%, transparent) 40%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-md mx-auto">
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
                    <h1 className="omni-display mb-2.5 text-[38px] text-[var(--ink)]">
                        Page not found
                    </h1>
                    <p className="mb-10 text-[15px] leading-[1.65] text-[var(--ink-muted)]">
                        Error 404. Check the address and try again.
                    </p>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-4 delay-300 duration-700 ease-out fill-mode-both">
                    <Link
                        href="/"
                        className="omni-pill omni-pill-solid px-6 py-2.5 text-[14px]"
                    >
                        Return home
                    </Link>
                </div>
            </div>
        </main>
    )
}
