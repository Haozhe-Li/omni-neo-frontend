'use client'

import { useState } from 'react'
import { Copy, Check, Share2, ThumbsUp, ThumbsDown, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type { Source } from '@/lib/types'

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function IconBtn({ onClick, title, children }: { onClick?: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors duration-200"
    >
      {children}
    </button>
  )
}

interface AnswerFooterProps {
  content: string
  sources?: Source[]
  onOpenSources?: (sources: Source[]) => void
}

export function AnswerFooter({ content, sources, onOpenSources }: AnswerFooterProps) {
  const [copied, setCopied] = useState(false)
  const hasSources = !!sources && sources.length > 0

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    toast.success('Copied')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-0.5 border-t border-[var(--border-subtle)] pt-2">
        <IconBtn onClick={handleCopy} title="Copy">
          {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
        </IconBtn>
        <IconBtn onClick={() => toast.info('Sharing coming soon')} title="Share">
          <Share2 size={16} strokeWidth={1.75} />
        </IconBtn>

        {hasSources && (
          <button
            onClick={() => onOpenSources?.(sources!)}
            className="ml-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors duration-200"
          >
            <span className="flex -space-x-1.5">
              {sources!.slice(0, 4).map((s, i) => (
                <span key={i} className="h-4 w-4 rounded-full ring-1 ring-[var(--background)] overflow-hidden bg-[var(--secondary)] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://www.google.com/s2/favicons?domain=${domainOf(s.url)}&sz=64`} alt="" className="h-full w-full object-cover" />
                </span>
              ))}
            </span>
            <span>
              {sources!.length} source{sources!.length > 1 ? 's' : ''}
            </span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn onClick={() => toast.success('Thanks for the feedback')} title="Good response">
            <ThumbsUp size={16} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn onClick={() => toast.success('Thanks for the feedback')} title="Bad response">
            <ThumbsDown size={16} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn onClick={() => toast.info('More options coming soon')} title="More">
            <MoreHorizontal size={16} strokeWidth={1.75} />
          </IconBtn>
        </div>
      </div>
    </div>
  )
}
