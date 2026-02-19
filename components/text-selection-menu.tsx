import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Copy, MessageSquarePlus, X, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/lib/types'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface TextSelectionMenuProps {
    containerRef: React.RefObject<HTMLElement | null>
    sources?: Source[]
}

export function TextSelectionMenu({ containerRef, sources = [] }: TextSelectionMenuProps) {
    // We use ref-based positioning for performance (avoiding re-renders on scroll)
    const menuRef = useRef<HTMLDivElement>(null)

    // State for visibility and content controls
    const [isVisible, setIsVisible] = useState(false)
    const [selectedText, setSelectedText] = useState('')
    // We keep track of the range to query its current position during scroll
    const activeRangeRef = useRef<Range | null>(null)
    const [verifiedSource, setVerifiedSource] = useState<Source | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

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

    const handleCopy = () => {
        navigator.clipboard.writeText(selectedText)
        toast.success('Copied to clipboard')
        setIsVisible(false)
        window.getSelection()?.removeAllRanges()
    }

    const handleCheckSource = async () => {
        setIsVisible(false)
        const textToVerify = selectedText
        window.getSelection()?.removeAllRanges()

        const toastId = toast.loading('Checking source...')

        try {
            const apiEndpoint = process.env.NEXT_PUBLIC_BACKEND_URL
                ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/check_source`
                : '/api/check_source'

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text_selection: textToVerify,
                    source: {
                        final_sources: sources
                    }
                }),
            })

            if (!response.ok) throw new Error('Failed to verify source')

            const data = await response.json()
            toast.dismiss(toastId)

            if (data && data.title) {
                // Found a matching source
                setVerifiedSource(data)
            } else {
                // No matching source found
                setVerifiedSource(null)
            }
            setIsDialogOpen(true)

        } catch (error) {
            console.error('Check source error:', error)
            toast.dismiss(toastId)
            toast.error('Failed to check source')
        }
    }

    const handleFollowUp = () => {
        toast.info('Follow up feature is coming soon!')
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
            <MenuButton
                onClick={handleCheckSource}
                icon={<BookOpen className="w-3.5 h-3.5" />}
                label="Check source"
            />
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <MenuButton
                onClick={handleFollowUp}
                icon={<MessageSquarePlus className="w-3.5 h-3.5" />}
                label="Follow up"
            />
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <MenuButton
                onClick={handleCopy}
                icon={<Copy className="w-3.5 h-3.5" />}
                label="Copy"
            />

            {/* Arrow pointing down */}
            <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white dark:border-t-zinc-900 drop-shadow-sm"
            />
        </div>,
        document.body
    ) : null

    return (
        <>
            {menuPortal}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden outline-none">
                    <DialogHeader className="px-6 py-4 border-b border-border/50 shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                            <BookOpen className={`h-5 w-5 ${verifiedSource ? 'text-accent' : 'text-muted-foreground'}`} />
                            {verifiedSource ? 'Source Verified' : 'No Match Found'}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {verifiedSource ? 'Details of the verified source' : 'No matching source found in the provided references'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        <ScrollArea className="flex-1 h-full">
                            {verifiedSource ? (
                                <div className="px-6 py-6 flex flex-col gap-6">
                                    {/* Title & Link */}
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Source Title</span>
                                        <a
                                            href={verifiedSource.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-2 text-lg font-medium text-foreground hover:text-accent transition-colors leading-tight group"
                                        >
                                            {verifiedSource.title}
                                            <ExternalLink className="h-4 w-4 mt-1 opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                        </a>
                                    </div>

                                    {/* Content */}
                                    {verifiedSource.content && (
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Passage Context</span>
                                            <div className="bg-muted/30 rounded-lg p-5 border border-border/40 font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/90 select-text">
                                                {verifiedSource.content}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="px-6 py-12 flex flex-col items-center justify-center text-center gap-4 h-full">
                                    <div className="p-4 rounded-full bg-muted/50">
                                        <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                                    </div>
                                    <div className="max-w-md space-y-2">
                                        <h3 className="text-lg font-medium text-foreground">No Matching Source</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            The selected text could not be directly matched to any of the provided sources. This might be a synthesis / translation of multiple sources or general knowledge.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
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
