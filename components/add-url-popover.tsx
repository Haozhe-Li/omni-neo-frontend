'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type ChangeEvent, type KeyboardEvent } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import { MAX_SOURCE_URLS, normalizeUrl, extractUrls } from '@/hooks/useSourceUrls'

export interface AddUrlPopoverProps {
    /** How many source URLs are already attached to this turn — bounds how many lines this popover can add. */
    existingCount: number
    onAdd: (urls: string[]) => void
    onClose: () => void
    className?: string
}

// One text line = one fixed-height row, so the status gutter beside the
// textarea can line up with it without measuring anything.
const ROW_PX = 30
const MIN_ROWS = 4
const MAX_ROWS = 8
// The textarea's vertical padding, mirrored on the gutter.
const PAD_PX = 8

type LineState = 'empty' | 'ok' | 'bad' | 'dup' | 'over'

// What the gutter and the footer need to know about each line.
interface ParsedLine {
    state: LineState
    raw: string
}

// `normalizeUrl` accepts a bare word ("wiki" -> https://wiki/), which is
// never what someone pasting a link meant.
function isLink(raw: string): boolean {
    if (/\s/.test(raw)) return false
    const url = normalizeUrl(raw)
    if (!url) return false
    try {
        return new URL(url).hostname.includes('.')
    } catch {
        return false
    }
}

/**
 * The panel behind the + menu's "Add URL" row: one textarea, one link per
 * line. Pasting links starts each on its own line; typing a full `https://…`
 * link followed by a space does the same. Each line is checked as it lands
 * (tick / not-a-link / over the limit) and only the good ones are added.
 * See search-home.tsx / chat-view.tsx for where this is mounted.
 */
export function AddUrlPopover({ existingCount, onAdd, onClose, className = '' }: AddUrlPopoverProps) {
    const remaining = Math.max(0, MAX_SOURCE_URLS - existingCount)
    const [text, setText] = useState('')
    // Lines that just landed from a paste / auto-newline, tinted briefly so the
    // eye can follow where the links went.
    const [flash, setFlash] = useState<[number, number] | null>(null)
    const [scrollTop, setScrollTop] = useState(0)
    const taRef = useRef<HTMLTextAreaElement>(null)
    // A caret position to restore after the next render. The textarea is
    // controlled, so a value we set programmatically would otherwise throw the
    // caret to the end of the text.
    const caretRef = useRef<number | null>(null)

    useLayoutEffect(() => {
        if (caretRef.current != null && taRef.current) {
            taRef.current.setSelectionRange(caretRef.current, caretRef.current)
            caretRef.current = null
        }
    }, [text])

    useEffect(() => {
        if (!flash) return
        const t = setTimeout(() => setFlash(null), 900)
        return () => clearTimeout(t)
    }, [flash])

    const lines = useMemo(() => text.split('\n'), [text])

    const parsed: ParsedLine[] = useMemo(() => {
        const seen = new Set<string>()
        let ok = 0
        return lines.map((line) => {
            const raw = line.trim()
            if (!raw) return { state: 'empty', raw }
            if (!isLink(raw)) return { state: 'bad', raw }
            const url = normalizeUrl(raw)!
            if (seen.has(url)) return { state: 'dup', raw }
            seen.add(url)
            if (ok >= remaining) return { state: 'over', raw }
            ok++
            return { state: 'ok', raw }
        })
    }, [lines, remaining])

    const okLines = parsed.filter((l) => l.state === 'ok')
    const badIdx = parsed.flatMap((l, i) => (l.state === 'bad' ? [i + 1] : []))
    const overCount = parsed.filter((l) => l.state === 'over').length
    const dupCount = parsed.filter((l) => l.state === 'dup').length

    /** Puts `value` in the box with the caret at `caret`, and tints `lineRange` (0-based, inclusive). */
    const commit = (value: string, caret: number, lineRange?: [number, number]) => {
        caretRef.current = caret
        setText(value)
        if (lineRange) setFlash(lineRange)
    }

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const pasted = e.clipboardData.getData('text')
        if (!pasted) return
        // Every explicit link in the clipboard, in order. Anything around them
        // (a sentence, a markdown bullet) is dropped — it isn't part of the link.
        // `extractUrls` stops at whitespace, so a link ending a clause drags its
        // punctuation along ("…/Black_hole," in running text).
        let items = extractUrls(pasted).map((u) => u.replace(/[.,;:!?]+$/, ''))
        // No scheme anywhere: a multi-line paste of bare domains / junk is still
        // one-per-line; a single token is left to the browser's own paste.
        if (items.length === 0) {
            const rows = pasted.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
            if (rows.length < 2) return
            items = rows
        }
        e.preventDefault()
        const el = e.currentTarget
        const start = el.selectionStart
        const end = el.selectionEnd
        const before = text.slice(0, start)
        const after = text.slice(end)
        // Always start on a fresh line, and leave the caret on a fresh one.
        const lead = before === '' || before.endsWith('\n') ? '' : '\n'
        const inserted = lead + items.join('\n') + '\n'
        const next = before + inserted + after.replace(/^\n/, '')
        const firstLine = before.split('\n').length - 1 + (lead ? 1 : 0)
        commit(next, before.length + inserted.length, [firstLine, firstLine + items.length - 1])
    }

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        const caret = e.target.selectionStart
        const native = e.nativeEvent as InputEvent
        // A space typed right after a complete https:// link ends that link:
        // swap the space for a line break. Scheme required — "e.g. " or "v3.5 "
        // in ordinary typing must never be taken for one.
        if (native.inputType === 'insertText' && native.data === ' ') {
            const lineStart = value.lastIndexOf('\n', caret - 2) + 1
            const line = value.slice(lineStart, caret - 1)
            if (/^\s*https?:\/\/\S+$/i.test(line) && value[caret] !== '\n') {
                const next = value.slice(0, caret - 1) + '\n' + value.slice(caret)
                const lineIdx = value.slice(0, lineStart).split('\n').length - 1
                commit(next, caret, [lineIdx, lineIdx])
                return
            }
        }
        setText(value)
    }

    const confirm = () => {
        if (okLines.length === 0) return
        onAdd(okLines.map((l) => l.raw))
        onClose()
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            confirm()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    if (remaining === 0) {
        return (
            <div className={`p-4 text-sm text-[var(--ink-muted)] ${className}`}>
                You&apos;ve reached the limit of {MAX_SOURCE_URLS} URLs for this turn.
            </div>
        )
    }

    const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, lines.length))
    const boxHeight = rows * ROW_PX + PAD_PX * 2

    let status: { tone: 'muted' | 'ok' | 'warn'; text: string }
    if (badIdx.length > 0) {
        status = {
            tone: 'warn',
            text:
                badIdx.length === 1
                    ? `Line ${badIdx[0]} isn’t a link and will be skipped`
                    : `${badIdx.length} lines aren’t links and will be skipped`,
        }
    } else if (overCount > 0) {
        status = { tone: 'warn', text: 'Limit reached. Extra links won’t be added.' }
    } else if (dupCount > 0) {
        status = { tone: 'muted', text: `${dupCount} duplicate${dupCount === 1 ? '' : 's'} will be skipped` }
    } else if (okLines.length > 0) {
        status = { tone: 'ok', text: `${okLines.length} link${okLines.length === 1 ? '' : 's'} recognized` }
    } else {
        status = { tone: 'muted', text: 'Paste or type a link. Each one lands on its own line.' }
    }

    return (
        <div className={`p-4 ${className}`}>
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
                <div className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--ink)]">Add URL</span>
                    <span className="block text-xs text-[var(--ink-muted)]">Pages Omni should prioritize reading</span>
                </div>
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-[var(--ink-faint)]">
                    {existingCount + okLines.length} / {MAX_SOURCE_URLS}
                </span>
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--paper)] transition-[border-color,box-shadow] focus-within:border-[var(--teal)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--teal)_14%,transparent)]"
                style={{ height: boxHeight }}
            >
                {/* Status rows: one fixed-height cell per line, scrolled in step
                    with the textarea so each icon stays beside its own line. */}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ transform: `translateY(${PAD_PX - scrollTop}px)` }}>
                    {lines.map((_, i) => {
                        const st = parsed[i].state
                        const lit = flash && i >= flash[0] && i <= flash[1]
                        return (
                            <div
                                key={i}
                                className={`mx-2 flex items-center rounded-lg pl-1.5 transition-colors duration-700 ${lit ? 'bg-[color-mix(in_srgb,var(--teal)_9%,transparent)]' : ''}`}
                                style={{ height: ROW_PX }}
                            >
                                {st === 'ok' && <Check size={15} strokeWidth={2.25} className="text-[var(--teal)]" />}
                                {st === 'bad' && <CircleAlert size={15} className="text-[var(--rust)]" />}
                                {(st === 'over' || st === 'dup') && <CircleAlert size={15} className="text-[var(--ink-faint)]" />}
                            </div>
                        )
                    })}
                </div>
                <textarea
                    ref={taRef}
                    autoFocus
                    wrap="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={text}
                    onChange={handleChange}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                    placeholder="Paste links here, one will go on each line"
                    aria-label="Links to add, one per line"
                    className="relative block h-full w-full resize-none overflow-x-hidden bg-transparent pr-4 text-[14.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
                    style={{ paddingTop: PAD_PX, paddingBottom: PAD_PX, paddingLeft: 40, lineHeight: `${ROW_PX}px` }}
                />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 px-1">
                <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--ink-muted)]" aria-live="polite">
                    {status.tone === 'ok' && <Check size={13} strokeWidth={2.25} className="shrink-0 text-[var(--teal)]" />}
                    {status.tone === 'warn' && <CircleAlert size={13} className="shrink-0 text-[var(--rust)]" />}
                    <span className="truncate">{status.text}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={okLines.length === 0}
                        className="rounded-full bg-[var(--teal)] px-4 py-2 text-[13px] font-medium text-[var(--paper)] transition-colors hover:bg-[var(--teal-hover)] disabled:cursor-not-allowed disabled:bg-[var(--sand)] disabled:text-[var(--ink-faint)]"
                    >
                        {okLines.length > 0 ? `Add ${okLines.length} link${okLines.length === 1 ? '' : 's'}` : 'Add'}
                    </button>
                </div>
            </div>
        </div>
    )
}
