'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Source } from '@/lib/types'

interface SourceItemProps {
    source: Source
    index: number
}

export function SourceItem({ source, index }: SourceItemProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <div
            onClick={() => source.content && setIsExpanded(!isExpanded)}
            className={`flex flex-col gap-2 rounded-lg border border-border/40 bg-card p-3 transition-colors hover:bg-accent/5 ${source.content ? 'cursor-pointer' : ''}`}
        >
            <div className="flex items-center gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-accent/10 text-[10px] font-mono font-medium text-accent">
                    {index + 1}
                </span>
                <span
                    className="flex-1 min-w-0 text-sm text-foreground hover:text-accent transition-colors line-clamp-1 font-medium"
                >
                    {source.title}
                </span>
                <div className="flex items-center gap-2">
                    {source.content && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsExpanded(!isExpanded)
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                        >
                            {isExpanded ? 'Less' : 'More'}
                        </button>
                    )}
                    <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground/40 hover:text-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>
            </div>

            <div
                className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}
            >
                <div className="overflow-hidden">
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 font-mono leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar border border-border/20">
                        {source.content}
                    </div>
                </div>
            </div>
        </div>
    )
}
