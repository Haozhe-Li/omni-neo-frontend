'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Check, Share2, ThumbsUp, ThumbsDown, RotateCcw, Zap, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentMode, Source } from '@/lib/types'
import { extractCitedNumbers, partitionSources } from '@/lib/markdown'

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function IconBtn({
  onClick,
  title,
  children,
  active,
}: {
  onClick?: () => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
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
  /** This message's own fetched sources (not the thread-wide merged list) — the only valid fallback when the answer cites nothing. */
  ownSources?: Source[]
  onOpenSources?: (sources: Source[], citedNumbers: Set<number>) => void
  onRegenerate?: (mode: AgentMode) => void
  isLastMessage?: boolean
  regeneratedWith?: AgentMode
}

export function AnswerFooter({ content, sources, ownSources, onOpenSources, onRegenerate, isLastMessage, regeneratedWith }: AnswerFooterProps) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const regenRef = useRef<HTMLDivElement>(null)
  // Which source numbers the answer text actually cites inline (`[n]`), so the
  // sources panel can separate those from sources that were merely fetched.
  const citedNumbers = useMemo(() => extractCitedNumbers(content), [content])
  // `sources` is the thread-wide accumulated list (citations can reach
  // earlier turns), so the footer badge shows only what THIS answer actually
  // cites rather than every source fetched across the whole conversation.
  const { used: usedSources, split } = useMemo(
    () => partitionSources(sources ?? [], citedNumbers),
    [sources, citedNumbers]
  )
  // Fall back to this message's OWN fetched sources (not the thread-wide
  // `sources` list) when it cites nothing inline — e.g. legacy sources saved
  // before `n` was tracked. Falling back to the thread-wide list here would
  // resurface every earlier turn's sources on messages that fetched none of
  // their own (e.g. a plain "hi" reply after a sourced turn).
  const badgeSources = split && usedSources.length > 0 ? usedSources.map((u) => u.source) : ownSources ?? []
  // Panel gets the full thread-wide list when split (so it can still show the
  // "fetched but unused" section for this answer's citations); otherwise the
  // same own-sources fallback the badge uses.
  const sourcesForPanel = split && usedSources.length > 0 ? sources ?? [] : ownSources ?? []
  const hasSources = badgeSources.length > 0

  // Close regen dropdown on outside click
  useEffect(() => {
    if (!regenOpen) return
    const handler = (e: MouseEvent) => {
      if (regenRef.current && !regenRef.current.contains(e.target as Node)) {
        setRegenOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [regenOpen])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleLike = () => { setLiked(true); setDisliked(false) }
  const handleDislike = () => { setDisliked(true); setLiked(false) }

  return (
    <div className="mt-4">
      {regeneratedWith && (
        <p className="mb-1.5 text-[11px] text-[var(--muted-foreground)]/60 select-none">
          Regenerated with {regeneratedWith === 'pro' ? 'Pro' : 'Fast'} mode
        </p>
      )}
      <div className="flex items-center gap-1 pt-2">
        <IconBtn onClick={handleCopy} title="Copy">
          {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
        </IconBtn>
        <IconBtn title="Share">
          <Share2 size={16} strokeWidth={1.75} />
        </IconBtn>

        {/* Regenerate — only on the last assistant message */}
        {isLastMessage && onRegenerate && (
          <div className="relative" ref={regenRef}>
            <IconBtn onClick={() => setRegenOpen((v) => !v)} title="Regenerate">
              <RotateCcw size={16} strokeWidth={1.75} />
            </IconBtn>
            {regenOpen && (
              <div className="absolute left-0 bottom-full mb-2 w-52 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <p className="px-3 pt-1 pb-2 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
                  Regenerate with
                </p>
                {([
                  { value: 'fast' as AgentMode, label: 'Fast', desc: 'Quick · unlimited', Icon: Zap },
                  { value: 'pro' as AgentMode, label: 'Pro', desc: 'Deep agent · charts & reports', Icon: Sparkles },
                ] as const).map(({ value, label, desc, Icon }) => (
                  <button
                    key={value}
                    onClick={() => { setRegenOpen(false); onRegenerate(value) }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--secondary)]/60 transition-colors"
                  >
                    <Icon size={15} strokeWidth={1.75} className="shrink-0 text-[var(--muted-foreground)]" />
                    <div>
                      <div className="text-[13px] font-medium text-[var(--foreground)] leading-none mb-0.5">{label}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {hasSources && (
          <button
            onClick={() => onOpenSources?.(sourcesForPanel, citedNumbers)}
            className="ml-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] transition-all duration-200 active:scale-95"
          >
            <span className="flex -space-x-1.5">
              {badgeSources.slice(0, 4).map((s, i) => (
                <span key={i} className="h-4 w-4 rounded-full ring-1 ring-[var(--background)] overflow-hidden bg-[var(--secondary)] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://www.google.com/s2/favicons?domain=${domainOf(s.url)}&sz=64`} alt="" className="h-full w-full object-cover" />
                </span>
              ))}
            </span>
            <span>
              {badgeSources.length} source{badgeSources.length > 1 ? 's' : ''}
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
        </div>
      </div>
    </div>
  )
}
