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

function IconBtn({ onClick, title, children, active }: { onClick?: () => void; title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-full hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] transition-all duration-200 active:scale-95 ${
        active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
      }`}
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
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const hasSources = !!sources && sources.length > 0

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleLike = () => {
    setLiked(true)
    setDisliked(false)
  }

  const handleDislike = () => {
    setDisliked(true)
    setLiked(false)
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1 pt-2">
        <IconBtn onClick={handleCopy} title="Copy">
          {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
        </IconBtn>
        <IconBtn title="Share">
          <Share2 size={16} strokeWidth={1.75} />
        </IconBtn>

        {hasSources && (
          <button
            onClick={() => onOpenSources?.(sources!)}
            className="ml-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] transition-all duration-200 active:scale-95"
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

        <div className="ml-auto flex items-center gap-1">
          <IconBtn onClick={handleLike} active={liked} title="Good response">
            <ThumbsUp size={16} strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} />
          </IconBtn>
          <IconBtn onClick={handleDislike} active={disliked} title="Bad response">
            <ThumbsDown size={16} strokeWidth={1.75} fill={disliked ? 'currentColor' : 'none'} />
          </IconBtn>
          <IconBtn title="More">
            <MoreHorizontal size={16} strokeWidth={1.75} />
          </IconBtn>
        </div>
      </div>
    </div>
  )
}
