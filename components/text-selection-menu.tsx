import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Copy, MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'

interface TextSelectionMenuProps {
    containerRef: React.RefObject<HTMLElement | null>
    showCheckSource?: boolean
    /**
     * Called with the selected text and the turn (assistant message index —
     * see `data-message-index` in chat-view.tsx) it was selected from. The
     * caller owns the actual `/check_source` request and result display
     * (the sources panel, in check-source mode) — this component only knows
     * about text selection, not the thread's sources state.
     */
    onCheckSource?: (text: string, turn: number) => void
    onFollowUp?: (text: string) => void
    allowedSelectors?: string[]
}

export function TextSelectionMenu({ containerRef, showCheckSource = true, onCheckSource, onFollowUp, allowedSelectors = [] }: TextSelectionMenuProps) {
    // We use ref-based positioning for performance (avoiding re-renders on scroll)
    const menuRef = useRef<HTMLDivElement>(null)

    // State for visibility and content controls
    const [isVisible, setIsVisible] = useState(false)
    const [selectedText, setSelectedText] = useState('')
    // We keep track of the range to query its current position during scroll
    const activeRangeRef = useRef<Range | null>(null)
    // Which assistant message (turn) the current selection lives in, resolved
    // from the closest `[data-message-index]` ancestor at selection time.
    const messageIndexRef = useRef<number | null>(null)

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

        const isNodeInAllowedScope = (node: Node | null) => {
            if (!node) return false
            if (!containerRef.current) return false
            if (allowedSelectors.length === 0) return true

            const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
            if (!element) return false

            return allowedSelectors.some((selector) => {
                try {
                    const matched = element.closest(selector)
                    return !!matched && containerRef.current?.contains(matched)
                } catch {
                    return false
                }
            })
        }

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

            if (!isNodeInAllowedScope(selection.anchorNode) || !isNodeInAllowedScope(selection.focusNode)) {
                setIsVisible(false)
                activeRangeRef.current = null
                return
            }

            activeRangeRef.current = selection.getRangeAt(0)
            setSelectedText(selection.toString().trim())

            const anchorEl =
                selection.anchorNode?.nodeType === Node.ELEMENT_NODE
                    ? (selection.anchorNode as Element)
                    : selection.anchorNode?.parentElement ?? null
            const messageEl = anchorEl?.closest('[data-message-index]')
            const rawIndex = messageEl?.getAttribute('data-message-index')
            messageIndexRef.current = rawIndex !== null && rawIndex !== undefined ? Number(rawIndex) : null

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
    }, [containerRef, allowedSelectors])

    const handleCopy = () => {
        navigator.clipboard.writeText(selectedText)
        toast.success('Copied to clipboard')
        setIsVisible(false)
        window.getSelection()?.removeAllRanges()
    }

    const handleCheckSource = () => {
        setIsVisible(false)
        const textToVerify = selectedText
        const turn = messageIndexRef.current
        window.getSelection()?.removeAllRanges()

        if (turn === null || !onCheckSource) {
            toast.error('Check source is unavailable here')
            return
        }

        onCheckSource(textToVerify, turn)
    }

    const handleFollowUp = () => {
        if (onFollowUp) {
            onFollowUp(selectedText)
        } else {
            toast.info('Ask Omni in Canvas Mode is coming soon!')
        }
        setIsVisible(false)
        window.getSelection()?.removeAllRanges()
    }

    const menuPortal = isVisible ? createPortal(
        <div
            ref={menuRef}
            onMouseDown={(e) => e.preventDefault()}
            role="dialog"
            aria-label="Text selection menu"
            className="fixed top-0 left-0 z-40 flex items-center gap-1 p-1.5 rounded-xl bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 backdrop-blur-sm transition-opacity duration-200"
            style={{
                willChange: 'transform, opacity',
                opacity: 0 // Start invisible to prevent flash
            }}
        >
            {showCheckSource && (
                <>
                    <MenuButton
                        onClick={handleCheckSource}
                        icon={<BookOpen className="w-3.5 h-3.5" />}
                        label="Check source"
                    />
                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
                </>
            )}
            <MenuButton
                onClick={handleFollowUp}
                icon={<MessageSquarePlus className="w-3.5 h-3.5" />}
                label="Ask Omni"
            />
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <MenuButton
                onClick={handleCopy}
                icon={<Copy className="w-3.5 h-3.5" />}
                label="Copy"
            />

        </div>,
        document.body
    ) : null

    return menuPortal
}

function MenuButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 rounded-lg transition-colors text-xs font-semibold whitespace-nowrap"
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}
