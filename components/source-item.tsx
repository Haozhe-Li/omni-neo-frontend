'use client'

import { useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/lib/types'
import { CredibilityTag } from '@/components/credibility-badge'

interface SourceItemProps {
    source: Source
    index: number
    /** Overrides the displayed number (e.g. the source's real citation number)
     * instead of the default `index + 1`. Used when sources are split into
     * groups and `index` no longer matches their original position. */
    label?: number
    /** Hides the numbered badge entirely. Defaults to shown. */
    showNumber?: boolean
}

function getSourceDomain(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return 'External source'
    }
}

export function SourceItem({ source, index, label, showNumber = true }: SourceItemProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const isDocument = !source.url

    return (
        <div
            onClick={() => source.content && setIsExpanded(!isExpanded)}
            className={`flex flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--paper-raised)] px-3.5 py-3 transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal-tint)] ${source.content ? 'cursor-pointer' : ''}`}
        >
            <div className="flex items-center gap-3">
                {showNumber && (
                    <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[6px] bg-[var(--teal-tint)] font-mono text-[11px] text-[var(--teal)]">
                        {label ?? index + 1}
                    </span>
                )}
                <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[var(--sand)]">
                    {isDocument ? (
                        <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={`https://www.google.com/s2/favicons?domain=${getSourceDomain(source.url)}&sz=64`}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    )}
                </div>
                <span
                    className="line-clamp-1 min-w-0 flex-1 text-[14px] text-[var(--ink)] transition-colors"
                >
                    {source.title}
                </span>
                <CredibilityTag credibility={source.credibility} />
                <div className="flex items-center gap-2">
                    {source.content && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsExpanded(!isExpanded)
                            }}
                            className="text-[12px] text-[var(--ink-muted)] underline underline-offset-2 transition-colors hover:text-[var(--teal)]"
                        >
                            {isExpanded ? 'Less' : 'More'}
                        </button>
                    )}
                    {isDocument ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                toast.info('This is a document you uploaded — it can\'t be opened as a link.')
                            }}
                            className="text-[var(--ink-fainter)] transition-colors hover:text-[var(--teal)]"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    ) : (
                        <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--ink-fainter)] transition-colors hover:text-[var(--teal)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    )}
                </div>
            </div>

            <div
                className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}
            >
                <div className="overflow-hidden">
                    <div className="custom-scrollbar max-h-60 overflow-y-auto whitespace-pre-wrap rounded-[12px] border border-[var(--line)] bg-[var(--sand)] p-3 font-mono text-[12px] leading-[1.65] text-[var(--ink-soft)]">
                        {source.content}
                    </div>
                </div>
            </div>
        </div>
    )
}
