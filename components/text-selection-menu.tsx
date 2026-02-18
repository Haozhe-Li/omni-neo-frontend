import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Copy, MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'

interface TextSelectionMenuProps {
    containerRef: React.RefObject<HTMLElement | null>
}

export function TextSelectionMenu({ containerRef }: TextSelectionMenuProps) {
    // We use ref-based positioning for performance (avoiding re-renders on scroll)
    const menuRef = useRef<HTMLDivElement>(null)

    // State for visibility and content controls
    const [isVisible, setIsVisible] = useState(false)
    const [selectedText, setSelectedText] = useState('')
    // We keep track of the range to query its current position during scroll
    const activeRangeRef = useRef<Range | null>(null)

    // Use useLayoutEffect to prevent initial flash at 0,0 by updating position before paint
    useLayoutEffect(() => {
        if (!isVisible || !menuRef.current || !activeRangeRef.current) return

        const updatePosition = () => {
            if (!menuRef.current || !activeRangeRef.current) return

            const rect = activeRangeRef.current.getBoundingClientRect()
            if (rect.width === 0 && rect.height === 0) return

            const x = rect.left + rect.width / 2
            const y = rect.top - 10

            menuRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`
            menuRef.current.style.opacity = '1' // Fade in after position is set
        }

        // Initial position update
        updatePosition()

        // Scroll/Resize listener
        const handleScrollOrResize = () => requestAnimationFrame(updatePosition)

        window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true })
        window.addEventListener('resize', handleScrollOrResize, { passive: true })

        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, { capture: true } as any)
            window.removeEventListener('resize', handleScrollOrResize)
        }
    }, [isVisible])

    useEffect(() => {
        const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches
        if (!isDesktop) return

        const handleSelectionChange = () => {
            // ... logic same as before ... 
            const selection = window.getSelection()
            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                setIsVisible(false)
                activeRangeRef.current = null
                return
            }
            if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) {
                setIsVisible(false)
                activeRangeRef.current = null
                return
            }

            activeRangeRef.current = selection.getRangeAt(0)
            setSelectedText(selection.toString().trim())
            setIsVisible(true)
        }

        const handleMouseUp = () => setTimeout(handleSelectionChange, 10)
        const handleMouseDown = (e: MouseEvent) => {
            if (menuRef.current && menuRef.current.contains(e.target as Node)) return
            setIsVisible(false)
            activeRangeRef.current = null
        }
        const handleDocSelectionChange = () => {
            const s = window.getSelection()
            if (!s || s.isCollapsed) {
                setIsVisible(false)
                activeRangeRef.current = null
            }
        }

        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('mousedown', handleMouseDown)
        document.addEventListener('selectionchange', handleDocSelectionChange)

        return () => {
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('mousedown', handleMouseDown)
            document.removeEventListener('selectionchange', handleDocSelectionChange)
        }
    }, [containerRef])

    if (!isVisible) return null

    const handleCopy = () => {
        navigator.clipboard.writeText(selectedText)
        toast.success('Copied to clipboard')
        setIsVisible(false)
        window.getSelection()?.removeAllRanges()
    }

    const handleCheckSource = () => {
        toast.info('Check source feature is coming soon!')
        setIsVisible(false)
        window.getSelection()?.removeAllRanges()
    }

    const handleFollowUp = () => {
        toast.info('Follow up feature is coming soon!')
        setIsVisible(false)
        window.getSelection()?.removeAllRanges()
    }

    return createPortal(
        <div
            ref={menuRef}
            onMouseDown={(e) => e.preventDefault()}
            role="dialog"
            aria-label="Text selection menu"
            className="fixed top-0 left-0 z-40 flex items-center gap-1 p-1 rounded-lg bg-zinc-700 text-zinc-50 dark:bg-foreground/90 dark:text-background shadow-xl backdrop-blur-sm transition-opacity duration-200"
            style={{
                willChange: 'transform, opacity',
                opacity: 0 // Start invisible to prevent flash
            }}
        >
            <MenuButton
                onClick={handleCheckSource}
                icon={<BookOpen className="w-3.5 h-3.5" />}
                label="Check source"
            />
            <div className="w-px h-3.5 bg-zinc-600 dark:bg-background/20 mx-0.5" />
            <MenuButton
                onClick={handleFollowUp}
                icon={<MessageSquarePlus className="w-3.5 h-3.5" />}
                label="Follow up"
            />
            <div className="w-px h-3.5 bg-zinc-600 dark:bg-background/20 mx-0.5" />
            <MenuButton
                onClick={handleCopy}
                icon={<Copy className="w-3.5 h-3.5" />}
                label="Copy"
            />

            {/* Arrow pointing down */}
            <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-zinc-700 dark:border-t-foreground/90"
            />
        </div>,
        document.body
    )
}

function MenuButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-zinc-700 dark:hover:bg-background/20 rounded-md transition-colors text-xs font-medium whitespace-nowrap"
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}
