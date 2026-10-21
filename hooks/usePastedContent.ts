import { useState, useCallback, useRef, type ClipboardEvent } from 'react'
import { toast } from 'sonner'
import { MAX_PASTED_CHARS, MAX_PASTED_ITEMS, shouldAttachPaste } from '@/lib/pasted-content'

export interface PastedItem {
    id: string
    text: string
}

export function usePastedContent() {
    const [pastedItems, setPastedItems] = useState<PastedItem[]>([])
    // Live count for back-to-back pastes in one tick (same reason as
    // sourceUrlsCountRef in search-home.tsx).
    const countRef = useRef(0)
    countRef.current = pastedItems.length

    const removePasted = useCallback((id: string) => {
        setPastedItems((prev) => prev.filter((p) => p.id !== id))
    }, [])

    const clearPasted = useCallback(() => {
        setPastedItems([])
    }, [])

    /**
     * Paste handler for a composer's textarea. Returns true when the paste was
     * taken as an attachment — the caller must then skip everything else it
     * does with pasted text (URL detection included: a link inside a long paste
     * belongs to that text, only links typed or pasted into the box are
     * sources).
     */
    const interceptPaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>): boolean => {
        const text = e.clipboardData?.getData('text') ?? ''
        if (!shouldAttachPaste(text)) return false
        e.preventDefault()
        if (countRef.current >= MAX_PASTED_ITEMS) {
            toast.error(`You can only attach up to ${MAX_PASTED_ITEMS} pasted blocks per message.`)
            return true
        }
        let body = text.replace(/\s+$/, '')
        if (body.length > MAX_PASTED_CHARS) {
            body = body.slice(0, MAX_PASTED_CHARS)
            toast.info(`Pasted text was trimmed to ${MAX_PASTED_CHARS.toLocaleString()} characters.`)
        }
        countRef.current += 1
        const id = `pasted-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        setPastedItems((prev) => [...prev, { id, text: body }])
        return true
    }, [])

    return { pastedItems, removePasted, clearPasted, interceptPaste }
}
